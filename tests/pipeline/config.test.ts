import { describe, expect, test } from 'bun:test';
import { resolveGenerationMode, resolvePipelineWorkspaceBase } from '../../src/pipeline/config';

describe('pipeline config', () => {
  test('defaults to legacy-one-shot', () => {
    expect(resolveGenerationMode({})).toBe('legacy-one-shot');
  });

  test('body mode overrides env', () => {
    expect(resolveGenerationMode({ GENERATION_MODE: 'legacy-one-shot' }, 'pipeline')).toBe('pipeline');
  });

  test('resolves workspace base dir', () => {
    expect(resolvePipelineWorkspaceBase({ PIPELINE_WORKSPACE_DIR: '/tmp/custom' })).toBe('/tmp/custom');
    expect(resolvePipelineWorkspaceBase({})).toBe('/tmp/pachinko-pipeline');
  });
});
