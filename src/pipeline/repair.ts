import { PipelineError } from './errors';
import type { ProjectGenerationModel } from './model';
import { assertValidOrThrow, validateRepairResult } from './schemas';
import type {
  CommandResult,
  GeneratedFile,
  ProjectSpecification,
  RepairPolicy,
  RepairResult,
  VerificationResult,
} from './types';
import { defaultRepairPolicy } from './types';
import type { WorkspaceManager } from './workspace';
import { buildRepairPrompt } from './prompts/repair';

export type RepairLoopInput = {
  model: ProjectGenerationModel;
  workspace: WorkspaceManager;
  specification: ProjectSpecification;
  failure: VerificationResult;
  allowlist: string[];
  acceptanceCriteria: string[];
  policy?: RepairPolicy;
  onAttempt?: (attempt: number, result: RepairResult) => void;
};

export type RepairLoopOutcome =
  | { ok: true; attempts: number; files: GeneratedFile[]; lastRepair: RepairResult }
  | { ok: false; attempts: number; reason: string; lastRepair?: RepairResult };

function isDisallowedTestDeletion(files: GeneratedFile[], failure: VerificationResult): boolean {
  if (!failure.command) return false;
  const looksLikeTest = /test|spec|pytest|jest|vitest/i.test(failure.command.command.join(' '));
  if (!looksLikeTest) return false;
  return files.some((file) =>
    file.operation === 'delete' && /(test|spec)\./i.test(file.path));
}

export async function runRepairLoop(input: RepairLoopInput): Promise<RepairLoopOutcome> {
  const policy = input.policy ?? defaultRepairPolicy;
  if (!input.failure.command || input.failure.status !== 'failed') {
    return { ok: false, attempts: 0, reason: 'No failed command to repair' };
  }

  let attempts = 0;
  let lastRepair: RepairResult | undefined;

  while (attempts < policy.maxAttemptsPerFailure) {
    attempts += 1;

    const changedFiles: Array<{ path: string; content: string }> = [];
    for (const path of input.allowlist.slice(0, policy.maxFilesPerRepair)) {
      const content = await input.workspace.readText(path);
      if (content != null) changedFiles.push({ path, content });
    }

    const prompt = buildRepairPrompt({
      specification: input.specification,
      failedCommand: truncateCommandOutput(input.failure.command, policy.maxErrorOutputCharacters),
      expectedBehavior: input.acceptanceCriteria.join('\n') || 'Verification step should pass.',
      changedFiles,
      allowlist: input.allowlist,
      acceptanceCriteria: input.acceptanceCriteria,
    });

    let raw: unknown;
    try {
      raw = await input.model.repairFailure({
        system: prompt.system,
        user: prompt.user,
        allowlist: input.allowlist,
        maxFiles: policy.maxFilesPerRepair,
      });
    } catch (error) {
      if (error instanceof PipelineError && error.code === 'MODEL_RESPONSE_INVALID') {
        continue;
      }
      throw error;
    }

    const validated = validateRepairResult(raw, {
      allowlist: input.allowlist,
      maxFiles: policy.maxFilesPerRepair,
    });

    if (!validated.ok) {
      continue;
    }

    lastRepair = validated.value;
    input.onAttempt?.(attempts, lastRepair);

    if (isDisallowedTestDeletion(lastRepair.files, input.failure)) {
      continue;
    }

    const outside = lastRepair.files.filter((file) => !input.allowlist.includes(file.path));
    if (outside.length) {
      continue;
    }

    await input.workspace.applyBatch(`repair-${attempts}`, lastRepair.files);

    return {
      ok: true,
      attempts,
      files: lastRepair.files,
      lastRepair,
    };
  }

  return {
    ok: false,
    attempts,
    reason: 'Repair attempt limit reached',
    lastRepair,
  };
}

function truncateCommandOutput(command: CommandResult, maxChars: number): CommandResult {
  const half = Math.floor(maxChars / 2);
  return {
    ...command,
    stdout: command.stdout.length > half ? command.stdout.slice(-half) : command.stdout,
    stderr: command.stderr.length > half ? command.stderr.slice(-half) : command.stderr,
  };
}

export function assertRepairBudget(totalAttempts: number, policy: RepairPolicy = defaultRepairPolicy): void {
  if (totalAttempts >= policy.maxTotalRepairAttempts) {
    throw new PipelineError('REPAIR_LIMIT_REACHED', `Total repair attempts exceeded (${policy.maxTotalRepairAttempts}).`);
  }
}
