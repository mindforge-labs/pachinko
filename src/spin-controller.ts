import {
  REROLL_LIMITS,
  pickBackendPair,
  pickDifferentTech,
  pickTech,
  type BackendPair,
  type ReelLayer,
} from './techstack';
import type { RerollLimits } from './techstack-matrix';

const DEFAULT_SYMBOLS = ['react', 'express', 'postgresql', 'vuejs', 'spring', 'mongodb'];
const LAYERS: ReelLayer[] = ['fe', 'be', 'db'];

type Phase = 'idle' | 'spinning' | 'settling' | 'rerolling';
type Reel = { index: number; state: 'stopped' | 'spinning'; symbol: string | null };
type TimerKey = number | 'settle' | 'reroll';

type SpinControllerOptions = {
  reelCount?: number;
  autoStopDelays?: number[];
  settleDelay?: number;
  rerollDelay?: number;
  rerollLimits?: RerollLimits;
  reducedMotion?: boolean | (() => boolean);
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
  selectSymbol?: (index: number, reason?: string, snapshot?: unknown) => string;
  selectRerollSymbol?: (index: number, currentId: string, reason?: string, snapshot?: unknown) => string;
  selectBackendPair?: (previousFrameworkId: string | null, reason?: string, snapshot?: unknown) => BackendPair;
  onEvent?: (event: any) => void;
};

export class SpinController {
  reelCount: number;
  autoStopDelays: number[];
  settleDelay: number;
  rerollDelay: number;
  rerollLimits: RerollLimits;
  rerollsRemaining: RerollLimits;
  reducedMotion: boolean | (() => boolean);
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancelTimer: (timer: ReturnType<typeof setTimeout>) => void;
  selectSymbol: NonNullable<SpinControllerOptions['selectSymbol']>;
  selectRerollSymbol: NonNullable<SpinControllerOptions['selectRerollSymbol']>;
  selectBackendPair: NonNullable<SpinControllerOptions['selectBackendPair']>;
  onEvent: (event: any) => void;
  phase: Phase;
  reels: Reel[];
  timers: Map<TimerKey, ReturnType<typeof setTimeout>>;
  backendRuntime: string | null;
  lastBackendFramework: string | null;
  stackComplete: boolean;
  rerollBackup: { index: number; symbol: string; backendRuntime: string | null } | null;

  constructor({
    reelCount = 3,
    autoStopDelays = [1800, 2500, 3200],
    settleDelay = 650,
    rerollDelay = 900,
    rerollLimits = REROLL_LIMITS,
    reducedMotion = false,
    schedule = globalThis.setTimeout?.bind(globalThis),
    cancel = globalThis.clearTimeout?.bind(globalThis),
    selectSymbol = (index) => pickTech(index),
    selectRerollSymbol = (index, currentId) => pickDifferentTech(index, currentId),
    selectBackendPair = (previousFrameworkId) => pickBackendPair(previousFrameworkId),
    onEvent = () => {},
  }: SpinControllerOptions = {}) {
    if (!Number.isInteger(reelCount) || reelCount < 1) throw new TypeError('reelCount must be a positive integer');
    if (typeof schedule !== 'function' || typeof cancel !== 'function') throw new TypeError('A clock is required');
    this.#validateLimits(rerollLimits);

    this.reelCount = reelCount;
    this.autoStopDelays = autoStopDelays;
    this.settleDelay = settleDelay;
    this.rerollDelay = rerollDelay;
    this.rerollLimits = { ...rerollLimits };
    this.rerollsRemaining = { ...rerollLimits };
    this.reducedMotion = reducedMotion;
    this.schedule = schedule;
    this.cancelTimer = cancel;
    this.selectSymbol = selectSymbol;
    this.selectRerollSymbol = selectRerollSymbol;
    this.selectBackendPair = selectBackendPair;
    this.onEvent = onEvent;
    this.phase = 'idle';
    this.reels = this.#freshReels();
    this.timers = new Map();
    this.backendRuntime = null;
    this.lastBackendFramework = null;
    this.stackComplete = false;
    this.rerollBackup = null;
  }

  #validateLimits(limits: RerollLimits) {
    for (const layer of LAYERS) {
      if (!Number.isInteger(limits?.[layer]) || limits[layer] < 0 || limits[layer] > 99) {
        throw new TypeError(`${layer} reroll limit must be an integer from 0 through 99`);
      }
    }
  }

  #freshReels(): Reel[] {
    return Array.from({ length: this.reelCount }, (_, index) => ({ index, state: 'stopped', symbol: null }));
  }

  #emit(type: string, detail: Record<string, unknown> = {}) {
    this.onEvent({ type, phase: this.phase, ...detail, snapshot: this.snapshot() });
  }

  snapshot() {
    return {
      phase: this.phase,
      backendRuntime: this.backendRuntime,
      stackComplete: this.stackComplete,
      rerollsRemaining: { ...this.rerollsRemaining },
      reels: this.reels.map((reel) => ({ ...reel })),
    };
  }

  start() {
    if (this.phase !== 'idle') return false;

    this.#clearTimers();
    this.phase = 'spinning';
    this.stackComplete = false;
    this.rerollBackup = null;
    this.rerollsRemaining = { ...this.rerollLimits };
    this.backendRuntime = null;
    this.reels = Array.from({ length: this.reelCount }, (_, index): Reel => ({ index, state: 'spinning', symbol: null }));
    this.#emit('start');

    this.reels.forEach((_, index) => {
      this.#emit('reelStart', { index });
      const delay = this.autoStopDelays[index] ?? (1800 + index * 700);
      const timer = this.schedule(() => this.stop(index, 'automatic'), delay);
      this.timers.set(index, timer);
    });
    return true;
  }

  stop(index: number, reason = 'manual') {
    const reel = this.reels[index];
    if (this.phase !== 'spinning' || !reel || reel.state !== 'spinning') return false;

    this.#clearTimer(index);
    reel.state = 'stopped';
    if (index === 1) {
      const pair = this.selectBackendPair(this.lastBackendFramework, reason, this.snapshot());
      reel.symbol = pair.frameworkId;
      this.backendRuntime = pair.runtimeId;
      this.lastBackendFramework = pair.frameworkId;
    } else {
      reel.symbol = this.selectSymbol(index, reason, this.snapshot());
    }
    this.#emit('reelStop', { index, reason, symbol: reel.symbol, backendRuntime: this.backendRuntime });

    if (this.reels.every(({ state }) => state === 'stopped')) {
      this.phase = 'settling';
      this.#emit('allStopped', { symbols: this.reels.map(({ symbol }) => symbol), backendRuntime: this.backendRuntime });
      const timer = this.schedule(() => {
        this.timers.delete('settle');
        this.phase = 'idle';
        this.stackComplete = true;
        this.#emit('complete', { symbols: this.reels.map(({ symbol }) => symbol), backendRuntime: this.backendRuntime });
      }, this.settleDelay);
      this.timers.set('settle', timer);
    }
    return true;
  }

  reroll(index: number) {
    const layer = LAYERS[index];
    const reel = this.reels[index];
    if (this.phase !== 'idle' || !this.stackComplete || !layer || !reel?.symbol || this.rerollsRemaining[layer] <= 0) {
      return false;
    }

    this.rerollsRemaining[layer] -= 1;
    this.rerollBackup = { index, symbol: reel.symbol, backendRuntime: this.backendRuntime };
    this.phase = 'rerolling';
    reel.state = 'spinning';
    this.#emit('rerollStart', {
      index,
      previousSymbol: this.rerollBackup.symbol,
      previousBackendRuntime: this.rerollBackup.backendRuntime,
    });

    if (this.#prefersReducedMotion()) {
      this.#finishReroll(index);
    } else {
      const timer = this.schedule(() => this.#finishReroll(index), this.rerollDelay);
      this.timers.set('reroll', timer);
    }
    return true;
  }

  #finishReroll(index: number) {
    if (this.phase !== 'rerolling' || this.rerollBackup?.index !== index) return;
    this.timers.delete('reroll');
    const reel = this.reels[index];
    const previousSymbol = this.rerollBackup.symbol;
    reel.state = 'stopped';
    if (index === 1) {
      const pair = this.selectBackendPair(previousSymbol, 'reroll', this.snapshot());
      reel.symbol = pair.frameworkId;
      this.backendRuntime = pair.runtimeId;
      this.lastBackendFramework = pair.frameworkId;
    } else {
      reel.symbol = this.selectRerollSymbol(index, previousSymbol, 'reroll', this.snapshot());
    }
    this.#emit('rerollStop', { index, symbol: reel.symbol, backendRuntime: this.backendRuntime, previousSymbol });
    this.rerollBackup = null;
    this.phase = 'idle';
    this.#emit('rerollComplete', {
      index,
      symbols: this.reels.map(({ symbol }) => symbol),
      backendRuntime: this.backendRuntime,
    });
  }

  cancel(reason = 'cancelled') {
    if (this.phase === 'idle') return false;
    if (this.phase === 'rerolling' && this.rerollBackup) {
      this.#clearTimers();
      const { index, symbol, backendRuntime } = this.rerollBackup;
      const layer = LAYERS[index];
      const reel = this.reels[index];
      reel.state = 'stopped';
      reel.symbol = symbol;
      this.backendRuntime = backendRuntime;
      if (index === 1) this.lastBackendFramework = symbol;
      this.rerollsRemaining[layer] = Math.min(this.rerollLimits[layer], this.rerollsRemaining[layer] + 1);
      this.rerollBackup = null;
      this.phase = 'idle';
      this.#emit('rerollCancel', { index, reason, symbol, backendRuntime, refunded: true });
      return true;
    }

    this.#clearTimers();
    this.phase = 'idle';
    this.stackComplete = false;
    this.backendRuntime = null;
    this.reels = this.#freshReels();
    this.#emit('cancel', { reason });
    return true;
  }

  reset(reason = 'reset') {
    this.#clearTimers();
    this.phase = 'idle';
    this.stackComplete = false;
    this.rerollBackup = null;
    this.rerollsRemaining = { ...this.rerollLimits };
    this.backendRuntime = null;
    this.lastBackendFramework = null;
    this.reels = this.#freshReels();
    this.#emit('reset', { reason });
    return true;
  }

  destroy() {
    this.#clearTimers();
    this.onEvent = () => {};
  }

  #prefersReducedMotion() {
    return typeof this.reducedMotion === 'function' ? this.reducedMotion() : this.reducedMotion;
  }

  #clearTimer(key: TimerKey) {
    if (!this.timers.has(key)) return;
    this.cancelTimer(this.timers.get(key)!);
    this.timers.delete(key);
  }

  #clearTimers() {
    for (const timer of this.timers.values()) this.cancelTimer(timer);
    this.timers.clear();
  }
}

export { DEFAULT_SYMBOLS };
