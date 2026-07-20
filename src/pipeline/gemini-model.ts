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
  apiKey: string;
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

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown }> };
    finishReason?: string;
  }>;
  error?: { message?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
};

function readText(payload: GeminiResponse): string {
  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim() ?? '';
}

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

export class GeminiProjectGenerationModel implements ProjectGenerationModel {
  private readonly apiKey: string;
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

  constructor(options: GeminiModelOptions) {
    this.apiKey = options.apiKey;
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
        if (!validated.ok) {
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
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRequestRetries; attempt += 1) {
      try {
        return await this.callGeminiOnce(task, system, user, isRetry);
      } catch (error) {
        lastError = error;
        if (!isTransientModelFailure(error) || attempt >= this.maxRequestRetries) {
          throw error;
        }
        const delay = this.requestRetryDelayMs * (attempt + 1);
        await sleep(delay);
      }
    }
    throw lastError instanceof PipelineError
      ? lastError
      : new PipelineError('MODEL_REQUEST_FAILED', 'Gemini request failed after retries');
  }

  private async callGeminiOnce(
    task: GeminiModelTask,
    system: string,
    user: string,
    isRetry: boolean,
  ): Promise<string> {
    const model = this.modelFor(task);
    this.lastModel = model;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const retrySuffix = isRetry
      ? `\n\nPrevious response failed schema validation. Return ONLY one JSON object with ALL required top-level keys.
Required architecture keys when planning: summary, assumptions, dependencies, repositoryTree, files, batches, verificationPlan.
Do not omit arrays — use [] if empty. No markdown fences.`
      : '';

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user + retrySuffix }] }],
          generationConfig: {
            maxOutputTokens: 32768,
            responseMimeType: 'application/json',
          },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new PipelineError(
        'MODEL_REQUEST_FAILED',
        timedOut ? 'Gemini request timed out' : 'Could not reach Gemini API',
        { cause: error, model },
      );
    }

    let payload: GeminiResponse;
    try {
      payload = await response.json();
    } catch {
      throw new PipelineError('MODEL_REQUEST_FAILED', 'Gemini returned non-JSON HTTP body', { model });
    }

    if (!response.ok) {
      throw new PipelineError(
        'MODEL_REQUEST_FAILED',
        payload.error?.message || `Gemini failed with status ${response.status}`,
        { status: response.status, model },
      );
    }

    this.lastUsage = {
      promptTokens: payload.usageMetadata?.promptTokenCount,
      completionTokens: payload.usageMetadata?.candidatesTokenCount,
    };

    const text = readText(payload);
    if (!text) {
      throw new PipelineError('MODEL_RESPONSE_INVALID', 'Gemini returned no text', { model });
    }
    return text;
  }
}

function isTransientModelFailure(error: unknown): boolean {
  if (!(error instanceof PipelineError) || error.code !== 'MODEL_REQUEST_FAILED') return false;
  const message = error.message.toLowerCase();
  const status = typeof error.details === 'object' && error.details && 'status' in error.details
    ? Number((error.details as { status?: number }).status)
    : undefined;
  return status === 429
    || status === 503
    || message.includes('high demand')
    || message.includes('try again later')
    || message.includes('resource exhausted')
    || message.includes('unavailable')
    || message.includes('timed out');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
