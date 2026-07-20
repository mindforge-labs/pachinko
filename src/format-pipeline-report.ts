import type { ArchitecturePlan, FinalProjectReport } from './pipeline/types';

/** Format a pipeline final report for the UI result panel (markdown). */
export function formatPipelineReportAsMarkdown(report: FinalProjectReport): string {
  const stack = report.stack;
  const lines: string[] = [
    `# Pipeline report`,
    '',
    `**Status:** \`${report.status}\``,
    '',
    '## Stack',
    '',
    `- Frontend: ${stack.frontend.name} (\`${stack.frontend.id}\`)`,
    `- Backend: ${stack.backend.name} (\`${stack.backend.id}\`)`,
    `- Runtime: ${stack.runtime.name} (\`${stack.runtime.id}\`)`,
    `- Database: ${stack.database.name} (\`${stack.database.id}\`)`,
    '',
  ];

  if (report.architectureSummary) {
    lines.push('## Architecture', '', report.architectureSummary, '');
  }

  if (report.compatibilityWarnings.length) {
    lines.push('## Compatibility warnings', '');
    for (const warning of report.compatibilityWarnings) {
      lines.push(`- \`${warning.code}\`: ${warning.message}`);
    }
    lines.push('');
  }

  if (report.generatedBatches.length) {
    lines.push('## Generated batches', '');
    for (const batch of report.generatedBatches) {
      lines.push(`- **${batch.batchId}** (${batch.fileCount} files): ${batch.summary}`);
    }
    lines.push('');
  }

  if (report.files.length) {
    lines.push('## Files', '');
    for (const file of report.files) {
      lines.push(`- \`${file.operation}\` ${file.path}`);
    }
    lines.push('');
  }

  if (report.verificationResults.length) {
    lines.push('## Verification', '');
    for (const result of report.verificationResults) {
      const detail = result.message ? ` — ${result.message}` : '';
      lines.push(`- \`${result.stepId}\`: **${result.status}**${detail}`);
    }
    lines.push('');
  } else {
    lines.push('## Verification', '', '_No verification steps were executed for this run._', '');
  }

  if (report.repairAttempts > 0) {
    lines.push(`## Repair attempts`, '', String(report.repairAttempts), '');
  }

  if (report.unresolvedIssues.length) {
    lines.push('## Unresolved issues', '');
    for (const issue of report.unresolvedIssues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }

  if (report.howToRun.length) {
    lines.push('## How to run', '');
    for (const step of report.howToRun) {
      lines.push(`- ${step}`);
    }
    lines.push('');
  }

  if (report.limitations.length) {
    lines.push('## Limitations', '');
    for (const item of report.limitations) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  if (report.nextDeploymentSteps.length) {
    lines.push('## Next deployment steps', '');
    for (const step of report.nextDeploymentSteps) {
      lines.push(`- ${step}`);
    }
    lines.push('');
  }

  const log = report.runLog;
  lines.push(
    '## Run log',
    '',
    `- Run id: \`${log.runId}\``,
    `- Stage: \`${log.stage}\``,
    `- Workspace files touched: ${log.changedFiles.length}`,
    `- Commands recorded: ${log.commandSummaries.length}`,
    '',
  );

  return lines.join('\n').trim() + '\n';
}

/** Compact runbook for the prompt/result secondary tab in pipeline mode. */
export function formatPipelineRunbook(report: FinalProjectReport): string {
  const stack = report.stack;
  return [
    'PIPELINE RUNBOOK',
    '',
    `Status: ${report.status}`,
    `Run id: ${report.runLog.runId}`,
    '',
    'Stack:',
    `- ${stack.frontend.name} + ${stack.backend.name} (${stack.runtime.name}) + ${stack.database.name}`,
    '',
    report.architectureSummary ? `Architecture:\n${report.architectureSummary}\n` : '',
    'How to run:',
    ...report.howToRun.map((step) => `- ${step}`),
    '',
    'Next steps:',
    ...report.nextDeploymentSteps.map((step) => `- ${step}`),
    '',
  ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
}

/** Format an architecture plan for the approval UX. */
export function formatArchitecturePlanAsMarkdown(plan: ArchitecturePlan): string {
  const lines: string[] = [
    '# Architecture plan (awaiting approval)',
    '',
    plan.summary,
    '',
  ];

  if (plan.assumptions.length) {
    lines.push('## Assumptions', '');
    for (const item of plan.assumptions) lines.push(`- ${item}`);
    lines.push('');
  }

  if (plan.dependencies.length) {
    lines.push('## Supporting dependencies', '');
    for (const dep of plan.dependencies) {
      lines.push(`- \`${dep.packageName}@${dep.version}\` (${dep.category}) — ${dep.purpose}`);
    }
    lines.push('');
  }

  if (plan.batches.length) {
    lines.push('## Implementation batches', '');
    for (const batch of plan.batches) {
      lines.push(`### ${batch.batchId}: ${batch.title}`);
      lines.push('');
      lines.push(batch.goal);
      lines.push('');
      lines.push(`- Allowed files: ${batch.allowedFiles.map((file) => `\`${file}\``).join(', ') || '_none_'}`);
      if (batch.dependsOn.length) {
        lines.push(`- Depends on: ${batch.dependsOn.map((id) => `\`${id}\``).join(', ')}`);
      }
      lines.push('- Acceptance:');
      for (const criterion of batch.acceptanceCriteria) lines.push(`  - ${criterion}`);
      if (batch.verificationCommands.length) {
        lines.push(`- Verify: ${batch.verificationCommands.map((cmd) => `\`${cmd}\``).join(', ')}`);
      }
      lines.push('');
    }
  }

  if (plan.files.length) {
    lines.push('## File manifest', '');
    for (const file of plan.files) {
      lines.push(`- \`${file.path}\` ← \`${file.batchId}\` — ${file.purpose}`);
    }
    lines.push('');
  }

  if (plan.verificationPlan.length) {
    lines.push('## Verification plan', '');
    for (const step of plan.verificationPlan) {
      const required = step.required ? 'required' : 'optional';
      lines.push(`- \`${step.id}\` (${required}): \`${step.command.join(' ')}\``);
    }
    lines.push('');
  }

  lines.push('_Approve to generate batches, or reject to cancel this run._', '');
  return `${lines.join('\n').trim()}\n`;
}

export function isPipelineReportPayload(payload: unknown): payload is {
  mode: 'pipeline';
  report: FinalProjectReport;
  model?: string;
  stage?: string;
  runId?: string;
  architecturePlan?: ArchitecturePlan;
} {
  if (!payload || typeof payload !== 'object') return false;
  const body = payload as { mode?: unknown; report?: unknown };
  return body.mode === 'pipeline' && Boolean(body.report) && typeof body.report === 'object';
}
