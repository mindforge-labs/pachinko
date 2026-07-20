import { describe, expect, test } from 'bun:test';
import {
  GeminiApiKeyRotator,
  hasGeminiApiKeys,
  isGeminiInvalidKeyError,
  isGeminiKeyRotationError,
  resetSharedGeminiApiKeyRotator,
  resolveGeminiApiKeys,
} from '../src/gemini-api-keys';
import { generateGeminiContent, GeminiRequestError } from '../src/gemini-client';

describe('gemini api key pool', () => {
  test('reads primary and numbered keys, dedupes identical secrets', () => {
    const slots = resolveGeminiApiKeys({
      GEMINI_API_KEY: 'key-a',
      GEMINI_API_KEY_2: 'key-b',
      GEMINI_API_KEY_3: 'key-a',
      GEMINI_API_KEYS: 'key-c, key-b',
    });
    expect(slots.map((slot) => slot.id)).toEqual(['primary', '2', 'bulk-1']);
    expect(slots.map((slot) => slot.key)).toEqual(['key-a', 'key-b', 'key-c']);
  });

  test('hasGeminiApiKeys detects any configured key', () => {
    expect(hasGeminiApiKeys({})).toBe(false);
    expect(hasGeminiApiKeys({ GEMINI_API_KEY_2: 'only-second' })).toBe(true);
  });

  test('rotator prefers available keys and cools rate-limited ones', () => {
    let now = 1_000;
    const rotator = new GeminiApiKeyRotator(['a', 'b', 'c'], { now: () => now, rateLimitCooldownMs: 100 });
    const first = rotator.acquire();
    rotator.markRateLimited(first.id);
    const second = rotator.acquire();
    expect(second.key).not.toBe(first.key);
    expect(rotator.hasAvailable()).toBe(true);

    rotator.markRateLimited(second.id);
    const third = rotator.acquire();
    expect(third.key).not.toBe(first.key);
    expect(third.key).not.toBe(second.key);

    rotator.markRateLimited(third.id);
    expect(rotator.hasAvailable()).toBe(false);
    now += 150;
    expect(rotator.hasAvailable()).toBe(true);
  });
});

describe('generateGeminiContent key rotation', () => {
  test('rotates to the next key after HTTP 429', async () => {
    resetSharedGeminiApiKeyRotator();
    const seenKeys: string[] = [];
    const rotator = new GeminiApiKeyRotator(['key-1', 'key-2'], { rateLimitCooldownMs: 60_000 });

    const result = await generateGeminiContent({
      model: 'gemini-test',
      system: 'sys',
      user: 'user',
      rotator,
      retryDelayMs: 1,
      maxAttempts: 4,
      fetchImpl: async (_input, init) => {
        const headers = new Headers(init?.headers);
        const key = headers.get('x-goog-api-key') ?? '';
        seenKeys.push(key);
        if (key === 'key-1') {
          return new Response(JSON.stringify({ error: { message: 'Resource exhausted' } }), { status: 429 });
        }
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'ok from key-2' }] }, finishReason: 'STOP' }],
        }), { status: 200 });
      },
    });

    expect(seenKeys).toEqual(['key-1', 'key-2']);
    expect(result.text).toBe('ok from key-2');
    expect(result.keyId).toBe('2');
  });

  test('marks invalid keys and keeps rotating', async () => {
    const rotator = new GeminiApiKeyRotator(['bad', 'good']);
    const result = await generateGeminiContent({
      model: 'gemini-test',
      system: 'sys',
      user: 'user',
      rotator,
      retryDelayMs: 1,
      fetchImpl: async (_input, init) => {
        const key = new Headers(init?.headers).get('x-goog-api-key');
        if (key === 'bad') {
          return new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 });
        }
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'recovered' }] } }],
        }), { status: 200 });
      },
    });
    expect(result.text).toBe('recovered');
    expect(isGeminiInvalidKeyError(400, 'API key not valid')).toBe(true);
    expect(isGeminiKeyRotationError(400, 'API key not valid')).toBe(true);
  });

  test('throws GeminiRequestError when every key is exhausted', async () => {
    const rotator = new GeminiApiKeyRotator(['a', 'b']);
    await expect(generateGeminiContent({
      model: 'gemini-test',
      system: 'sys',
      user: 'user',
      rotator,
      retryDelayMs: 1,
      maxAttempts: 2,
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 }),
    })).rejects.toBeInstanceOf(GeminiRequestError);
  });
});
