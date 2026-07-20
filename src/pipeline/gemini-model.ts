import { generateGeminiContent, GeminiRequestError } from '../gemini-client';
import {
  GeminiApiKeyRotator,
  resolveGeminiApiKeys,
  sharedGeminiApiKeyRotator,
} from '../gemini-api-keys';
import {
  resolveGeminiModel,
  resolveGeminiModels,
  sanitizeGeminiModelId,
  type GeminiModelTask,
  type GeminiModelTier,
} from '../gemini-models';
import { PipelineError } from './errors';
import type {
  ArchitecturePlanningInput,
  BatchGenerationInput,
  ProjectGenerationModel,
  RepairInput,
} from './model';
import {
  validateArchitecturePlan,
  validateGenerationBatchResult,
  validateRepairResult,
  type SchemaValidationResult,
} from './schemas';
import type { ArchitecturePlan, GenerationBatchResult, RepairResult } from './types';

export type GeminiModelOptions = {
  /** Single key (backward compatible). Prefer env multi-key or `apiKeys`. */
  apiKey?: string;
  /** Explicit key list — skips env lookup when provided. */
  apiKeys?: string[];
  /** Shared/custom rotator (preserves cooldowns across calls). */
  keyRotator?: GeminiApiKeyRotator;
  /** Force one model for every task (dry-run / tests). */
  model?: string;
  /** Per-tier overrides when `model` is not set. */
  models?: Partial<Record<GeminiModelTier, string>>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxInvalidResponseRetries?: number;
  maxRequestRetries?: number;
  requestRetryDelayMs?: number;
};

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    : trimmed;
  try {
    return JSON.parse(withoutFence);
  } catch (error) {
    throw new PipelineError(
      'MODEL_RESPONSE_INVALID',
      `Model returned malformed JSON: ${error instanceof Error ? error.message : 'parse error'}`,
      { text: withoutFence.slice(0, 500) },
    );
  }
}

function resolveRotator(options: GeminiModelOptions): GeminiApiKeyRotator {
  if (options.keyRotator) return options.keyRotator;
  if (options.apiKeys?.length) return new GeminiApiKeyRotator(options.apiKeys);

  // Explicit single key without a custom env object → isolated (unit tests).
  if (options.apiKey?.trim() && options.env === undefined) {
    return new GeminiApiKeyRotator([options.apiKey.trim()]);
  }

  if (options.env) {
    const fromEnv = resolveGeminiApiKeys(options.env);
    if (fromEnv.length > 0) return new GeminiApiKeyRotator(fromEnv);
    if (options.apiKey?.trim()) return new GeminiApiKeyRotator([options.apiKey.trim()]);
    throw new Error('Gemini API is not configured. Set GEMINI_API_KEY (and optional GEMINI_API_KEY_2…).');
  }

  return sharedGeminiApiKeyRotator(process.env);
}

export class GeminiProjectGenerationModel implements ProjectGenerationModel {
  private readonly rotator: GeminiApiKeyRotator;
  private readonly forcedModel?: string;
  private readonly models?: Partial<Record<GeminiModelTier, string>>;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxInvalidResponseRetries: number;
  private readonly maxRequestRetries: number;
  private readonly requestRetryDelayMs: number;
  lastUsage?: { promptTokens?: number; completionTokens?: number };
  lastModel?: string;
  lastKeyId?: string;

  constructor(options: GeminiModelOptions) {
    this.rotator = resolveRotator(options);
    this.forcedModel = options.model?.trim()
      ? sanitizeGeminiModelId(options.model, resolveGeminiModel('default', options.env ?? process.env, options.models))
      : undefined;
    this.models = options.models;
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 240_000;
    this.maxInvalidResponseRetries = options.maxInvalidResponseRetries ?? 2;
    this.maxRequestRetries = options.maxRequestRetries ?? 4;
    this.requestRetryDelayMs = options.requestRetryDelayMs ?? 8_000;
  }

  modelFor(task: GeminiModelTask): string {
    if (this.forcedModel) return this.forcedModel;
    return resolveGeminiModel(task, this.env, this.models);
  }

  resolvedModels(): Record<GeminiModelTier, string> {
    if (this.forcedModel) {
      return {
        default: this.forcedModel,
        powerful: this.forcedModel,
        economical: this.forcedModel,
      };
    }
    return resolveGeminiModels(this.env, this.models);
  }

  keyCount(): number {
    return this.rotator.size;
  }

  async planArchitecture(input: ArchitecturePlanningInput): Promise<ArchitecturePlan> {
    return this.generateValidatedJson('architecture', input.system, input.user, validateArchitecturePlan);
  }

  async generateBatch(input: BatchGenerationInput): Promise<GenerationBatchResult> {
    return this.generateValidatedJson(
      'codebase',
      input.system,
      input.user,
      (raw) => validateGenerationBatchResult(raw, {
        expectedBatchId: input.batchId,
        allowlist: input.allowlist,
      }),
      'BATCH_SCOPE_VIOLATION',
    );
  }

  async repairFailure(input: RepairInput): Promise<RepairResult> {
    return this.generateValidatedJson(
      'codebase',
      input.system,
      input.user,
      (raw) => validateRepairResult(raw, {
        allowlist: input.allowlist,
        maxFiles: input.maxFiles,
      }),
      'BATCH_SCOPE_VIOLATION',
    );
  }

  private async generateValidatedJson<T>(
    task: GeminiModelTask,
    system: string,
    user: string,
    validate: (raw: unknown) => SchemaValidationResult<T>,
    invalidCode: 'MODEL_RESPONSE_INVALID' | 'BATCH_SCOPE_VIOLATION' = 'MODEL_RESPONSE_INVALID',
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxInvalidResponseRetries; attempt += 1) {
      try {
        const text = await this.callGemini(task, system, user, attempt > 0);
        const raw = parseJsonObject(text);
        const validated = validate(raw);
        if (validated.ok === false) {
          throw new PipelineError(invalidCode, validated.errors.join('; '), { errors: validated.errors });
        }
        return validated.value;
      } catch (error) {
        lastError = error;
        const retryable = error instanceof PipelineError
          && (error.code === 'MODEL_RESPONSE_INVALID' || error.code === 'BATCH_SCOPE_VIOLATION');
        if (!retryable) throw error;
      }
    }
    throw lastError instanceof PipelineError
      ? lastError
      : new PipelineError('MODEL_RESPONSE_INVALID', 'Model response invalid after retries');
  }

  private async callGemini(
    task: GeminiModelTask,
    system: string,
    user: string,
    isRetry: boolean,
  ): Promise<string> {
    const model = this.modelFor(task);
    this.lastModel = model;
    const retrySuffix = isRetry
      ? `\n\nPrevious response failed schema validation. Return ONLY one JSON object with ALL required top-level keys.
Required architecture keys when planning: summary, assumptions, dependencies, repositoryTree, files, batches, verificationPlan.
Do not omit arrays — use [] if empty. No markdown fences.`
      : '';

    try {
      const result = await generateGeminiContent({
        model,
        system,
        user: user + retrySuffix,
        rotator: this.rotator,
        env: this.env,
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
        maxAttempts: Math.max(this.maxRequestRetries + 1, this.rotator.size * 2),
        retryDelayMs: this.requestRetryDelayMs,
        responseMimeType: 'application/json',
      });
      this.lastUsage = result.usage;
      this.lastKeyId = result.keyId;
      return result.text;
    } catch (error) {
      if (error instanceof GeminiRequestError) {
        throw new PipelineError(
          error.message.includes('no text') ? 'MODEL_RESPONSE_INVALID' : 'MODEL_REQUEST_FAILED',
          error.message,
          { status: error.status, model: error.model, keyId: error.keyId, cause: error },
        );
      }
      throw error;
    }
  }
}
