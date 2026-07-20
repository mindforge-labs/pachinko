#!/usr/bin/env bun
/**
 * Live Gemini pipeline dry-run.
 *
 * Runs the real orchestrator + Gemini API (no Next server required).
 * Writes a machine-readable result under test-results/ and a human summary
 * under docs/ for checklist evidence.
 *
 * Usage:
 *   bun scripts/pipeline-dry-run.ts
 *   bun scripts/pipeline-dry-run.ts --stack vuejs,spring,mongodb --runtime java
 *   bun scripts/pipeline-dry-run.ts --verify   # also run verification commands
 *
 * Exit codes:
 *   0 — dry-run completed with a usable report (generated_not_executed | partially_verified | verified)
 *   1 — failed / stack_incompatible / missing API key / crash
 *   2 — not_run (no API key configured)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  GeminiProjectGenerationModel,
  PipelineOrchestrator,
  resolveGeminiModels,
  resolvePipelineWorkspaceBase,
  type FinalProjectReport,
  type FinalProjectStatus,
  type VerificationStatus,
} from '../src/pipeline';
import { hasGeminiApiKeys } from '../src/gemini-api-keys';

type DryRunCli = {
  symbols: [string, string, string];
  backendRuntime: string;
  authentication: boolean;
  executeVerification: boolean;
  projectName: string;
};

type DryRunRecord = {
  recordedAt: string;
  mode: 'pipeline-dry-run';
  executeVerification: boolean;
  stack: {
    symbols: string[];
    backendRuntime: string;
    authentication: boolean;
  };
  model: string;
  models: {
    default: string;
    powerful: string;
    economical: string;
  };
  workspaceBase: string;
  httpEquivalentStatus: number | null;
  reportStatus: FinalProjectStatus | 'not_run';
  verificationSummary: Array<{ stepId: string; status: VerificationStatus; message?: string }>;
  unresolvedIssues: string[];
  generatedBatches: Array<{ batchId: string; summary: string; fileCount: number }>;
  filesTouched: number;
  repairAttempts: number;
  runId?: string;
  workspaceRoot?: string;
  durationMs: number;
  error?: string;
  evidence: {
    unitTests: { status: 'passed' | 'failed' | 'not_run'; command: string; note?: string };
    liveGeminiDryRun: { status: 'passed' | 'failed' | 'not_run'; reason: string };
    finalVerificationCommands: { status: 'passed' | 'failed' | 'not_run' | 'skipped'; reason: string };
  };
};

function parseArgs(argv: string[]): DryRunCli {
  const get = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const stack = (get('--stack') || 'vuejs,spring,mongodb').split(',').map((part) => part.trim());
  if (stack.length !== 3) {
    throw new Error('--stack must be frontend,backend,database');
  }

  return {
    symbols: [stack[0], stack[1], stack[2]],
    backendRuntime: get('--runtime') || 'java',
    authentication: argv.includes('--auth'),
    executeVerification: argv.includes('--verify'),
    projectName: get('--name') || 'pipeline-dry-run-sms',
  };
}

function reportHttpStatus(status: FinalProjectStatus): number {
  if (status === 'stack_incompatible') return 422;
  if (status === 'failed') return 500;
  return 200;
}

function classifyLiveDryRun(report: FinalProjectReport | null, error?: string): {
  status: 'passed' | 'failed' | 'not_run';
  reason: string;
} {
  if (!report && error?.includes('GEMINI_API_KEY')) {
    return { status: 'not_run', reason: error };
  }
  if (!report) {
    return { status: 'failed', reason: error || 'No report produced' };
  }
  if (report.status === 'stack_incompatible' || report.status === 'failed') {
    return {
      status: 'failed',
      reason: report.unresolvedIssues[0] || `report.status=${report.status}`,
    };
  }
  // Dry-run success: pipeline produced a report without hard failure.
  // generated_not_executed is expected when --verify is omitted.
  return {
    status: 'passed',
    reason: `report.status=${report.status}; batches=${report.generatedBatches.length}; files=${report.files.length}`,
  };
}

function toMarkdown(record: DryRunRecord): string {
  const lines = [
    '# Pipeline live Gemini dry-run result',
    '',
    `Recorded at: \`${record.recordedAt}\``,
    '',
    '## Verdict',
    '',
    `| Check | Status | Reason |`,
    `| --- | --- | --- |`,
    `| live Gemini dry-run | \`${record.evidence.liveGeminiDryRun.status}\` | ${record.evidence.liveGeminiDryRun.reason} |`,
    `| final verification commands | \`${record.evidence.finalVerificationCommands.status}\` | ${record.evidence.finalVerificationCommands.reason} |`,
    `| unit tests (separate) | \`${record.evidence.unitTests.status}\` | ${record.evidence.unitTests.note || record.evidence.unitTests.command} |`,
    '',
    '## Stack',
    '',
    `- symbols: \`${record.stack.symbols.join(', ')}\``,
    `- runtime: \`${record.stack.backendRuntime}\``,
    `- authentication: \`${record.stack.authentication}\``,
    `- executeVerification: \`${record.executeVerification}\``,
    `- models: default=\`${record.models.default}\`, powerful=\`${record.models.powerful}\`, economical=\`${record.models.economical}\``,
    '',
    '## Report',
    '',
    `- reportStatus: \`${record.reportStatus}\``,
    `- httpEquivalentStatus: \`${record.httpEquivalentStatus}\``,
    `- runId: \`${record.runId ?? 'n/a'}\``,
    `- workspaceRoot: \`${record.workspaceRoot ?? 'n/a'}\``,
    `- durationMs: \`${record.durationMs}\``,
    `- filesTouched: \`${record.filesTouched}\``,
    `- repairAttempts: \`${record.repairAttempts}\``,
    '',
  ];

  if (record.generatedBatches.length) {
    lines.push('## Batches', '');
    for (const batch of record.generatedBatches) {
      lines.push(`- **${batch.batchId}** (${batch.fileCount} files): ${batch.summary}`);
    }
    lines.push('');
  }

  if (record.verificationSummary.length) {
    lines.push('## Verification steps', '');
    for (const step of record.verificationSummary) {
      lines.push(`- \`${step.stepId}\`: **${step.status}**${step.message ? ` — ${step.message}` : ''}`);
    }
    lines.push('');
  } else {
    lines.push('## Verification steps', '', '_none executed_', '');
  }

  if (record.unresolvedIssues.length) {
    lines.push('## Unresolved issues', '');
    for (const issue of record.unresolvedIssues) lines.push(`- ${issue}`);
    lines.push('');
  }

  if (record.error) {
    lines.push('## Error', '', '```text', record.error, '```', '');
  }

  lines.push(
    '## Notes',
    '',
    '- This file is evidence for `docs/tasks-checklist.md` Phase 5.',
    '- Secrets are never written here.',
    '- Re-run: `bun run dry-run:pipeline`',
    '',
  );

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<number> {
  const cli = parseArgs(process.argv.slice(2));
  const configured = hasGeminiApiKeys();
  const gemini = configured ? new GeminiProjectGenerationModel({}) : null;
  const models = gemini?.resolvedModels() ?? resolveGeminiModels();
  const model = models.powerful;
  const workspaceBase = resolvePipelineWorkspaceBase();
  const started = Date.now();

  const unitTestsEvidence = {
    status: 'not_run' as const,
    command: 'bun test',
    note: 'Recorded separately in checklist; this script does not invoke the unit suite.',
  };

  if (!configured || !gemini) {
    const record: DryRunRecord = {
      recordedAt: new Date().toISOString(),
      mode: 'pipeline-dry-run',
      executeVerification: cli.executeVerification,
      stack: {
        symbols: [...cli.symbols],
        backendRuntime: cli.backendRuntime,
        authentication: cli.authentication,
      },
      model,
      models,
      workspaceBase,
      httpEquivalentStatus: null,
      reportStatus: 'not_run',
      verificationSummary: [],
      unresolvedIssues: ['GEMINI_API_KEY is not configured'],
      generatedBatches: [],
      filesTouched: 0,
      repairAttempts: 0,
      durationMs: Date.now() - started,
      error: 'GEMINI_API_KEY is not configured. Set it in .env and re-run.',
      evidence: {
        unitTests: unitTestsEvidence,
        liveGeminiDryRun: {
          status: 'not_run',
          reason: 'GEMINI_API_KEY missing',
        },
        finalVerificationCommands: {
          status: 'not_run',
          reason: 'Dry-run aborted before orchestration',
        },
      },
    };
    await persist(record);
    console.error(record.error);
    return 2;
  }

  await mkdir(workspaceBase, { recursive: true });

  const orchestrator = new PipelineOrchestrator({
    model: gemini,
    workspaceBaseDir: workspaceBase,
    mode: 'pipeline',
    autoApprovePlan: true,
    executeVerification: cli.executeVerification,
  });

  let report: FinalProjectReport | null = null;
  let errorMessage: string | undefined;

  try {
    report = await orchestrator.run({
      symbols: [...cli.symbols],
      backendRuntime: cli.backendRuntime,
      authentication: cli.authentication,
      projectName: cli.projectName,
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const live = classifyLiveDryRun(report, errorMessage);
  const verificationSummary = report?.verificationResults.map((result) => ({
    stepId: result.stepId,
    status: result.status,
    ...(result.message ? { message: result.message } : {}),
  })) ?? [];

  const finalVerification = !cli.executeVerification
    ? {
        status: 'skipped' as const,
        reason: 'executeVerification=false (dry-run default). Pass --verify to execute commands.',
      }
    : verificationSummary.length === 0
      ? {
          status: 'not_run' as const,
          reason: 'No verification steps were produced by the architecture plan.',
        }
      : verificationSummary.some((step) => step.status === 'failed')
        ? {
            status: 'failed' as const,
            reason: verificationSummary.find((step) => step.status === 'failed')?.message
              || 'At least one verification step failed',
          }
        : verificationSummary.every((step) => step.status === 'passed' || step.status === 'skipped')
          ? {
              status: 'passed' as const,
              reason: `All executed steps passed or skipped (${verificationSummary.length} steps)`,
            }
          : {
              status: 'not_run' as const,
              reason: 'Verification results present but inconclusive',
            };

  const record: DryRunRecord = {
    recordedAt: new Date().toISOString(),
    mode: 'pipeline-dry-run',
    executeVerification: cli.executeVerification,
    stack: {
      symbols: [...cli.symbols],
      backendRuntime: cli.backendRuntime,
      authentication: cli.authentication,
    },
    model,
    models,
    workspaceBase,
    httpEquivalentStatus: report ? reportHttpStatus(report.status) : null,
    reportStatus: report?.status ?? 'not_run',
    verificationSummary,
    unresolvedIssues: report?.unresolvedIssues ?? (errorMessage ? [errorMessage] : []),
    generatedBatches: report?.generatedBatches ?? [],
    filesTouched: report?.files.length ?? 0,
    repairAttempts: report?.repairAttempts ?? 0,
    runId: report?.runLog.runId,
    workspaceRoot: report?.runLog.runId
      ? path.join(workspaceBase, report.runLog.runId)
      : undefined,
    durationMs: Date.now() - started,
    ...(errorMessage ? { error: errorMessage } : {}),
    evidence: {
      unitTests: unitTestsEvidence,
      liveGeminiDryRun: live,
      finalVerificationCommands: finalVerification,
    },
  };

  await persist(record);

  console.log(JSON.stringify({
    liveGeminiDryRun: record.evidence.liveGeminiDryRun.status,
    finalVerificationCommands: record.evidence.finalVerificationCommands.status,
    reportStatus: record.reportStatus,
    runId: record.runId,
    durationMs: record.durationMs,
    unresolvedIssues: record.unresolvedIssues.slice(0, 3),
  }, null, 2));

  if (live.status === 'not_run') return 2;
  return live.status === 'passed' ? 0 : 1;
}

async function persist(record: DryRunRecord): Promise<void> {
  const root = process.cwd();
  const resultsDir = path.join(root, 'test-results');
  const docsDir = path.join(root, 'docs');
  await mkdir(resultsDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  const jsonPath = path.join(resultsDir, 'pipeline-dry-run.json');
  const mdPath = path.join(docsDir, 'pipeline-dry-run-result.md');

  await writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  await writeFile(mdPath, toMarkdown(record), 'utf8');

  console.error(`Wrote ${jsonPath}`);
  console.error(`Wrote ${mdPath}`);
}

const code = await main();
process.exit(code);
