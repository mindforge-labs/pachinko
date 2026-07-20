import type {
  CommandResult,
  CompatibilityWarning,
  FinalProjectReport,
  FinalProjectStatus,
  PipelineRunLog,
  ProjectSpecification,
  VerificationResult,
  VerificationStatus,
} from './types';

export function deriveFinalStatus(options: {
  stackIncompatible?: boolean;
  failed?: boolean;
  awaitingPlanApproval?: boolean;
  verificationResults: VerificationResult[];
  executedAnyCommand: boolean;
}): FinalProjectStatus {
  if (options.stackIncompatible) return 'stack_incompatible';
  if (options.failed) return 'failed';
  if (options.awaitingPlanApproval) return 'awaiting_plan_approval';

  const results = options.verificationResults;
  if (!options.executedAnyCommand || results.length === 0) {
    return 'generated_not_executed';
  }

  const required = results.filter((result) => result.status !== 'skipped' && result.status !== 'not_run');
  if (required.every((result) => result.status === 'passed')) return 'verified';
  if (required.some((result) => result.status === 'passed')) return 'partially_verified';
  if (required.some((result) => result.status === 'failed')) return 'failed';
  return 'generated_not_executed';
}

export function buildFinalReport(input: {
  status: FinalProjectStatus;
  specification: ProjectSpecification;
  compatibilityWarnings: CompatibilityWarning[];
  architectureSummary?: string;
  generatedBatches: Array<{ batchId: string; summary: string; fileCount: number }>;
  files: Array<{ path: string; operation: string }>;
  commandsExecuted: CommandResult[];
  verificationResults: VerificationResult[];
  repairAttempts: number;
  unresolvedIssues: string[];
  runLog: PipelineRunLog;
}): FinalProjectReport {
  const howToRun: string[] = [];
  const install = input.commandsExecuted.find((cmd) => cmd.command.join(' ').includes('install'));
  if (install) howToRun.push(install.command.join(' '));
  howToRun.push('Follow verificationPlan commands from the architecture plan.');
  howToRun.push(`Workspace run id: ${input.runLog.runId}`);

  const limitations: string[] = [];
  for (const result of input.verificationResults) {
    if (result.status === 'not_run' || result.status === 'skipped') {
      limitations.push(`${result.stepId}: ${result.status}${result.message ? ` (${result.message})` : ''}`);
    }
  }
  if (input.status === 'generated_not_executed') {
    limitations.push('No verification commands were executed for this run.');
  }

  return {
    status: input.status,
    stack: input.specification.stack,
    compatibilityWarnings: input.compatibilityWarnings,
    architectureSummary: input.architectureSummary,
    generatedBatches: input.generatedBatches,
    files: input.files,
    commandsExecuted: input.commandsExecuted,
    verificationResults: input.verificationResults,
    repairAttempts: input.repairAttempts,
    unresolvedIssues: input.unresolvedIssues,
    howToRun,
    limitations,
    nextDeploymentSteps: [
      'Review generated Docker and env templates if present.',
      'Configure production secrets outside the repository.',
      'Run final verification in a clean environment before deploy.',
    ],
    runLog: input.runLog,
  };
}

export function summarizeVerificationStatus(results: VerificationResult[]): VerificationStatus {
  if (!results.length) return 'not_run';
  if (results.some((result) => result.status === 'failed')) return 'failed';
  if (results.every((result) => result.status === 'passed' || result.status === 'skipped')) {
    return results.some((result) => result.status === 'passed') ? 'passed' : 'skipped';
  }
  if (results.some((result) => result.status === 'static_validated')) return 'static_validated';
  return 'not_run';
}
