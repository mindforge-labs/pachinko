import { NextResponse } from 'next/server';
import { generateGeminiContent, GeminiRequestError } from '../../../src/gemini-client';
import { hasGeminiApiKeys } from '../../../src/gemini-api-keys';
import { resolveGeminiModel } from '../../../src/gemini-models';
import { buildGeminiSystemPrompt } from '../../../src/gemini-prompt';
import { parsePromptRequest } from '../../../src/prompt-request';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Legacy one-shot guide generation (GenerationMode: legacy-one-shot).
 * Prefer POST /api/pipeline with mode=pipeline for batched, verified generation.
 * Uses the default Gemini tier (tech-stack / explain / prompt tasks).
 */
const REQUEST_TIMEOUT_MS = 240_000;

export async function POST(request: Request) {
  if (!hasGeminiApiKeys()) {
    return NextResponse.json(
      { error: 'Gemini API is not configured. Set GEMINI_API_KEY on the server.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = parsePromptRequest(body);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { stack, authentication } = parsed.value;
  const prompt = buildGeminiSystemPrompt(stack, { authentication });
  const model = resolveGeminiModel('tech-stack');

  let result;
  try {
    result = await generateGeminiContent({
      model,
      system: prompt,
      user: 'Hãy tạo hướng dẫn implementation hoàn chỉnh ngay bây giờ theo system instruction.',
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof GeminiRequestError) {
      const timedOut = error.timedOut;
      return NextResponse.json(
        {
          error: timedOut
            ? 'Gemini took too long to respond. Please try again.'
            : error.message || 'Could not reach the Gemini API.',
        },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json({ error: 'Could not reach the Gemini API.' }, { status: 502 });
  }

  return NextResponse.json(
    {
      guide: result.text,
      prompt,
      model: result.model,
      finishReason: result.finishReason,
      keyId: result.keyId,
      stack: stack.map(({ layer, id, name, runtime }) => ({ layer, id, name, ...(runtime ? { runtime } : {}) })),
      options: { authentication },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
