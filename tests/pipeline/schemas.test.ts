import { describe, expect, test } from 'bun:test';
import {
  validateArchitecturePlan,
  validateGenerationBatchResult,
  validateRepairResult,
} from '../../src/pipeline/schemas';

const validPlan = {
  summary: 'Express API with React UI',
  assumptions: ['Linux available'],
  dependencies: [{
    packageName: 'pg',
    version: '8.13.0',
    category: 'database-driver',
    purpose: 'Postgres access',
    reasonBuiltInCapabilityIsInsufficient: 'Node has no built-in Postgres driver',
  }],
  repositoryTree: [{ path: 'package.json', type: 'file' }],
  files: [{ path: 'package.json', purpose: 'manifest', batchId: 'b1' }],
  batches: [{
    batchId: 'b1',
    title: 'Scaffold',
    goal: 'Create package manifest',
    allowedFiles: ['package.json'],
    dependsOn: [],
    acceptanceCriteria: ['package.json exists'],
    verificationCommands: [],
  }],
  verificationPlan: [{
    id: 'install',
    name: 'Install',
    command: ['bun', 'install'],
    required: true,
  }],
};

describe('structured response validation', () => {
  test('accepts a valid architecture plan', () => {
    const result = validateArchitecturePlan(validPlan);
    expect(result.ok).toBe(true);
  });

  test('rejects malformed JSON-shaped objects with missing fields', () => {
    expect(validateArchitecturePlan({ summary: 'x' }).ok).toBe(false);
  });

  test('rejects unknown file operations and duplicates', () => {
    const result = validateGenerationBatchResult({
      batchId: 'b1',
      summary: 'oops',
      files: [
        { path: 'a.ts', operation: 'upsert', content: 'x' },
        { path: 'a.ts', operation: 'create', content: 'y' },
      ],
      commands: [],
      notes: [],
    }, { allowlist: ['a.ts'], expectedBatchId: 'b1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes('operation'))).toBe(true);
    }
  });

  test('rejects files outside allowlist and path traversal', () => {
    const outside = validateGenerationBatchResult({
      batchId: 'b1',
      summary: 'x',
      files: [{ path: 'secret.ts', operation: 'create', content: 'nope' }],
      commands: [],
      notes: [],
    }, { allowlist: ['ok.ts'], expectedBatchId: 'b1' });
    expect(outside.ok).toBe(false);

    const traversal = validateGenerationBatchResult({
      batchId: 'b1',
      summary: 'x',
      files: [{ path: '../etc/passwd', operation: 'create', content: 'nope' }],
      commands: [],
      notes: [],
    }, { allowlist: ['../etc/passwd'], expectedBatchId: 'b1' });
    expect(traversal.ok).toBe(false);
  });

  test('rejects oversized files', () => {
    const result = validateGenerationBatchResult({
      batchId: 'b1',
      summary: 'x',
      files: [{ path: 'big.txt', operation: 'create', content: 'x'.repeat(600_000) }],
      commands: [],
      notes: [],
    }, { allowlist: ['big.txt'], expectedBatchId: 'b1' });
    expect(result.ok).toBe(false);
  });

  test('accepts a valid repair result', () => {
    const result = validateRepairResult({
      summary: 'fix import',
      files: [{ path: 'src/a.ts', operation: 'update', content: 'export const a = 1' }],
      notes: [],
    }, { allowlist: ['src/a.ts'], maxFiles: 5 });
    expect(result.ok).toBe(true);
  });
});
