/**
 * Gemini model tiers and task routing.
 *
 * default     — tech stack, explain choices, create prompts
 * powerful    — architecture planning, complex codebase generation/repair
 * economical  — classify requirements, normalize JSON, validate input
 */

export const GEMINI_MODELS = {
  default: 'gemini-3.5-flash',
  powerful: 'gemini-3.1-pro-preview',
  economical: 'gemini-3.1-flash-lite',
} as const;

export type GeminiModelTier = keyof typeof GEMINI_MODELS;

export type GeminiModelTask =
  | 'tech-stack'
  | 'architecture'
  | 'codebase'
  | 'classify'
  | 'normalize'
  | 'validate';

export const GEMINI_MODEL_FOR_TASK: Record<GeminiModelTask, GeminiModelTier> = {
  'tech-stack': 'default',
  architecture: 'powerful',
  codebase: 'powerful',
  classify: 'economical',
  normalize: 'economical',
  validate: 'economical',
};

const MODEL_PATTERN = /^[a-zA-Z0-9._-]+$/;

const TIER_ENV_KEYS: Record<GeminiModelTier, string> = {
  default: 'GEMINI_MODEL_DEFAULT',
  powerful: 'GEMINI_MODEL_POWERFUL',
  economical: 'GEMINI_MODEL_ECONOMICAL',
};

export function isGeminiModelTier(value: string): value is GeminiModelTier {
  return value === 'default' || value === 'powerful' || value === 'economical';
}

export function isGeminiModelTask(value: string): value is GeminiModelTask {
  return Object.prototype.hasOwnProperty.call(GEMINI_MODEL_FOR_TASK, value);
}

export function sanitizeGeminiModelId(
  value: string | undefined,
  fallback: string,
): string {
  const trimmed = value?.trim();
  if (trimmed && MODEL_PATTERN.test(trimmed)) return trimmed;
  return fallback;
}

/**
 * Resolve a concrete Gemini model id for a tier or task.
 *
 * Priority:
 * 1. `GEMINI_MODEL_FORCE` — one model for every task (escape hatch / dry-run)
 * 2. Per-tier env (`GEMINI_MODEL_DEFAULT` | `_POWERFUL` | `_ECONOMICAL`)
 * 3. `GEMINI_MODEL` — legacy alias for the default tier only
 * 4. Optional `overrides` map
 * 5. `GEMINI_MODELS` defaults
 */
export function resolveGeminiModel(
  tierOrTask: GeminiModelTier | GeminiModelTask,
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<Record<GeminiModelTier, string>>,
): string {
  const forced = env.GEMINI_MODEL_FORCE?.trim();
  if (forced && MODEL_PATTERN.test(forced)) return forced;

  const tier: GeminiModelTier = isGeminiModelTier(tierOrTask)
    ? tierOrTask
    : GEMINI_MODEL_FOR_TASK[tierOrTask];

  const fromEnv = env[TIER_ENV_KEYS[tier]]?.trim();
  if (fromEnv && MODEL_PATTERN.test(fromEnv)) return fromEnv;

  if (tier === 'default') {
    const legacyDefault = env.GEMINI_MODEL?.trim();
    if (legacyDefault && MODEL_PATTERN.test(legacyDefault)) return legacyDefault;
  }

  const fromOverride = overrides?.[tier]?.trim();
  if (fromOverride && MODEL_PATTERN.test(fromOverride)) return fromOverride;

  return GEMINI_MODELS[tier];
}

export function resolveGeminiModels(
  env: NodeJS.ProcessEnv = process.env,
  overrides?: Partial<Record<GeminiModelTier, string>>,
): Record<GeminiModelTier, string> {
  return {
    default: resolveGeminiModel('default', env, overrides),
    powerful: resolveGeminiModel('powerful', env, overrides),
    economical: resolveGeminiModel('economical', env, overrides),
  };
}
