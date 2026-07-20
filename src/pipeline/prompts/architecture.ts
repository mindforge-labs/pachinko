import { serializeStackForPrompt } from '../specification';
import type { ProjectSpecification, StackCompatibilityResult } from '../types';
import { buildStableSystemInstruction } from './system';

export type ArchitecturePlanningPromptInput = {
  specification: ProjectSpecification;
  compatibility: Extract<StackCompatibilityResult, { compatible: true }>;
};

export function buildArchitecturePlanningPrompt(input: ArchitecturePlanningPromptInput): {
  system: string;
  user: string;
} {
  const { specification, compatibility } = input;

  const user = `Produce an architecture plan and implementation batch manifest for this project.
Do NOT generate full source code in this phase.

SELECTED STACK (JSON)
${serializeStackForPrompt(specification)}

PROJECT SPECIFICATION
${JSON.stringify({
    projectName: specification.projectName,
    description: specification.description,
    features: specification.features,
    constraints: specification.constraints,
  }, null, 2)}

COMPATIBILITY RESULT
${JSON.stringify({
    compatible: true,
    warnings: compatibility.warnings,
    resolvedAdapters: compatibility.resolvedAdapters,
  }, null, 2)}

REQUIREMENTS
- Return JSON only matching the architecture plan schema.
- Batches must be bounded: at most 8 files per batch, or one small feature/module.
- Each batch needs batchId, title, goal, allowedFiles, dependsOn, acceptanceCriteria, verificationCommands.
- Include repositoryTree, file manifest with batchId ownership, supporting dependencies, and a verification plan.
- Do not request or emit complete source code here.
- Keep Vietnamese summaries allowed in text fields if helpful; keep paths and commands in English.

REQUIRED JSON SHAPE (all keys required; use [] when a list is empty)
{
  "summary": string,
  "assumptions": string[],
  "dependencies": [{
    "packageName": string,
    "version": string,
    "category": string,
    "purpose": string,
    "reasonBuiltInCapabilityIsInsufficient": string
  }],
  "repositoryTree": [{ "path": string, "type": "file"|"directory", "description"?: string }],
  "files": [{ "path": string, "purpose": string, "batchId": string }],
  "batches": [{
    "batchId": string,
    "title": string,
    "goal": string,
    "allowedFiles": string[],
    "dependsOn": string[],
    "acceptanceCriteria": string[],
    "verificationCommands": string[]
  }],
  "verificationPlan": [{
    "id": string,
    "name": string,
    "command": string[],
    "required": boolean,
    "cwd"?: string
  }]
}`;

  return {
    system: buildStableSystemInstruction(),
    user,
  };
}
