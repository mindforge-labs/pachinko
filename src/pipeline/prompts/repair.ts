import type { CommandResult, ProjectSpecification } from '../types';
import { serializeStackForPrompt } from '../specification';
import { buildStableSystemInstruction } from './system';

export type RepairPromptInput = {
  specification: ProjectSpecification;
  failedCommand: CommandResult;
  expectedBehavior: string;
  changedFiles: Array<{ path: string; content: string }>;
  workspaceDiff?: string;
  allowlist: string[];
  acceptanceCriteria: string[];
};

export function buildRepairPrompt(input: RepairPromptInput): {
  system: string;
  user: string;
} {
  const maxOutput = 20_000;
  const stdout = input.failedCommand.stdout.slice(-Math.floor(maxOutput / 2));
  const stderr = input.failedCommand.stderr.slice(-Math.floor(maxOutput / 2));

  const user = `A verification step failed. Return a minimal JSON repair patch.

SELECTED STACK (JSON)
${serializeStackForPrompt(input.specification)}

EXPECTED BEHAVIOR
${input.expectedBehavior}

FAILED COMMAND
${JSON.stringify({
    command: input.failedCommand.command,
    cwd: input.failedCommand.cwd,
    exitCode: input.failedCommand.exitCode,
    timedOut: input.failedCommand.timedOut,
  }, null, 2)}

STDOUT (truncated)
${stdout}

STDERR (truncated)
${stderr}

ALLOWLIST (only these paths may change)
${JSON.stringify(input.allowlist)}

ACCEPTANCE CRITERIA
${JSON.stringify(input.acceptanceCriteria)}

RELATED FILE CONTENTS
${JSON.stringify(input.changedFiles.map(({ path, content }) => ({
    path,
    content: content.length > 10_000 ? `${content.slice(0, 10_000)}\n/* truncated */` : content,
  })), null, 2)}

${input.workspaceDiff ? `WORKSPACE DIFF\n${input.workspaceDiff.slice(0, 8_000)}` : ''}

RESPONSE SCHEMA
{
  "summary": string,
  "files": [{ "path": string, "operation": "create"|"update"|"delete", "content"?: string }],
  "notes": string[]
}

CONSTRAINTS
- Minimal patch only.
- Do not delete failing tests without a concrete justification in notes.
- Do not change core stack, disable typechecking, or blanket-add any.
- Do not edit paths outside the allowlist.`;

  return {
    system: buildStableSystemInstruction(),
    user,
  };
}
