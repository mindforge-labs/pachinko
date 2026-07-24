import { describe, expect, test, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectGenerationModel } from '../../src/pipeline/model';
import { runRepairLoop, assertRepairBudget } from '../../src/pipeline/repair';
import { buildProjectSpecification } from '../../src/pipeline/specification';
import { WorkspaceManager } from '../../src/pipeline/workspace';
import { PipelineError } from '../../src/pipeline/errors';
import type { RepairResult, VerificationResult } from '../../src/pipeline/types';

const spec = buildProjectSpecification({
  symbols: ['react', 'express', 'postgresql'],
  backendRuntime: 'bun',
  authentication: false,
});

const failure: VerificationResult = {
  stepId: 'test',
  status: 'failed',
  command: {
    command: ['bun', 'test'],
    cwd: '/tmp',
    exitCode: 1,
    stdout: '',
    stderr: 'expected 1 to be 2',
    durationMs: 5,
    timedOut: false,
    cancelled: false,
  },
  message: 'Exit code 1',
};

describe('repair loop', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const setup = async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pachinko-repair-'));
    dirs.push(dir);
    const workspace = new WorkspaceManager({ rootDir: dir });
    await workspace.applyBatch('seed', [
      { path: 'src/a.ts', operation: 'create', content: 'export const a = 0' },
    ]);
    return workspace;
  };

  test('fixes on first attempt', async () => {
    const workspace = await setup();
    const model: ProjectGenerationModel = {
      planArchitecture: async () => {
        throw new Error('unused');
      },
      generateBatch: async () => {
        throw new Error('unused');
      },
      repairFailure: async () => ({
        summary: 'fix value',
        files: [{ path: 'src/a.ts', operation: 'update', content: 'export const a = 1' }],
        notes: [],
      }),
    };

    const outcome = await runRepairLoop({
      model,
      workspace,
      specification: spec,
      failure,
      allowlist: ['src/a.ts'],
      acceptanceCriteria: ['a equals 1'],
      policy: {
        maxAttemptsPerFailure: 3,
        maxTotalRepairAttempts: 8,
        maxFilesPerRepair: 5,
        maxErrorOutputCharacters: 20_000,
      },
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(1);
    expect(await workspace.readText('src/a.ts')).toBe('export const a = 1');
  });

  test('succeeds after multiple invalid attempts', async () => {
    const workspace = await setup();
    let calls = 0;
    const model: ProjectGenerationModel = {
      planArchitecture: async () => {
        throw new Error('unused');
      },
      generateBatch: async () => {
        throw new Error('unused');
      },
      repairFailure: async () => {
        calls += 1;
        if (calls < 3) {
          return {
            summary: 'bad',
            files: [{ path: 'not-allowed.ts', operation: 'create', content: 'x' }],
            notes: [],
          } as RepairResult;
        }
        return {
          summary: 'good',
          files: [{ path: 'src/a.ts', operation: 'update', content: 'export const a = 2' }],
          notes: [],
        };
      },
    };

    // First two returns are outside allowlist and fail schema validation in validateRepairResult
    const outcome = await runRepairLoop({
      model,
      workspace,
      specification: spec,
      failure,
      allowlist: ['src/a.ts'],
      acceptanceCriteria: ['ok'],
      policy: {
        maxAttemptsPerFailure: 3,
        maxTotalRepairAttempts: 8,
        maxFilesPerRepair: 5,
        maxErrorOutputCharacters: 2_000,
      },
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.attempts).toBe(3);
  });

  test('stops when maximum attempts reached', async () => {
    const workspace = await setup();
    const model: ProjectGenerationModel = {
      planArchitecture: async () => {
        throw new Error('unused');
      },
      generateBatch: async () => {
        throw new Error('unused');
      },
      repairFailure: async () => ({
        summary: 'still bad',
        files: [{ path: 'nope.ts', operation: 'create', content: 'x' }],
        notes: [],
      }),
    };

    const outcome = await runRepairLoop({
      model,
      workspace,
      specification: spec,
      failure,
      allowlist: ['src/a.ts'],
      acceptanceCriteria: ['ok'],
      policy: {
        maxAttemptsPerFailure: 2,
        maxTotalRepairAttempts: 8,
        maxFilesPerRepair: 5,
        maxErrorOutputCharacters: 2_000,
      },
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.attempts).toBe(2);
  });

  test('skips repairs that delete failing tests', async () => {
    const workspace = await setup();
    await workspace.applyBatch('seed-test', [
      { path: 'src/a.test.ts', operation: 'create', content: 'test' },
    ]);
    let calls = 0;
    const model: ProjectGenerationModel = {
      planArchitecture: async () => {
        throw new Error('unused');
      },
      generateBatch: async () => {
        throw new Error('unused');
      },
      repairFailure: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            summary: 'delete test',
            files: [{ path: 'src/a.test.ts', operation: 'delete' }],
            notes: [],
          };
        }
        return {
          summary: 'real fix',
          files: [{ path: 'src/a.ts', operation: 'update', content: 'export const a = 3' }],
          notes: [],
        };
      },
    };

    const outcome = await runRepairLoop({
      model,
      workspace,
      specification: spec,
      failure,
      allowlist: ['src/a.ts', 'src/a.test.ts'],
      acceptanceCriteria: ['ok'],
    });

    expect(outcome.ok).toBe(true);
    expect(await workspace.readText('src/a.test.ts')).toBe('test');
  });

  test('assertRepairBudget throws at limit', () => {
    expect(() => assertRepairBudget(8)).toThrow(PipelineError);
  });
});
