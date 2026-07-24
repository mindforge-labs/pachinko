import type { GenerationMode } from './types';

export function resolveGenerationMode(
  env: NodeJS.ProcessEnv = process.env,
  bodyMode?: unknown,
): GenerationMode {
  if (bodyMode === 'pipeline' || bodyMode === 'legacy-one-shot') {
    return bodyMode;
  }
  const fromEnv = env.GENERATION_MODE?.trim();
  if (fromEnv === 'pipeline' || fromEnv === 'legacy-one-shot') {
    return fromEnv;
  }
  // Safe default: keep existing one-shot guide behavior until pipeline is opted in.
  return 'legacy-one-shot';
}

export function resolvePipelineWorkspaceBase(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.PIPELINE_WORKSPACE_DIR?.trim() || '/tmp/pachinko-pipeline';
}
