import { describe, expect, test } from 'bun:test';
import {
  formatArchitecturePlanAsMarkdown,
  formatPipelineReportAsMarkdown,
  formatPipelineRunbook,
  isPipelineReportPayload,
} from '../src/format-pipeline-report';
import type { FinalProjectReport } from '../src/pipeline/types';

const sampleReport = (): FinalProjectReport => ({
  status: 'generated_not_executed',
  stack: {
    frontend: { id: 'react', name: 'React', role: 'frontend' },
    backend: { id: 'express', name: 'Express', role: 'backend-framework' },
    runtime: { id: 'bun', name: 'Bun', role: 'backend-runtime' },
    database: { id: 'postgresql', name: 'Postgres', role: 'database' },
  },
  compatibilityWarnings: [{ code: 'migration-strategy-unspecified', message: 'Define migrations in the plan.' }],
  architectureSummary: 'Express API with React UI',
  generatedBatches: [{ batchId: 'b1', summary: 'scaffold', fileCount: 2 }],
  files: [
    { path: 'package.json', operation: 'create' },
    { path: 'src/index.ts', operation: 'create' },
  ],
  commandsExecuted: [],
  verificationResults: [],
  repairAttempts: 0,
  unresolvedIssues: [],
  howToRun: ['bun install', 'Workspace run id: demo'],
  limitations: ['No verification steps were executed for this run.'],
  nextDeploymentSteps: ['Configure production secrets outside the repository.'],
  runLog: {
    runId: 'demo',
    projectId: 'student-management-system',
    stage: 'completed',
    stackIds: ['react', 'express', 'bun', 'postgresql'],
    startedAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:01.000Z',
    commandSummaries: [],
    changedFiles: ['package.json', 'src/index.ts'],
    repairAttempts: 0,
    finalStatus: 'generated_not_executed',
  },
});

describe('formatPipelineReportAsMarkdown', () => {
  test('includes status, stack, batches, and run id', () => {
    const markdown = formatPipelineReportAsMarkdown(sampleReport());
    expect(markdown).toContain('**Status:** `generated_not_executed`');
    expect(markdown).toContain('React');
    expect(markdown).toContain('**b1**');
    expect(markdown).toContain('`demo`');
    expect(markdown).toContain('_No verification steps were executed');
  });
});

describe('formatPipelineRunbook', () => {
  test('produces a compact runbook', () => {
    const runbook = formatPipelineRunbook(sampleReport());
    expect(runbook).toContain('PIPELINE RUNBOOK');
    expect(runbook).toContain('Run id: demo');
    expect(runbook).toContain('bun install');
  });
});

describe('formatArchitecturePlanAsMarkdown', () => {
  test('includes batches and approval cue', () => {
    const markdown = formatArchitecturePlanAsMarkdown({
      summary: 'Slice plan',
      assumptions: ['Linux'],
      dependencies: [{
        packageName: 'pg',
        version: '8',
        category: 'database-driver',
        purpose: 'Postgres',
        reasonBuiltInCapabilityIsInsufficient: 'No built-in driver',
      }],
      repositoryTree: [],
      files: [{ path: 'package.json', purpose: 'manifest', batchId: 'b1' }],
      batches: [{
        batchId: 'b1',
        title: 'Scaffold',
        goal: 'Create package.json',
        allowedFiles: ['package.json'],
        dependsOn: [],
        acceptanceCriteria: ['exists'],
        verificationCommands: [],
      }],
      verificationPlan: [],
    });
    expect(markdown).toContain('awaiting approval');
    expect(markdown).toContain('b1: Scaffold');
    expect(markdown).toContain('Approve to generate');
  });
});

describe('isPipelineReportPayload', () => {
  test('accepts pipeline payloads and rejects legacy shapes', () => {
    expect(isPipelineReportPayload({
      mode: 'pipeline',
      report: sampleReport(),
      model: 'gemini-3.5-flash',
    })).toBe(true);
    expect(isPipelineReportPayload({ prompt: 'x', guide: 'y' })).toBe(false);
    expect(isPipelineReportPayload(null)).toBe(false);
  });
});
