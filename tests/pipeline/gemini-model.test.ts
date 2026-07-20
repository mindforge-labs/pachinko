import { describe, expect, test } from 'bun:test';
import { GeminiProjectGenerationModel } from '../../src/pipeline/gemini-model';

describe('GeminiProjectGenerationModel model routing', () => {
  test('routes architecture and codebase to powerful, classify to economical', () => {
    const model = new GeminiProjectGenerationModel({
      apiKey: 'test-key',
      env: {},
    });
    expect(model.modelFor('architecture')).toBe('gemini-3.1-pro-preview');
    expect(model.modelFor('codebase')).toBe('gemini-3.1-pro-preview');
    expect(model.modelFor('tech-stack')).toBe('gemini-3.5-flash');
    expect(model.modelFor('classify')).toBe('gemini-3.1-flash-lite');
  });

  test('planArchitecture hits the powerful model endpoint', async () => {
    const calls: string[] = [];
    const plan = {
      summary: 'Minimal plan',
      assumptions: [],
      dependencies: [],
      repositoryTree: [{ path: 'README.md', type: 'file' }],
      files: [{ path: 'README.md', purpose: 'docs', batchId: 'b1' }],
      batches: [{
        batchId: 'b1',
        title: 'Bootstrap',
        goal: 'Create readme',
        allowedFiles: ['README.md'],
        dependsOn: [],
        acceptanceCriteria: ['readme exists'],
        verificationCommands: [],
      }],
      verificationPlan: [],
    };

    const model = new GeminiProjectGenerationModel({
      apiKey: 'test-key',
      env: {},
      maxInvalidResponseRetries: 0,
      maxRequestRetries: 0,
      fetchImpl: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }],
        }), { status: 200 });
      },
    });

    await model.planArchitecture({ system: 'sys', user: 'user' });
    expect(calls[0]).toContain('/models/gemini-3.1-pro-preview:generateContent');
    expect(model.lastModel).toBe('gemini-3.1-pro-preview');
  });

  test('forced model overrides all tiers', () => {
    expect(new GeminiProjectGenerationModel({
      apiKey: 'test-key',
      model: 'gemini-forced',
      env: {},
    }).modelFor('classify')).toBe('gemini-forced');
  });
});
