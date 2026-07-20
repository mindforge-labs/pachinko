import { serializeStackForPrompt } from '../specification';
import type {
  ArchitecturePlan,
  GenerationBatchPlan,
  ProjectSpecification,
} from '../types';
import { buildStableSystemInstruction } from './system';

export type BatchGenerationPromptInput = {
  specification: ProjectSpecification;
  architecturePlan: ArchitecturePlan;
  batch: GenerationBatchPlan;
  existingFiles: Array<{ path: string; content: string }>;
  priorBatchSummaries: Array<{ batchId: string; summary: string }>;
};

export function buildBatchGenerationPrompt(input: BatchGenerationPromptInput): {
  system: string;
  user: string;
} {
  const allowlist = input.batch.allowedFiles;

  const user = `Generate ONLY the files for the current batch. Return JSON only.

SELECTED STACK (JSON)
${serializeStackForPrompt(input.specification)}

FROZEN ARCHITECTURE SUMMARY
${input.architecturePlan.summary}

CURRENT BATCH
${JSON.stringify({
    batchId: input.batch.batchId,
    title: input.batch.title,
    goal: input.batch.goal,
    allowedFiles: allowlist,
    dependsOn: input.batch.dependsOn,
    acceptanceCriteria: input.batch.acceptanceCriteria,
    verificationCommands: input.batch.verificationCommands,
  }, null, 2)}

PRIOR BATCH SUMMARIES
${JSON.stringify(input.priorBatchSummaries, null, 2)}

RELEVANT EXISTING FILES
${JSON.stringify(input.existingFiles.map(({ path, content }) => ({
    path,
    content: content.length > 12_000 ? `${content.slice(0, 12_000)}\n/* truncated */` : content,
  })), null, 2)}

RESPONSE SCHEMA
{
  "batchId": "${input.batch.batchId}",
  "summary": string,
  "files": [{ "path": string, "operation": "create"|"update"|"delete", "content"?: string }],
  "commands": [{ "label": string, "command": string[] }],
  "notes": string[]
}

CONSTRAINTS
- You may only touch paths in allowedFiles: ${JSON.stringify(allowlist)}
- Prefer create/update over delete.
- No placeholders. Content must be complete for listed files.
- Do not change the core stack.`;

  return {
    system: buildStableSystemInstruction(),
    user,
  };
}
