import { describe, expect, test } from 'bun:test';
import { parsePromptRequest } from '../src/prompt-request';

describe('parsePromptRequest', () => {
  test('canonicalizes a valid Express + Bun rolled stack with nested runtime', () => {
    const result = parsePromptRequest({
      symbols: ['react', 'express', 'postgresql'],
      backendRuntime: 'bun',
      authentication: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.symbols).toEqual(['react', 'express', 'postgresql']);
    expect(result.value.backendRuntime).toBe('bun');
    expect(result.value.authentication).toBe(true);
    expect(result.value.stack.map(({ name }) => name)).toEqual(['React', 'Express', 'Postgres']);
    expect(result.value.stack[1].runtime).toEqual({ id: 'bun', name: 'Bun' });
  });

  test('accepts Spring Boot + Kotlin', () => {
    const result = parsePromptRequest({
      symbols: ['vuejs', 'spring', 'mysql'],
      backendRuntime: 'kotlin',
      authentication: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.stack[1].runtime?.name).toBe('Kotlin');
  });

  test('rejects an id that does not belong to its reel', () => {
    const result = parsePromptRequest({
      symbols: ['react', 'postgresql', 'sqlite'],
      backendRuntime: 'nodejs',
      authentication: false,
    });

    expect(result).toEqual({ ok: false, error: 'Unknown Backend technology: postgresql.' });
  });

  test('rejects an incompatible framework/runtime pair', () => {
    const result = parsePromptRequest({
      symbols: ['react', 'spring', 'postgresql'],
      backendRuntime: 'bun',
      authentication: false,
    });

    expect(result).toEqual({ ok: false, error: 'Bun is not compatible with Spring Boot.' });
  });

  test('requires a runtime and explicit authentication decision', () => {
    expect(parsePromptRequest({
      symbols: ['react', 'express', 'postgresql'],
      authentication: false,
    })).toEqual({ ok: false, error: 'backendRuntime must be a backend-runtime id.' });

    expect(parsePromptRequest({
      symbols: ['react', 'express', 'postgresql'],
      backendRuntime: 'nodejs',
    })).toEqual({ ok: false, error: 'authentication must be a boolean.' });
  });
});
