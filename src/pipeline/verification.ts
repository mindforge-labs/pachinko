import type { CommandRunner } from './command-runner';
import { getTechPromptMetadata } from './stack-metadata';
import type {
  ArchitecturePlan,
  ProjectSpecification,
  VerificationResult,
  VerificationStep,
} from './types';

export type VerificationRunnerOptions = {
  commandRunner: CommandRunner;
  specification: ProjectSpecification;
  architecturePlan?: ArchitecturePlan;
  packageScripts?: Record<string, string>;
};

function shellCommandToArgv(command: string): string[] {
  // Plans may store shell-like strings; prefer simple whitespace split for allowlisted binaries.
  return command.trim().split(/\s+/).filter(Boolean);
}

export function resolveVerificationSteps(options: VerificationRunnerOptions): VerificationStep[] {
  if (options.architecturePlan?.verificationPlan?.length) {
    return options.architecturePlan.verificationPlan;
  }

  const backend = getTechPromptMetadata(
    options.specification.stack.backend.id,
    options.specification.stack.backend.name,
  );
  const steps: VerificationStep[] = [];

  if (backend.installCommand) {
    steps.push({
      id: 'install',
      name: 'Install dependencies',
      command: shellCommandToArgv(backend.installCommand),
      required: true,
    });
  }
  if (backend.typecheckCommand) {
    steps.push({
      id: 'typecheck',
      name: 'Typecheck',
      command: shellCommandToArgv(backend.typecheckCommand),
      required: true,
    });
  }
  if (backend.migrateCommand) {
    steps.push({
      id: 'migrate',
      name: 'Run migrations',
      command: shellCommandToArgv(backend.migrateCommand),
      required: false,
    });
  }
  if (backend.seedCommand) {
    steps.push({
      id: 'seed',
      name: 'Seed database',
      command: shellCommandToArgv(backend.seedCommand),
      required: false,
    });
  }
  if (backend.testCommand) {
    steps.push({
      id: 'test',
      name: 'Run tests',
      command: shellCommandToArgv(backend.testCommand),
      required: true,
    });
  }
  if (backend.buildCommand) {
    steps.push({
      id: 'build',
      name: 'Build',
      command: shellCommandToArgv(backend.buildCommand),
      required: true,
    });
  }

  // Prefer package scripts when present
  if (options.packageScripts) {
    const mapped: Array<[string, string, boolean]> = [
      ['test', 'test', true],
      ['build', 'build', true],
      ['typecheck', 'typecheck', true],
      ['lint', 'lint', false],
    ];
    for (const [id, script, required] of mapped) {
      if (options.packageScripts[script] && !steps.some((step) => step.id === id)) {
        steps.push({
          id,
          name: `npm run ${script}`,
          command: ['npm', 'run', script],
          required,
        });
      }
    }
  }

  return steps;
}

export class VerificationRunner {
  constructor(private readonly options: VerificationRunnerOptions) {}

  async runAll(stepFilter?: (step: VerificationStep) => boolean): Promise<VerificationResult[]> {
    const steps = resolveVerificationSteps(this.options).filter(stepFilter ?? (() => true));
    const results: VerificationResult[] = [];

    for (const step of steps) {
      const result = await this.runStep(step);
      results.push(result);
      if (result.status === 'failed' && step.required) break;
    }

    return results;
  }

  async runStep(step: VerificationStep): Promise<VerificationResult> {
    const commandResult = await this.options.commandRunner.run(step.command, { cwd: step.cwd });

    if (commandResult.rejected) {
      return {
        stepId: step.id,
        status: step.required ? 'failed' : 'skipped',
        command: commandResult,
        message: commandResult.rejected,
      };
    }

    if (commandResult.timedOut) {
      return {
        stepId: step.id,
        status: 'failed',
        command: commandResult,
        message: 'Command timed out',
      };
    }

    if (commandResult.cancelled) {
      return {
        stepId: step.id,
        status: 'failed',
        command: commandResult,
        message: 'Command cancelled',
      };
    }

    if (commandResult.exitCode === 0) {
      return {
        stepId: step.id,
        status: 'passed',
        command: commandResult,
      };
    }

    return {
      stepId: step.id,
      status: 'failed',
      command: commandResult,
      message: `Exit code ${commandResult.exitCode}`,
    };
  }
}
