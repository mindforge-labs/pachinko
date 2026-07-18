import { pickTech } from './techstack';

const DEFAULT_SYMBOLS = ['react', 'nodejs', 'postgresql', 'vuejs', 'go', 'mongodb'];

type Phase = 'idle' | 'spinning' | 'settling';
type Reel = { index: number; state: 'stopped' | 'spinning'; symbol: string | null };

export class SpinController {
  reelCount: number;
  autoStopDelays: number[];
  settleDelay: number;
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancelTimer: (timer: ReturnType<typeof setTimeout>) => void;
  selectSymbol: (index: number, reason?: string, snapshot?: unknown) => string;
  onEvent: (event: any) => void;
  phase: Phase;
  reels: Reel[];
  timers: Map<number | 'settle', ReturnType<typeof setTimeout>>;

  constructor({
    reelCount = 3,
    autoStopDelays = [1800, 2500, 3200],
    settleDelay = 650,
    schedule = globalThis.setTimeout?.bind(globalThis),
    cancel = globalThis.clearTimeout?.bind(globalThis),
    selectSymbol = (index) => pickTech(index),
    onEvent = () => {},
  } = {}) {
    if (!Number.isInteger(reelCount) || reelCount < 1) throw new TypeError('reelCount must be a positive integer');
    if (typeof schedule !== 'function' || typeof cancel !== 'function') throw new TypeError('A clock is required');

    this.reelCount = reelCount;
    this.autoStopDelays = autoStopDelays;
    this.settleDelay = settleDelay;
    this.schedule = schedule;
    this.cancelTimer = cancel;
    this.selectSymbol = selectSymbol;
    this.onEvent = onEvent;
    this.phase = 'idle';
    this.reels = this.#freshReels();
    this.timers = new Map();
  }

  #freshReels(): Reel[] {
    return Array.from({ length: this.reelCount }, (_, index) => ({ index, state: 'stopped', symbol: null }));
  }

  #emit(type, detail = {}) {
    this.onEvent({ type, phase: this.phase, ...detail, snapshot: this.snapshot() });
  }

  snapshot() {
    return {
      phase: this.phase,
      reels: this.reels.map((reel) => ({ ...reel })),
    };
  }

  start() {
    if (this.phase !== 'idle') return false;

    this.#clearTimers();
    this.phase = 'spinning';
    this.reels = Array.from({ length: this.reelCount }, (_, index): Reel => ({ index, state: 'spinning', symbol: null }));
    this.#emit('start');

    this.reels.forEach((reel, index) => {
      this.#emit('reelStart', { index });
      const delay = this.autoStopDelays[index] ?? (1800 + index * 700);
      const timer = this.schedule(() => this.stop(index, 'automatic'), delay);
      this.timers.set(index, timer);
    });
    return true;
  }

  stop(index, reason = 'manual') {
    const reel = this.reels[index];
    if (this.phase !== 'spinning' || !reel || reel.state !== 'spinning') return false;

    this.#clearTimer(index);
    reel.state = 'stopped';
    reel.symbol = this.selectSymbol(index, reason, this.snapshot());
    this.#emit('reelStop', { index, reason, symbol: reel.symbol });

    if (this.reels.every(({ state }) => state === 'stopped')) {
      this.phase = 'settling';
      this.#emit('allStopped', { symbols: this.reels.map(({ symbol }) => symbol) });
      const timer = this.schedule(() => {
        this.timers.delete('settle');
        this.phase = 'idle';
        this.#emit('complete', { symbols: this.reels.map(({ symbol }) => symbol) });
      }, this.settleDelay);
      this.timers.set('settle', timer);
    }
    return true;
  }

  cancel(reason = 'cancelled') {
    if (this.phase === 'idle') return false;
    this.#clearTimers();
    this.phase = 'idle';
    this.reels = this.#freshReels();
    this.#emit('cancel', { reason });
    return true;
  }

  destroy() {
    this.#clearTimers();
    this.onEvent = () => {};
  }

  #clearTimer(key) {
    if (!this.timers.has(key)) return;
    this.cancelTimer(this.timers.get(key));
    this.timers.delete(key);
  }

  #clearTimers() {
    for (const timer of this.timers.values()) this.cancelTimer(timer);
    this.timers.clear();
  }
}

export { DEFAULT_SYMBOLS };
