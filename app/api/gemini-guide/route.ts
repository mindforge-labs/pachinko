import { NextResponse } from 'next/server';
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

type GeminiPart = { text?: unknown };
type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string };
};

const readGeminiText = (payload: GeminiResponse) => payload.candidates?.[0]?.content?.parts
  ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
  .join('')
  .trim() ?? '';

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
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
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: prompt }] },
        contents: [{
          role: 'user',
          parts: [{ text: 'Hãy tạo hướng dẫn implementation hoàn chỉnh ngay bây giờ theo system instruction.' }],
        }],
        generationConfig: { maxOutputTokens: 32768 },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return NextResponse.json(
      { error: timedOut ? 'Gemini took too long to respond. Please try again.' : 'Could not reach the Gemini API.' },
      { status: 502 },
    );
  }

  let payload: GeminiResponse;
  try {
    payload = await geminiResponse.json();
  } catch {
    return NextResponse.json({ error: 'Gemini returned an invalid response.' }, { status: 502 });
  }

  if (!geminiResponse.ok) {
    const message = payload.error?.message || `Gemini request failed with status ${geminiResponse.status}.`;
    return NextResponse.json({ error: message }, { status: geminiResponse.status === 429 ? 429 : 502 });
  }

  const guide = readGeminiText(payload);
  if (!guide) {
    return NextResponse.json(
      { error: 'Gemini returned no text. The request may have been blocked by a safety filter.' },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      guide,
      prompt,
      model,
      finishReason: payload.candidates?.[0]?.finishReason ?? null,
      stack: stack.map(({ layer, id, name, runtime }) => ({ layer, id, name, ...(runtime ? { runtime } : {}) })),
      options: { authentication },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
