import { PipelineError } from './errors';
import type {
  ArchitecturePlan,
  GeneratedFile,
  GenerationBatchResult,
  RepairResult,
  SupportingDependencyDecision,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export const MAX_GENERATED_FILE_BYTES = 512_000;

export type SchemaValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function fail<T>(errors: string[]): SchemaValidationResult<T> {
  return { ok: false, errors };
}

function validateDependency(raw: unknown, index: number, errors: string[]): SupportingDependencyDecision | null {
  if (!isRecord(raw)) {
    errors.push(`dependencies[${index}] must be an object`);
    return null;
  }
  const required = ['packageName', 'version', 'category', 'purpose', 'reasonBuiltInCapabilityIsInsufficient'] as const;
  for (const key of required) {
    if (!isString(raw[key]) || !raw[key].trim()) {
      errors.push(`dependencies[${index}].${key} must be a non-empty string`);
    }
  }
  if (errors.length) return null;
  return {
    packageName: raw.packageName as string,
    version: raw.version as string,
    category: raw.category as string,
    purpose: raw.purpose as string,
    reasonBuiltInCapabilityIsInsufficient: raw.reasonBuiltInCapabilityIsInsufficient as string,
  };
}

export function validateArchitecturePlan(input: unknown): SchemaValidationResult<ArchitecturePlan> {
  const errors: string[] = [];
  if (!isRecord(input)) return fail(['Architecture plan must be an object']);

  if (!isString(input.summary) || !input.summary.trim()) errors.push('summary is required');
  if (!Array.isArray(input.assumptions) || !input.assumptions.every(isString)) {
    errors.push('assumptions must be a string array');
  }
  if (!Array.isArray(input.dependencies)) errors.push('dependencies must be an array');
  if (!Array.isArray(input.repositoryTree)) errors.push('repositoryTree must be an array');
  if (!Array.isArray(input.files)) errors.push('files must be an array');
  if (!Array.isArray(input.batches) || input.batches.length === 0) {
    errors.push('batches must be a non-empty array');
  }
  if (!Array.isArray(input.verificationPlan)) errors.push('verificationPlan must be an array');

  if (errors.length) return fail(errors);

  const dependencies: SupportingDependencyDecision[] = [];
  for (const [index, dep] of (input.dependencies as unknown[]).entries()) {
    const before = errors.length;
    const parsed = validateDependency(dep, index, errors);
    if (parsed) dependencies.push(parsed);
    else if (errors.length === before) errors.push(`dependencies[${index}] is invalid`);
  }

  const repositoryTree = [];
  for (const [index, node] of (input.repositoryTree as unknown[]).entries()) {
    if (!isRecord(node) || !isString(node.path) || (node.type !== 'file' && node.type !== 'directory')) {
      errors.push(`repositoryTree[${index}] must have path and type file|directory`);
      continue;
    }
    repositoryTree.push({
      path: node.path,
      type: node.type as 'file' | 'directory',
      ...(isString(node.description) ? { description: node.description } : {}),
    });
  }

  const files = [];
  for (const [index, file] of (input.files as unknown[]).entries()) {
    if (!isRecord(file) || !isString(file.path) || !isString(file.purpose) || !isString(file.batchId)) {
      errors.push(`files[${index}] must include path, purpose, and batchId`);
      continue;
    }
    files.push({ path: file.path, purpose: file.purpose, batchId: file.batchId });
  }

  const batches = [];
  const batchIds = new Set<string>();
  for (const [index, batch] of (input.batches as unknown[]).entries()) {
    if (!isRecord(batch)) {
      errors.push(`batches[${index}] must be an object`);
      continue;
    }
    if (!isString(batch.batchId) || !batch.batchId.trim()) errors.push(`batches[${index}].batchId is required`);
    if (!isString(batch.title) || !batch.title.trim()) errors.push(`batches[${index}].title is required`);
    if (!isString(batch.goal) || !batch.goal.trim()) errors.push(`batches[${index}].goal is required`);
    if (!isStringArray(batch.allowedFiles) || batch.allowedFiles.length === 0) {
      errors.push(`batches[${index}].allowedFiles must be a non-empty string array`);
    }
    if (!isStringArray(batch.dependsOn)) errors.push(`batches[${index}].dependsOn must be a string array`);
    if (!isStringArray(batch.acceptanceCriteria) || batch.acceptanceCriteria.length === 0) {
      errors.push(`batches[${index}].acceptanceCriteria must be a non-empty string array`);
    }
    if (!isStringArray(batch.verificationCommands)) {
      errors.push(`batches[${index}].verificationCommands must be a string array`);
    }
    if (isString(batch.batchId)) {
      if (batchIds.has(batch.batchId)) errors.push(`duplicate batchId: ${batch.batchId}`);
      batchIds.add(batch.batchId);
    }
    if (errors.some((e) => e.startsWith(`batches[${index}]`))) continue;
    batches.push({
      batchId: batch.batchId as string,
      title: batch.title as string,
      goal: batch.goal as string,
      allowedFiles: batch.allowedFiles as string[],
      dependsOn: batch.dependsOn as string[],
      acceptanceCriteria: batch.acceptanceCriteria as string[],
      verificationCommands: batch.verificationCommands as string[],
    });
  }

  for (const batch of batches) {
    for (const dep of batch.dependsOn) {
      if (!batchIds.has(dep)) errors.push(`batch ${batch.batchId} depends on unknown batch ${dep}`);
    }
  }

  const verificationPlan = [];
  for (const [index, step] of (input.verificationPlan as unknown[]).entries()) {
    if (!isRecord(step) || !isString(step.id) || !isString(step.name) || !Array.isArray(step.command)
      || !step.command.every(isString) || typeof step.required !== 'boolean') {
      errors.push(`verificationPlan[${index}] is invalid`);
      continue;
    }
    verificationPlan.push({
      id: step.id,
      name: step.name,
      command: step.command as string[],
      required: step.required,
      ...(isString(step.cwd) ? { cwd: step.cwd } : {}),
    });
  }

  if (errors.length) return fail(errors);

  return {
    ok: true,
    value: {
      summary: input.summary as string,
      assumptions: input.assumptions as string[],
      dependencies,
      repositoryTree,
      files,
      batches,
      verificationPlan,
    },
  };
}

export function validateGeneratedFiles(
  files: unknown,
  options: { allowlist?: string[]; maxBytes?: number } = {},
): SchemaValidationResult<GeneratedFile[]> {
  const errors: string[] = [];
  if (!Array.isArray(files)) return fail(['files must be an array']);

  const allowlist = options.allowlist ? new Set(options.allowlist) : null;
  const maxBytes = options.maxBytes ?? MAX_GENERATED_FILE_BYTES;
  const seen = new Set<string>();
  const result: GeneratedFile[] = [];

  for (const [index, raw] of files.entries()) {
    if (!isRecord(raw)) {
      errors.push(`files[${index}] must be an object`);
      continue;
    }
    if (!isString(raw.path) || !raw.path.trim()) {
      errors.push(`files[${index}].path is required`);
      continue;
    }
    const path = raw.path;
    if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
      errors.push(`files[${index}].path is unsafe: ${path}`);
      continue;
    }
    if (seen.has(path)) {
      errors.push(`duplicate file path: ${path}`);
      continue;
    }
    seen.add(path);

    const operation = raw.operation;
    if (operation !== 'create' && operation !== 'update' && operation !== 'delete') {
      errors.push(`files[${index}].operation must be create|update|delete`);
      continue;
    }
    if (allowlist && !allowlist.has(path)) {
      errors.push(`files[${index}].path is outside allowlist: ${path}`);
      continue;
    }
    if (operation !== 'delete') {
      if (!isString(raw.content)) {
        errors.push(`files[${index}].content is required for ${operation}`);
        continue;
      }
      if (Buffer.byteLength(raw.content, 'utf8') > maxBytes) {
        errors.push(`files[${index}] exceeds max size of ${maxBytes} bytes`);
        continue;
      }
    }
    result.push({
      path,
      operation,
      ...(operation === 'delete' ? {} : { content: raw.content as string }),
    });
  }

  if (errors.length) return fail(errors);
  return { ok: true, value: result };
}

export function validateGenerationBatchResult(
  input: unknown,
  options: { expectedBatchId?: string; allowlist?: string[] } = {},
): SchemaValidationResult<GenerationBatchResult> {
  const errors: string[] = [];
  if (!isRecord(input)) return fail(['Batch result must be an object']);
  if (!isString(input.batchId) || !input.batchId.trim()) errors.push('batchId is required');
  if (options.expectedBatchId && input.batchId !== options.expectedBatchId) {
    errors.push(`expected batchId ${options.expectedBatchId}, got ${String(input.batchId)}`);
  }
  if (!isString(input.summary) || !input.summary.trim()) errors.push('summary is required');
  if (!Array.isArray(input.notes) || !input.notes.every(isString)) errors.push('notes must be a string array');
  if (!Array.isArray(input.commands)) errors.push('commands must be an array');

  const filesResult = validateGeneratedFiles(input.files, { allowlist: options.allowlist });
  if (!filesResult.ok) errors.push(...filesResult.errors);

  const commands = [];
  if (Array.isArray(input.commands)) {
    for (const [index, cmd] of input.commands.entries()) {
      if (!isRecord(cmd) || !isString(cmd.label) || !Array.isArray(cmd.command) || !cmd.command.every(isString)) {
        errors.push(`commands[${index}] is invalid`);
        continue;
      }
      commands.push({
        label: cmd.label,
        command: cmd.command as string[],
        ...(isString(cmd.cwd) ? { cwd: cmd.cwd } : {}),
      });
    }
  }

  if (errors.length || !filesResult.ok) return fail(errors);
  return {
    ok: true,
    value: {
      batchId: input.batchId as string,
      summary: input.summary as string,
      files: filesResult.value,
      commands,
      notes: input.notes as string[],
    },
  };
}

export function validateRepairResult(
  input: unknown,
  options: { allowlist?: string[]; maxFiles?: number } = {},
): SchemaValidationResult<RepairResult> {
  const errors: string[] = [];
  if (!isRecord(input)) return fail(['Repair result must be an object']);
  if (!isString(input.summary) || !input.summary.trim()) errors.push('summary is required');
  if (!Array.isArray(input.notes) || !input.notes.every(isString)) errors.push('notes must be a string array');

  const filesResult = validateGeneratedFiles(input.files, { allowlist: options.allowlist });
  if (!filesResult.ok) errors.push(...filesResult.errors);
  else if (options.maxFiles != null && filesResult.value.length > options.maxFiles) {
    errors.push(`repair may change at most ${options.maxFiles} files`);
  }

  if (errors.length || !filesResult.ok) return fail(errors);
  return {
    ok: true,
    value: {
      summary: input.summary as string,
      files: filesResult.value,
      notes: input.notes as string[],
    },
  };
}

export function assertValidOrThrow<T>(result: SchemaValidationResult<T>, code: 'MODEL_RESPONSE_INVALID' | 'BATCH_SCOPE_VIOLATION' = 'MODEL_RESPONSE_INVALID'): T {
  if (!result.ok) {
    throw new PipelineError(code, result.errors.join('; '), { errors: result.errors });
  }
  return result.value;
}
