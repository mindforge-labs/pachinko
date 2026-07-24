/**
 * Gemini API key pool with cooldown-based rotation.
 *
 * Reads:
 * - GEMINI_API_KEY (primary)
 * - GEMINI_API_KEY_2 … GEMINI_API_KEY_9
 * - GEMINI_API_KEYS (comma/newline-separated extras)
 */

export type GeminiApiKeySlot = {
  /** Stable label for logs/metrics — never the secret itself. */
  id: string;
  key: string;
};

const NUMBERED_KEY_ENV = /^GEMINI_API_KEY_(\d+)$/;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;
const DEFAULT_INVALID_KEY_COOLDOWN_MS = 30 * 60_000;

export function resolveGeminiApiKeys(env: NodeJS.ProcessEnv = process.env): GeminiApiKeySlot[] {
  const slots: GeminiApiKeySlot[] = [];
  const seen = new Set<string>();

  const push = (id: string, raw: string | undefined) => {
    const key = raw?.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    slots.push({ id, key });
  };

  push('primary', env.GEMINI_API_KEY);

  const numbered = Object.keys(env)
    .map((name) => {
      const match = NUMBERED_KEY_ENV.exec(name);
      return match ? { name, index: Number(match[1]) } : null;
    })
    .filter((entry): entry is { name: string; index: number } => entry !== null)
    .sort((a, b) => a.index - b.index);

  for (const entry of numbered) {
    push(String(entry.index), env[entry.name]);
  }

  const bulk = env.GEMINI_API_KEYS?.split(/[\n,]+/) ?? [];
  let bulkIndex = 0;
  for (const part of bulk) {
    bulkIndex += 1;
    push(`bulk-${bulkIndex}`, part);
  }

  return slots;
}

export function hasGeminiApiKeys(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveGeminiApiKeys(env).length > 0;
}

export class GeminiApiKeyRotator {
  private readonly slots: GeminiApiKeySlot[];
  private readonly cooldownUntil = new Map<string, number>();
  private cursor = 0;
  private readonly rateLimitCooldownMs: number;
  private readonly invalidKeyCooldownMs: number;
  private readonly now: () => number;

  constructor(
    keys: Array<string | GeminiApiKeySlot>,
    options?: {
      rateLimitCooldownMs?: number;
      invalidKeyCooldownMs?: number;
      now?: () => number;
    },
  ) {
    const slots: GeminiApiKeySlot[] = [];
    const seen = new Set<string>();
    for (const [index, entry] of keys.entries()) {
      const slot = typeof entry === 'string'
        ? { id: String(index + 1), key: entry.trim() }
        : { id: entry.id, key: entry.key.trim() };
      if (!slot.key || seen.has(slot.key)) continue;
      seen.add(slot.key);
      slots.push(slot);
    }
    if (slots.length === 0) {
      throw new Error('At least one Gemini API key is required');
    }
    this.slots = slots;
    this.rateLimitCooldownMs = options?.rateLimitCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS;
    this.invalidKeyCooldownMs = options?.invalidKeyCooldownMs ?? DEFAULT_INVALID_KEY_COOLDOWN_MS;
    this.now = options?.now ?? Date.now;
  }

  get size(): number {
    return this.slots.length;
  }

  ids(): string[] {
    return this.slots.map((slot) => slot.id);
  }

  /** Prefer a non-cooling key; fall back to the next slot if all are cooling. */
  acquire(): GeminiApiKeySlot {
    const available = this.availableSlots();
    const preferAvailable = available.length > 0;
    for (let offset = 0; offset < this.slots.length; offset += 1) {
      const index = (this.cursor + offset) % this.slots.length;
      const slot = this.slots[index]!;
      if (!preferAvailable || available.some((entry) => entry.id === slot.id)) {
        this.cursor = (index + 1) % this.slots.length;
        return slot;
      }
    }
    const fallback = this.slots[this.cursor % this.slots.length]!;
    this.cursor = (this.cursor + 1) % this.slots.length;
    return fallback;
  }

  markRateLimited(id: string, cooldownMs = this.rateLimitCooldownMs): void {
    this.cooldownUntil.set(id, this.now() + Math.max(0, cooldownMs));
  }

  markInvalid(id: string, cooldownMs = this.invalidKeyCooldownMs): void {
    this.cooldownUntil.set(id, this.now() + Math.max(0, cooldownMs));
  }

  markSuccess(id: string): void {
    this.cooldownUntil.delete(id);
  }

  hasAvailable(): boolean {
    return this.availableSlots().length > 0;
  }

  msUntilNextAvailable(): number {
    const now = this.now();
    let min = Number.POSITIVE_INFINITY;
    for (const slot of this.slots) {
      const until = this.cooldownUntil.get(slot.id) ?? 0;
      if (until <= now) return 0;
      min = Math.min(min, until - now);
    }
    return Number.isFinite(min) ? min : 0;
  }

  private availableSlots(): GeminiApiKeySlot[] {
    const now = this.now();
    return this.slots.filter((slot) => (this.cooldownUntil.get(slot.id) ?? 0) <= now);
  }
}

let sharedRotator: GeminiApiKeyRotator | undefined;
let sharedRotatorSignature: string | undefined;

function signatureFor(slots: GeminiApiKeySlot[]): string {
  return slots.map((slot) => `${slot.id}:${slot.key}`).join('\0');
}

/** Process-wide rotator so guide + pipeline share cooldowns. */
export function sharedGeminiApiKeyRotator(env: NodeJS.ProcessEnv = process.env): GeminiApiKeyRotator {
  const slots = resolveGeminiApiKeys(env);
  if (slots.length === 0) {
    throw new Error('Gemini API is not configured. Set GEMINI_API_KEY (and optional GEMINI_API_KEY_2…).');
  }
  const signature = signatureFor(slots);
  if (!sharedRotator || sharedRotatorSignature !== signature) {
    sharedRotator = new GeminiApiKeyRotator(slots);
    sharedRotatorSignature = signature;
  }
  return sharedRotator;
}

/** Test helper — clears the process-wide rotator. */
export function resetSharedGeminiApiKeyRotator(): void {
  sharedRotator = undefined;
  sharedRotatorSignature = undefined;
}

export function isGeminiKeyRotationError(status: number | undefined, message: string): boolean {
  const normalized = message.toLowerCase();
  return status === 429
    || status === 503
    || status === 401
    || status === 403
    || normalized.includes('high demand')
    || normalized.includes('try again later')
    || normalized.includes('resource exhausted')
    || normalized.includes('unavailable')
    || normalized.includes('quota')
    || normalized.includes('rate limit')
    || normalized.includes('too many requests')
    || normalized.includes('api key not valid')
    || normalized.includes('api_key_invalid')
    || normalized.includes('permission denied');
}

export function isGeminiInvalidKeyError(status: number | undefined, message: string): boolean {
  const normalized = message.toLowerCase();
  return status === 401
    || status === 403
    || normalized.includes('api key not valid')
    || normalized.includes('api_key_invalid')
    || normalized.includes('permission denied');
}
