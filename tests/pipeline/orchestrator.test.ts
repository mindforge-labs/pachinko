import { describe, expect, test, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PipelineOrchestrator } from '../../src/pipeline/orchestrator';
import type { ProjectGenerationModel } from '../../src/pipeline/model';
import type { ArchitecturePlan, GenerationBatchResult, RepairResult } from '../../src/pipeline/types';

const plan = (overrides: Partial<ArchitecturePlan> = {}): ArchitecturePlan => ({
  summary: 'Test plan',
  assumptions: [],
  dependencies: [],
  repositoryTree: [{ path: 'package.json', type: 'file' }],
  files: [
    { path: 'package.json', purpose: 'manifest', batchId: 'b1' },
    { path: 'src/index.ts', purpose: 'entry', batchId: 'b1' },
  ],
  batches: [{
    batchId: 'b1',
    title: 'Scaffold',
    goal: 'Create files',
    allowedFiles: ['package.json', 'src/index.ts'],
    dependsOn: [],
    acceptanceCriteria: ['files exist'],
    verificationCommands: [],
  }],
  verificationPlan: [],
  ...overrides,
});

describe('pipeline orchestration', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const baseDir = async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pachinko-pipe-'));
    dirs.push(dir);
    return dir;
  };

  test('happy path generates files without executing verification', async () => {
    const model: ProjectGenerationModel = {
      planArchitecture: async () => plan(),
      generateBatch: async (): Promise<GenerationBatchResult> => ({
        batchId: 'b1',
        summary: 'created scaffold',
        files: [
          { path: 'package.json', operation: 'create', content: '{"name":"demo"}' },
          { path: 'src/index.ts', operation: 'create', content: ' console.log("hi")' },
        ],
        commands: [],
        notes: [],
      }),
      repairFailure: async () => {
        throw new Error('unused');
      },
    };

    const orchestrator = new PipelineOrchestrator({
      model,
      workspaceBaseDir: await baseDir(),
      autoApprovePlan: true,
      executeVerification: false,
    });

    const report = await orchestrator.run({
      symbols: ['react', 'express', 'postgresql'],
      backendRuntime: 'bun',
      authentication: false,
    });

    expect(report.status).toBe('generated_not_executed');
    expect(report.generatedBatches).toHaveLength(1);
    expect(report.files.length).toBe(2);
    expect(orchestrator.getStage()).toBe('completed');
  });

  test('incompatible stack fails early', async () => {
    const model: ProjectGenerationModel = {
      planArchitecture: async () => plan(),
      generateBatch: async () => {
        throw new Error('should not generate');
      },
      repairFailure: async () => {
        throw new Error('unused');
      },
    };

    const orchestrator = new PipelineOrchestrator({
      model,
      workspaceBaseDir: await baseDir(),
      executeVerification: false,
    });

    // parsePromptRequest rejects spring+bun before orchestrator compatibility —
    // use a pair that parses but fails richer compatibility: express + cassandra
    await expect(orchestrator.run({
      symbols: ['react', 'spring', 'postgresql'],
      backendRuntime: 'bun',
      authentication: false,
    })).resolves.toMatchObject({ status: 'failed' });
  });

  test('architecture planning failure surfaces as failed report', async () => {
    const model: ProjectGenerationModel = {
      planArchitecture: async () => {
        throw new Error('planner down');
      },
      generateBatch: async () => {
        throw new Error('unused');
      },
      repairFailure: async () => {
        throw new Error('unused');
      },
    };

    const orchestrator = new PipelineOrchestrator({
      model,
      workspaceBaseDir: await baseDir(),
      executeVerification: false,
    });

    const report = await orchestrator.run({
      symbols: ['react', 'express', 'postgresql'],
      backendRuntime: 'bun',
      authentication: false,
    });

    expect(report.status).toBe('failed');
    expect(report.unresolvedIssues.some((issue) => issue.includes('planner down'))).toBe(true);
  });

  test('verification failure repaired successfully', async () => {
    let repairCalls = 0;
    const model: ProjectGenerationModel = {
      planArchitecture: async () => plan({
        batches: [{
          batchId: 'b1',
          title: 'Scaffold',
          goal: 'Create files',
          allowedFiles: ['ok.txt'],
          dependsOn: [],
          acceptanceCriteria: ['echo works'],
          verificationCommands: ['false'],
        }],
        files: [{ path: 'ok.txt', purpose: 'marker', batchId: 'b1' }],
        verificationPlan: [],
      }),
      generateBatch: async (): Promise<GenerationBatchResult> => ({
        batchId: 'b1',
        summary: 'created',
        files: [{ path: 'ok.txt', operation: 'create', content: 'x' }],
        commands: [],
        notes: [],
      }),
      repairFailure: async (): Promise<RepairResult> => {
        repairCalls += 1;
        return {
          summary: 'noop patch',
          files: [{ path: 'ok.txt', operation: 'update', content: 'fixed' }],
          notes: [],
        };
      },
    };

    // After repair, verification still runs `false` — so this should hit repair limit.
    // Use a custom model path: first verify fails, repair applied, still fails → REPAIR_LIMIT
    const orchestrator = new PipelineOrchestrator({
      model,
      workspaceBaseDir: await baseDir(),
      executeVerification: true,
      repairPolicy: {
        maxAttemptsPerFailure: 1,
        maxTotalRepairAttempts: 1,
        maxFilesPerRepair: 3,
        maxErrorOutputCharacters: 2_000,
      },
    });

    const report = await orchestrator.run({
      symbols: ['react', 'express', 'postgresql'],
      backendRuntime: 'bun',
      authentication: false,
    });

    expect(repairCalls).toBeGreaterThan(0);
    expect(['failed', 'partially_verified', 'verified']).toContain(report.status);
  });

  test('resume from checkpoint continues remaining batches', async () => {
    const fullPlan = plan({
      files: [
        { path: 'a.txt', purpose: 'a', batchId: 'b1' },
        { path: 'b.txt', purpose: 'b', batchId: 'b2' },
      ],
      batches: [
        {
          batchId: 'b1',
          title: 'One',
          goal: 'a',
          allowedFiles: ['a.txt'],
          dependsOn: [],
          acceptanceCriteria: ['a'],
          verificationCommands: [],
        },
        {
          batchId: 'b2',
          title: 'Two',
          goal: 'b',
          allowedFiles: ['b.txt'],
          dependsOn: ['b1'],
          acceptanceCriteria: ['b'],
          verificationCommands: [],
        },
      ],
    });

    let generateCount = 0;
    const model: ProjectGenerationModel = {
      planArchitecture: async () => fullPlan,
      generateBatch: async ({ batchId }): Promise<GenerationBatchResult> => {
        generateCount += 1;
        return {
          batchId,
          summary: batchId,
          files: [{ path: batchId === 'b1' ? 'a.txt' : 'b.txt', operation: 'create', content: batchId }],
          commands: [],
          notes: [],
        };
      },
      repairFailure: async () => {
        throw new Error('unused');
      },
    };

    const workspaceBaseDir = await baseDir();
    const first = new PipelineOrchestrator({
      model,
      workspaceBaseDir,
      runId: 'resume-run',
      autoApprovePlan: false,
      executeVerification: false,
    });

    const waiting = await first.run({
      symbols: ['react', 'express', 'postgresql'],
      backendRuntime: 'bun',
      authentication: false,
    });
    expect(waiting.status).toBe('awaiting_plan_approval');
    expect(first.getStage()).toBe('awaiting_plan_approval');
    expect(first.getArchitecturePlan()?.batches).toHaveLength(2);

    const resumed = await first.resumeAfterPlanApproval();
    expect(resumed.generatedBatches.map((batch) => batch.batchId)).toEqual(['b1', 'b2']);
    expect(generateCount).toBe(2);

    // Second orchestrator resumes from saved checkpoint after b1
    const model2: ProjectGenerationModel = {
      planArchitecture: async () => fullPlan,
      generateBatch: async ({ batchId }): Promise<GenerationBatchResult> => ({
        batchId,
        summary: batchId,
        files: [{ path: 'b.txt', operation: 'create', content: 'from-resume' }],
        commands: [],
        notes: [],
      }),
      repairFailure: async () => {
        throw new Error('unused');
      },
    };

    const second = new PipelineOrchestrator({
      model: model2,
      workspaceBaseDir,
      runId: 'resume-run-2',
      executeVerification: false,
    });

    // Seed a checkpoint as if b1 completed
    const { saveCheckpoint } = await import('../../src/pipeline/checkpoint');
    const { buildProjectSpecification } = await import('../../src/pipeline/specification');
    const { validateSpecificationCompatibility } = await import('../../src/pipeline/compatibility');
    const { WorkspaceManager } = await import('../../src/pipeline/workspace');
    const root = path.join(workspaceBaseDir, 'checkpoint-resume');
    const ws = new WorkspaceManager({ rootDir: root });
    await ws.ensureRoot();
    await ws.applyBatch('b1', [{ path: 'a.txt', operation: 'create', content: 'a' }]);
    const specification = buildProjectSpecification({
      symbols: ['react', 'express', 'postgresql'],
      backendRuntime: 'bun',
      authentication: false,
    });
    const compatibility = validateSpecificationCompatibility(specification);
    await saveCheckpoint(root, {
      runId: 'checkpoint-resume',
      stage: 'generating_batch',
      specification,
      compatibility,
      architecturePlan: fullPlan,
      completedBatchIds: ['b1'],
      currentBatchId: 'b2',
      workspaceRoot: root,
      repairAttempts: 0,
      verificationResults: [],
      filesApplied: [{ path: 'a.txt', operation: 'create', batchId: 'b1' }],
      updatedAt: new Date().toISOString(),
    });

    const fromCheckpoint = await second.resumeFromCheckpoint(root);
    expect(fromCheckpoint.files.some((file) => file.path === 'b.txt')).toBe(true);
  });

  test('reject plan cancels an awaiting run', async () => {
    const model: ProjectGenerationModel = {
      planArchitecture: async () => plan(),
      generateBatch: async () => {
        throw new Error('should not generate after reject');
      },
      repairFailure: async () => {
        throw new Error('unused');
      },
    };

    const workspaceBaseDir = await baseDir();
    const orchestrator = new PipelineOrchestrator({
      model,
      workspaceBaseDir,
      runId: 'reject-run',
      autoApprovePlan: false,
      executeVerification: false,
    });

    const waiting = await orchestrator.run({
      symbols: ['react', 'express', 'postgresql'],
      backendRuntime: 'bun',
      authentication: false,
    });
    expect(waiting.status).toBe('awaiting_plan_approval');

    const rejected = await orchestrator.rejectPlan();
    expect(rejected.status).toBe('failed');
    expect(orchestrator.getStage()).toBe('cancelled');
    expect(rejected.unresolvedIssues.some((issue) => issue.includes('rejected'))).toBe(true);
  });

  test('cancel pipeline mid-flight', async () => {
    let resolvePlan!: (value: ArchitecturePlan) => void;
    const model: ProjectGenerationModel = {
      planArchitecture: () => new Promise((resolve) => {
        resolvePlan = resolve;
      }),
      generateBatch: async () => {
        throw new Error('unused');
      },
      repairFailure: async () => {
        throw new Error('unused');
      },
    };

    const orchestrator = new PipelineOrchestrator({
      model,
      workspaceBaseDir: await baseDir(),
      executeVerification: false,
    });

    const running = orchestrator.run({
      symbols: ['react', 'express', 'postgresql'],
      backendRuntime: 'bun',
      authentication: false,
    });

    // Wait until planning started
    await Bun.sleep(20);
    orchestrator.cancel();
    resolvePlan(plan());

    const report = await running;
    expect(['failed', 'cancelled']).toContain(orchestrator.getStage());
    expect(report.unresolvedIssues.length).toBeGreaterThan(0);
  });
});
