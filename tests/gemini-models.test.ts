import { describe, expect, test } from 'bun:test';
import {
  GEMINI_MODELS,
  GEMINI_MODEL_FOR_TASK,
  resolveGeminiModel,
  resolveGeminiModels,
  sanitizeGeminiModelId,
} from '../src/gemini-models';

describe('gemini model routing', () => {
  test('exposes the configured tier defaults', () => {
    expect(GEMINI_MODELS).toEqual({
      default: 'gemini-3.5-flash',
      powerful: 'gemini-3.1-pro-preview',
      economical: 'gemini-3.1-flash-lite',
    });
  });

  test('maps tasks to tiers', () => {
    expect(GEMINI_MODEL_FOR_TASK['tech-stack']).toBe('default');
    expect(GEMINI_MODEL_FOR_TASK.architecture).toBe('powerful');
    expect(GEMINI_MODEL_FOR_TASK.codebase).toBe('powerful');
    expect(GEMINI_MODEL_FOR_TASK.classify).toBe('economical');
    expect(GEMINI_MODEL_FOR_TASK.normalize).toBe('economical');
    expect(GEMINI_MODEL_FOR_TASK.validate).toBe('economical');
  });

  test('resolves tasks to default model ids', () => {
    const env = {};
    expect(resolveGeminiModel('tech-stack', env)).toBe('gemini-3.5-flash');
    expect(resolveGeminiModel('architecture', env)).toBe('gemini-3.1-pro-preview');
    expect(resolveGeminiModel('codebase', env)).toBe('gemini-3.1-pro-preview');
    expect(resolveGeminiModel('classify', env)).toBe('gemini-3.1-flash-lite');
    expect(resolveGeminiModel('normalize', env)).toBe('gemini-3.1-flash-lite');
    expect(resolveGeminiModel('validate', env)).toBe('gemini-3.1-flash-lite');
  });

  test('GEMINI_MODEL_FORCE forces every task', () => {
    const env = { GEMINI_MODEL_FORCE: 'gemini-2.5-flash' };
    expect(resolveGeminiModel('tech-stack', env)).toBe('gemini-2.5-flash');
    expect(resolveGeminiModel('architecture', env)).toBe('gemini-2.5-flash');
    expect(resolveGeminiModel('classify', env)).toBe('gemini-2.5-flash');
  });

  test('legacy GEMINI_MODEL only overrides the default tier', () => {
    const env = { GEMINI_MODEL: 'gemini-legacy-default' };
    expect(resolveGeminiModel('tech-stack', env)).toBe('gemini-legacy-default');
    expect(resolveGeminiModel('architecture', env)).toBe('gemini-3.1-pro-preview');
    expect(resolveGeminiModel('classify', env)).toBe('gemini-3.1-flash-lite');
  });

  test('per-tier env overrides win when force is unset', () => {
    const env = {
      GEMINI_MODEL_DEFAULT: 'custom-default',
      GEMINI_MODEL_POWERFUL: 'custom-powerful',
      GEMINI_MODEL_ECONOMICAL: 'custom-economical',
    };
    expect(resolveGeminiModels(env)).toEqual({
      default: 'custom-default',
      powerful: 'custom-powerful',
      economical: 'custom-economical',
    });
  });

  test('overrides map is used after env tiers', () => {
    expect(resolveGeminiModel('architecture', {}, { powerful: 'override-pro' })).toBe('override-pro');
  });

  test('sanitizeGeminiModelId rejects invalid ids', () => {
    expect(sanitizeGeminiModelId('gemini-3.5-flash', 'fallback')).toBe('gemini-3.5-flash');
    expect(sanitizeGeminiModelId('bad/model', 'fallback')).toBe('fallback');
    expect(sanitizeGeminiModelId('  ', 'fallback')).toBe('fallback');
  });
});
