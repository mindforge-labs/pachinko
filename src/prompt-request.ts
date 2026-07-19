import { compatibleRuntimeIds, LAYER_LABELS, REEL_LAYERS, techById, technologyById } from './techstack';
import type { PromptStackItem } from './gemini-prompt';

export type ParsedPromptRequest = {
  stack: PromptStackItem[];
  symbols: string[];
  backendRuntime: string;
  authentication: boolean;
};

export type PromptRequestResult =
  | { ok: true; value: ParsedPromptRequest }
  | { ok: false; error: string };

export function parsePromptRequest(input: unknown): PromptRequestResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const body = input as { symbols?: unknown; backendRuntime?: unknown; authentication?: unknown };

  if (!Array.isArray(body.symbols) || body.symbols.length !== REEL_LAYERS.length) {
    return {
      ok: false,
      error: 'symbols must contain exactly one frontend, backend, and database id.',
    };
  }

  if (typeof body.authentication !== 'boolean') {
    return { ok: false, error: 'authentication must be a boolean.' };
  }

  if (typeof body.backendRuntime !== 'string') {
    return { ok: false, error: 'backendRuntime must be a backend-runtime id.' };
  }

  const runtime = technologyById(body.backendRuntime);
  if (!runtime?.roles.includes('backend-runtime')) {
    return { ok: false, error: `Unknown Backend runtime technology: ${body.backendRuntime}.` };
  }

  const stack: PromptStackItem[] = [];
  const symbols: string[] = [];

  for (const [index, layer] of REEL_LAYERS.entries()) {
    const symbol = body.symbols[index];
    if (typeof symbol !== 'string') {
      return { ok: false, error: `Invalid ${LAYER_LABELS[layer]} id.` };
    }

    const tech = techById(layer, symbol);
    if (!tech) {
      return { ok: false, error: `Unknown ${LAYER_LABELS[layer]} technology: ${symbol}.` };
    }

    symbols.push(tech.id);
    const item: PromptStackItem = {
      id: tech.id,
      name: tech.name,
      layer,
      layerLabel: LAYER_LABELS[layer],
    };
    if (layer === 'be') {
      if (!compatibleRuntimeIds(tech.id).includes(runtime.id)) {
        return { ok: false, error: `${runtime.name} is not compatible with ${tech.name}.` };
      }
      item.runtime = { id: runtime.id, name: runtime.name };
    }
    stack.push(item);
  }

  return { ok: true, value: { stack, symbols, backendRuntime: runtime.id, authentication: body.authentication } };
}
