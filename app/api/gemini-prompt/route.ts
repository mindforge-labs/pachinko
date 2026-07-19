import { NextResponse } from 'next/server';
import { buildGeminiSystemPrompt } from '../../../src/gemini-prompt';
import { parsePromptRequest } from '../../../src/prompt-request';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = parsePromptRequest(body);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { stack, authentication } = parsed.value;

  return NextResponse.json(
    {
      prompt: buildGeminiSystemPrompt(stack, { authentication }),
      stack: stack.map(({ layer, id, name, runtime }) => ({ layer, id, name, ...(runtime ? { runtime } : {}) })),
      options: { authentication },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
