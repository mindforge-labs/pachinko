import { randomUUID } from 'node:crypto';
import { validateSpecificationCompatibility } from './compatibility';
import { saveCheckpoint, loadCheckpoint } from './checkpoint';
import { CommandRunner } from './command-runner';
import { PipelineError, isPipelineError } from './errors';
import type { ProjectGenerationModel } from './model';
import { buildArchitecturePlanningPrompt } from './prompts/architecture';
import { buildBatchGenerationPrompt } from './prompts/batch';
import { assertRepairBudget, runRepairLoop } from './repair';
import { buildFinalReport, deriveFinalStatus } from './report';
import { buildProjectSpecification, type BuildSpecificationInput } from './specification';
import type {
  ArchitecturePlan,
  CommandResult,
  FinalProjectReport,
  GenerationMode,
  PipelineCheckpoint,
  PipelineRunLog,
  PipelineStage,
  ProjectSpecification,
  RepairPolicy,
  StackCompatibilityResult,
  VerificationResult,
} from './types';
import { defaultRepairPolicy } from './types';
import { VerificationRunner } from './verification';
import { createIsolatedWorkspace, WorkspaceManager } from './workspace';

export type PipelineOrchestratorOptions = {
  model: ProjectGenerationModel;
  workspaceBaseDir: string;
  mode?: GenerationMode;
  repairPolicy?: RepairPolicy;
  autoApprovePlan?: boolean;
  executeVerification?: boolean;
  runId?: string;
};

export type PipelineStartInput = BuildSpecificationInput;

const ALLOWED_TRANSITIONS: Record<PipelineStage, PipelineStage[]> = {
  initializing: ['analyzing', 'failed', 'cancelled'],
  analyzing: ['validating_stack', 'failed', 'cancelled'],
  validating_stack: ['planning', 'failed', 'cancelled'],
  planning: ['awaiting_plan_approval', 'generating_batch', 'failed', 'cancelled'],
  awaiting_plan_approval: ['generating_batch', 'cancelled', 'failed'],
  generating_batch: ['writing_files', 'failed', 'cancelled'],
  writing_files: ['verifying_batch', 'generating_batch', 'final_verification', 'failed', 'cancelled'],
  verifying_batch: ['repairing', 'generating_batch', 'final_verification', 'failed', 'cancelled'],
  repairing: ['verifying_batch', 'failed', 'cancelled'],
  final_verification: ['completed', 'repairing', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export class PipelineOrchestrator {
  private stage: PipelineStage = 'initializing';
  private cancelled = false;
  private readonly runId: string;
  private readonly repairPolicy: RepairPolicy;
  private specification?: ProjectSpecification;
  private compatibility?: StackCompatibilityResult;
  private architecturePlan?: ArchitecturePlan;
  private workspace?: WorkspaceManager;
  private commandRunner?: CommandRunner;
  private completedBatchIds: string[] = [];
  private currentBatchId?: string;
  private repairAttempts = 0;
  private verificationResults: VerificationResult[] = [];
  private commandsExecuted: CommandResult[] = [];
  private filesApplied: Array<{ path: string; operation: string; batchId: string }> = [];
  private batchSummaries: Array<{ batchId: string; summary: string; fileCount: number }> = [];
  private unresolvedIssues: string[] = [];
  private readonly startedAt: string;
  private modelName?: string;

  constructor(private readonly options: PipelineOrchestratorOptions) {
    this.runId = options.runId ?? randomUUID();
    this.repairPolicy = options.repairPolicy ?? defaultRepairPolicy;
    this.startedAt = new Date().toISOString();
  }

  getStage(): PipelineStage {
    return this.stage;
  }

  getRunId(): string {
    return this.runId;
  }

  getArchitecturePlan(): ArchitecturePlan | undefined {
    return this.architecturePlan;
  }

  getWorkspaceRoot(): string | undefined {
    return this.workspace?.rootDir;
  }

  cancel(): void {
    this.cancelled = true;
    this.commandRunner?.cancel();
    if (!['completed', 'failed', 'cancelled'].includes(this.stage)) {
      this.transition('cancelled');
    }
  }

  async run(input: PipelineStartInput): Promise<FinalProjectReport> {
    try {
      this.transition('analyzing');
      this.throwIfCancelled();

      this.specification = buildProjectSpecification(input);
      this.transition('validating_stack');
      this.throwIfCancelled();

      this.compatibility = validateSpecificationCompatibility(this.specification);
      if (this.compatibility.compatible === false) {
        this.transition('failed');
        return this.finishReport({
          status: 'stack_incompatible',
          unresolved: this.compatibility.conflicts.map((c) => c.message),
        });
      }

      this.workspace = await createIsolatedWorkspace(this.options.workspaceBaseDir, this.runId);
      this.commandRunner = new CommandRunner({ workspaceRoot: this.workspace.rootDir });

      this.transition('planning');
      this.throwIfCancelled();

      const planPrompt = buildArchitecturePlanningPrompt({
        specification: this.specification,
        compatibility: this.compatibility,
      });
      this.architecturePlan = await this.options.model.planArchitecture(planPrompt);
      await this.persistCheckpoint();

      if (this.options.autoApprovePlan === false) {
        this.transition('awaiting_plan_approval');
        await this.persistCheckpoint();
      } else {
        await this.generateAllBatches();
      }

      if (this.stage === 'awaiting_plan_approval') {
        return this.finishReport({
          status: 'awaiting_plan_approval',
          unresolved: ['Architecture plan awaits approval'],
        });
      }

      return this.finishReport({});
    } catch (error) {
      if (this.cancelled || (isPipelineError(error) && error.code === 'PIPELINE_CANCELLED')) {
        this.transition('cancelled');
        return this.finishReport({
          status: 'failed',
          unresolved: ['Pipeline cancelled'],
        });
      }

      const message = error instanceof Error ? error.message : 'Unknown pipeline failure';
      this.unresolvedIssues.push(message);
      if (!['failed', 'cancelled', 'completed'].includes(this.stage)) {
        this.transition('failed');
      }
      return this.finishReport({
        status: 'failed',
        unresolved: this.unresolvedIssues,
      });
    }
  }

  async resumeAfterPlanApproval(): Promise<FinalProjectReport> {
    if (this.stage !== 'awaiting_plan_approval') {
      throw new PipelineError('INTERNAL_ERROR', `Cannot approve plan from stage ${this.stage}`);
    }
    await this.generateAllBatches();
    return this.finishReport({});
  }

  async rejectPlan(reason = 'Architecture plan rejected by user'): Promise<FinalProjectReport> {
    if (this.stage !== 'awaiting_plan_approval') {
      throw new PipelineError('INTERNAL_ERROR', `Cannot reject plan from stage ${this.stage}`);
    }
    this.unresolvedIssues.push(reason);
    this.transition('cancelled');
    await this.persistCheckpoint();
    return this.finishReport({
      status: 'failed',
      unresolved: this.unresolvedIssues,
    });
  }

  static async approveFromCheckpoint(
    workspaceRoot: string,
    options: Omit<PipelineOrchestratorOptions, 'workspaceBaseDir' | 'runId' | 'autoApprovePlan'>,
  ): Promise<FinalProjectReport> {
    const orchestrator = new PipelineOrchestrator({
      ...options,
      workspaceBaseDir: workspaceRoot,
      autoApprovePlan: true,
    });
    return orchestrator.resumeFromCheckpoint(workspaceRoot);
  }

  static async rejectFromCheckpoint(
    workspaceRoot: string,
    options: Omit<PipelineOrchestratorOptions, 'workspaceBaseDir' | 'runId' | 'autoApprovePlan'>,
    reason?: string,
  ): Promise<FinalProjectReport> {
    const checkpoint = await loadCheckpoint(workspaceRoot);
    if (!checkpoint) {
      throw new PipelineError('INTERNAL_ERROR', 'No checkpoint found');
    }
    if (checkpoint.stage !== 'awaiting_plan_approval') {
      throw new PipelineError(
        'INTERNAL_ERROR',
        `Checkpoint stage is ${checkpoint.stage}, expected awaiting_plan_approval`,
      );
    }

    const orchestrator = new PipelineOrchestrator({
      ...options,
      workspaceBaseDir: workspaceRoot,
      runId: checkpoint.runId,
      autoApprovePlan: false,
    });
    orchestrator.specification = checkpoint.specification;
    orchestrator.compatibility = checkpoint.compatibility;
    orchestrator.architecturePlan = checkpoint.architecturePlan;
    orchestrator.completedBatchIds = [...checkpoint.completedBatchIds];
    orchestrator.currentBatchId = checkpoint.currentBatchId;
    orchestrator.repairAttempts = checkpoint.repairAttempts;
    orchestrator.verificationResults = [...checkpoint.verificationResults];
    orchestrator.filesApplied = [...checkpoint.filesApplied];
    orchestrator.workspace = new WorkspaceManager({ rootDir: workspaceRoot });
    orchestrator.commandRunner = new CommandRunner({ workspaceRoot });
    orchestrator.stage = 'awaiting_plan_approval';
    return orchestrator.rejectPlan(reason);
  }

  async resumeFromCheckpoint(workspaceRoot: string): Promise<FinalProjectReport> {
    const checkpoint = await loadCheckpoint(workspaceRoot);
    if (!checkpoint) {
      throw new PipelineError('INTERNAL_ERROR', 'No checkpoint found');
    }

    this.specification = checkpoint.specification;
    this.compatibility = checkpoint.compatibility;
    this.architecturePlan = checkpoint.architecturePlan;
    this.completedBatchIds = [...checkpoint.completedBatchIds];
    this.currentBatchId = checkpoint.currentBatchId;
    this.repairAttempts = checkpoint.repairAttempts;
    this.verificationResults = [...checkpoint.verificationResults];
    this.filesApplied = [...checkpoint.filesApplied];
    this.workspace = new WorkspaceManager({ rootDir: workspaceRoot });
    this.commandRunner = new CommandRunner({ workspaceRoot });

    if (checkpoint.stage === 'awaiting_plan_approval') {
      this.stage = 'awaiting_plan_approval';
      return this.resumeAfterPlanApproval();
    }

    this.stage = checkpoint.stage === 'failed' || checkpoint.stage === 'completed'
      ? 'generating_batch'
      : checkpoint.stage;

    await this.generateAllBatches({ resume: true });
    return this.finishReport({});
  }

  private async generateAllBatches(options: { resume?: boolean } = {}): Promise<void> {
    if (!this.specification || !this.architecturePlan || !this.workspace || !this.commandRunner) {
      throw new PipelineError('INTERNAL_ERROR', 'Pipeline not initialized');
    }

    const batches = this.architecturePlan.batches;
    for (const batch of batches) {
      if (options.resume && this.completedBatchIds.includes(batch.batchId)) continue;

      for (const dep of batch.dependsOn) {
        if (!this.completedBatchIds.includes(dep)) {
          throw new PipelineError('INTERNAL_ERROR', `Batch ${batch.batchId} missing dependency ${dep}`);
        }
      }

      this.currentBatchId = batch.batchId;
      this.transition('generating_batch');
      this.throwIfCancelled();

      const existingFiles = [];
      for (const filePath of batch.allowedFiles) {
        const content = await this.workspace.readText(filePath);
        if (content != null) existingFiles.push({ path: filePath, content });
      }

      const batchPrompt = buildBatchGenerationPrompt({
        specification: this.specification,
        architecturePlan: this.architecturePlan,
        batch,
        existingFiles,
        priorBatchSummaries: this.batchSummaries.map(({ batchId, summary }) => ({ batchId, summary })),
      });

      const batchResult = await this.options.model.generateBatch({
        system: batchPrompt.system,
        user: batchPrompt.user,
        batchId: batch.batchId,
        allowlist: batch.allowedFiles,
      });

      this.transition('writing_files');
      this.throwIfCancelled();
      const applied = await this.workspace.applyBatch(batch.batchId, batchResult.files);
      for (const file of batchResult.files) {
        this.filesApplied.push({ path: file.path, operation: file.operation, batchId: batch.batchId });
      }

      this.batchSummaries.push({
        batchId: batch.batchId,
        summary: batchResult.summary,
        fileCount: batchResult.files.length,
      });

      if (this.options.executeVerification !== false && batch.verificationCommands.length) {
        this.transition('verifying_batch');
        const runner = new VerificationRunner({
          commandRunner: this.commandRunner,
          specification: this.specification,
          architecturePlan: {
            ...this.architecturePlan,
            verificationPlan: batch.verificationCommands.map((command, index) => ({
              id: `${batch.batchId}-verify-${index}`,
              name: command,
              command: command.trim().split(/\s+/),
              required: true,
            })),
          },
        });

        let results = await runner.runAll();
        this.recordCommands(results);
        this.verificationResults.push(...results);

        let failed = results.find((result) => result.status === 'failed');
        while (failed) {
          assertRepairBudget(this.repairAttempts, this.repairPolicy);
          this.transition('repairing');
          this.throwIfCancelled();

          const repair = await runRepairLoop({
            model: this.options.model,
            workspace: this.workspace,
            specification: this.specification,
            failure: failed,
            allowlist: batch.allowedFiles,
            acceptanceCriteria: batch.acceptanceCriteria,
            policy: this.repairPolicy,
          });

          this.repairAttempts += repair.attempts;

          if (repair.ok === false) {
            this.unresolvedIssues.push(repair.reason);
            throw new PipelineError('REPAIR_LIMIT_REACHED', repair.reason);
          }

          for (const file of repair.files) {
            this.filesApplied.push({
              path: file.path,
              operation: file.operation,
              batchId: `repair:${batch.batchId}`,
            });
          }

          this.transition('verifying_batch');
          results = await runner.runAll();
          this.recordCommands(results);
          this.verificationResults.push(...results);
          failed = results.find((result) => result.status === 'failed');
        }
      }

      this.completedBatchIds.push(batch.batchId);
      await this.persistCheckpoint();
      void applied;
    }

    this.transition('final_verification');
    this.throwIfCancelled();

    if (this.options.executeVerification !== false) {
      const runner = new VerificationRunner({
        commandRunner: this.commandRunner,
        specification: this.specification,
        architecturePlan: this.architecturePlan,
      });
      const finalResults = await runner.runAll();
      this.recordCommands(finalResults);
      this.verificationResults.push(...finalResults);

      const failed = finalResults.find((result) => result.status === 'failed');
      if (failed) {
        // One final repair cycle for final verification
        assertRepairBudget(this.repairAttempts, this.repairPolicy);
        this.transition('repairing');
        const allowlist = this.architecturePlan.files.map((file) => file.path).slice(0, this.repairPolicy.maxFilesPerRepair);
        const repair = await runRepairLoop({
          model: this.options.model,
          workspace: this.workspace,
          specification: this.specification,
          failure: failed,
          allowlist,
          acceptanceCriteria: ['Final verification must pass'],
          policy: this.repairPolicy,
        });
        this.repairAttempts += repair.attempts;
        if (repair.ok === false) {
          this.unresolvedIssues.push(repair.reason);
          this.transition('failed');
          return;
        }
        const retry = await runner.runAll();
        this.recordCommands(retry);
        this.verificationResults.push(...retry);
        if (retry.some((result) => result.status === 'failed')) {
          this.unresolvedIssues.push('Final verification failed after repair');
          this.transition('failed');
          return;
        }
      }
    }

    this.transition('completed');
    await this.persistCheckpoint();
  }

  private recordCommands(results: VerificationResult[]): void {
    for (const result of results) {
      if (result.command) this.commandsExecuted.push(result.command);
    }
  }

  private transition(next: PipelineStage): void {
    const allowed = ALLOWED_TRANSITIONS[this.stage] ?? [];
    if (this.stage !== next && !allowed.includes(next)) {
      // Allow idempotent terminal sets and recovery to failed/cancelled always
      if (!['failed', 'cancelled'].includes(next)) {
        throw new PipelineError('INTERNAL_ERROR', `Invalid transition ${this.stage} → ${next}`);
      }
    }
    this.stage = next;
  }

  private throwIfCancelled(): void {
    if (this.cancelled) {
      throw new PipelineError('PIPELINE_CANCELLED', 'Pipeline cancelled');
    }
  }

  private async persistCheckpoint(): Promise<void> {
    if (!this.workspace || !this.specification || !this.compatibility) return;
    const checkpoint: PipelineCheckpoint = {
      runId: this.runId,
      stage: this.stage,
      specification: this.specification,
      compatibility: this.compatibility,
      architecturePlan: this.architecturePlan,
      completedBatchIds: this.completedBatchIds,
      currentBatchId: this.currentBatchId,
      workspaceRoot: this.workspace.rootDir,
      repairAttempts: this.repairAttempts,
      verificationResults: this.verificationResults,
      filesApplied: this.filesApplied,
      updatedAt: new Date().toISOString(),
    };
    await saveCheckpoint(this.workspace.rootDir, checkpoint);
  }

  private buildRunLog(finalStatus: FinalProjectReport['status']): PipelineRunLog {
    return {
      runId: this.runId,
      projectId: this.specification?.projectName ?? 'unknown',
      stage: this.stage,
      currentBatchId: this.currentBatchId,
      stackIds: this.specification
        ? [
            this.specification.stack.frontend.id,
            this.specification.stack.backend.id,
            this.specification.stack.runtime.id,
            this.specification.stack.database.id,
          ]
        : [],
      model: this.modelName,
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
      commandSummaries: this.commandsExecuted.map((cmd) => ({
        command: cmd.command,
        exitCode: cmd.exitCode,
        durationMs: cmd.durationMs,
        status: cmd.rejected
          ? 'rejected'
          : cmd.timedOut
            ? 'timeout'
            : cmd.cancelled
              ? 'cancelled'
              : cmd.exitCode === 0
                ? 'ok'
                : 'failed',
      })),
      changedFiles: this.filesApplied.map((file) => file.path),
      repairAttempts: this.repairAttempts,
      finalStatus,
    };
  }

  private finishReport(options: {
    status?: FinalProjectReport['status'];
    unresolved?: string[];
  }): FinalProjectReport {
    if (!this.specification) {
      const failedLog = this.buildRunLog('failed');
      return buildFinalReport({
        status: 'failed',
        specification: buildProjectSpecification({
          symbols: ['react', 'express', 'postgresql'],
          backendRuntime: 'nodejs',
          authentication: false,
        }),
        compatibilityWarnings: [],
        generatedBatches: [],
        files: [],
        commandsExecuted: [],
        verificationResults: [],
        repairAttempts: 0,
        unresolvedIssues: options.unresolved ?? ['Missing specification'],
        runLog: failedLog,
      });
    }

    const warnings = this.compatibility && this.compatibility.compatible
      ? this.compatibility.warnings
      : [];

    const status = options.status ?? deriveFinalStatus({
      stackIncompatible: this.compatibility ? !this.compatibility.compatible : false,
      failed: this.stage === 'failed' || this.stage === 'cancelled',
      awaitingPlanApproval: this.stage === 'awaiting_plan_approval',
      verificationResults: this.verificationResults,
      executedAnyCommand: this.commandsExecuted.length > 0,
    });

    return buildFinalReport({
      status,
      specification: this.specification,
      compatibilityWarnings: warnings,
      architectureSummary: this.architecturePlan?.summary,
      generatedBatches: this.batchSummaries,
      files: this.filesApplied.map(({ path: filePath, operation }) => ({ path: filePath, operation })),
      commandsExecuted: this.commandsExecuted,
      verificationResults: this.verificationResults,
      repairAttempts: this.repairAttempts,
      unresolvedIssues: options.unresolved ?? this.unresolvedIssues,
      runLog: this.buildRunLog(status),
    });
  }
}
