import {
  GeminiApiKeyRotator,
  isGeminiInvalidKeyError,
  isGeminiKeyRotationError,
  sharedGeminiApiKeyRotator,
  type GeminiApiKeySlot,
} from './gemini-api-keys';

export type GeminiGenerateContentOptions = {
  model: string;
  system: string;
  user: string;
  rotator?: GeminiApiKeyRotator;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Attempts across keys / retries. Defaults to max(keys * 2, 4). */
  maxAttempts?: number;
  /** Base backoff when every key is cooling. */
  retryDelayMs?: number;
  generationConfig?: Record<string, unknown>;
  responseMimeType?: string;
};

export type GeminiGenerateContentResult = {
  text: string;
  model: string;
  keyId: string;
  finishReason: string | null;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
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

export class GeminiRequestError extends Error {
  readonly status?: number;
  readonly model: string;
  readonly keyId?: string;
  readonly retryable: boolean;
  readonly timedOut: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      model: string;
      keyId?: string;
      retryable?: boolean;
      timedOut?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'GeminiRequestError';
    this.status = options.status;
    this.model = options.model;
    this.keyId = options.keyId;
    this.retryable = options.retryable ?? false;
    this.timedOut = options.timedOut ?? false;
  }
}

function readText(payload: GeminiResponse): string {
  return payload.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim() ?? '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOnce(
  options: GeminiGenerateContentOptions,
  slot: GeminiApiKeySlot,
): Promise<GeminiGenerateContentResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 240_000;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': slot.key,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: options.system }] },
        contents: [{ role: 'user', parts: [{ text: options.user }] }],
        generationConfig: {
          maxOutputTokens: 32768,
          ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
          ...options.generationConfig,
        },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new GeminiRequestError(
      timedOut ? 'Gemini request timed out' : 'Could not reach Gemini API',
      {
        model: options.model,
        keyId: slot.id,
        retryable: true,
        timedOut,
        cause: error,
      },
    );
  }

  let payload: GeminiResponse;
  try {
    payload = await response.json();
  } catch {
    throw new GeminiRequestError('Gemini returned non-JSON HTTP body', {
      model: options.model,
      keyId: slot.id,
      status: response.status,
      retryable: response.status >= 500 || response.status === 429,
    });
  }

  if (!response.ok) {
    const message = payload.error?.message || `Gemini failed with status ${response.status}`;
    throw new GeminiRequestError(message, {
      model: options.model,
      keyId: slot.id,
      status: response.status,
      retryable: isGeminiKeyRotationError(response.status, message) || response.status >= 500,
    });
  }

  const text = readText(payload);
  if (!text) {
    throw new GeminiRequestError('Gemini returned no text', {
      model: options.model,
      keyId: slot.id,
      retryable: false,
    });
  }

  return {
    text,
    model: options.model,
    keyId: slot.id,
    finishReason: payload.candidates?.[0]?.finishReason ?? null,
    usage: {
      promptTokens: payload.usageMetadata?.promptTokenCount,
      completionTokens: payload.usageMetadata?.candidatesTokenCount,
    },
  };
}

/**
 * Call Gemini with automatic API-key rotation on rate limits / quota / auth failures.
 */
export async function generateGeminiContent(
  options: GeminiGenerateContentOptions,
): Promise<GeminiGenerateContentResult> {
  const rotator = options.rotator ?? sharedGeminiApiKeyRotator(options.env ?? process.env);
  const maxAttempts = options.maxAttempts ?? Math.max(rotator.size * 2, 4);
  const retryDelayMs = options.retryDelayMs ?? 8_000;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const slot = rotator.acquire();
    try {
      const result = await callOnce(options, slot);
      rotator.markSuccess(slot.id);
      return result;
    } catch (error) {
      lastError = error;
      if (!(error instanceof GeminiRequestError) || !error.retryable) {
        throw error;
      }

      const message = error.message;
      const status = error.status;
      if (isGeminiInvalidKeyError(status, message)) {
        rotator.markInvalid(slot.id);
      } else if (isGeminiKeyRotationError(status, message) || error.timedOut) {
        rotator.markRateLimited(slot.id);
      }

      const hasMoreAttempts = attempt + 1 < maxAttempts;
      if (!hasMoreAttempts) break;

      if (rotator.hasAvailable()) {
        // Another key is ready — rotate immediately.
        continue;
      }

      const waitMs = Math.max(rotator.msUntilNextAvailable(), retryDelayMs * Math.min(attempt + 1, 3));
      await sleep(Math.min(waitMs, 60_000));
    }
  }

  if (lastError instanceof GeminiRequestError) throw lastError;
  throw new GeminiRequestError(
    lastError instanceof Error ? lastError.message : 'Gemini request failed after key rotation',
    { model: options.model, retryable: false, cause: lastError },
  );
}
