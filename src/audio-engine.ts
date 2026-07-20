const STORAGE_KEY = 'nocturne-pachislot-muted';
const SOUND_RECIPES = {
  start: { frequency: 145, endFrequency: 310, duration: 0.24, type: 'sawtooth', volume: 0.12 },
  click: { frequency: 520, endFrequency: 400, duration: 0.045, type: 'square', volume: 0.045 },
  tick: { frequency: 880, endFrequency: 640, duration: 0.028, type: 'square', volume: 0.028 },
  lock1: { frequency: 150, endFrequency: 92, duration: 0.2, type: 'triangle', volume: 0.16, noise: true },
  lock2: { frequency: 185, endFrequency: 110, duration: 0.23, type: 'triangle', volume: 0.17, noise: true },
  lock3: { frequency: 240, endFrequency: 132, duration: 0.3, type: 'triangle', volume: 0.19, noise: true },
  complete: { frequency: 392, endFrequency: 784, duration: 0.42, type: 'sine', volume: 0.13, chord: true },
};

export class AudioEngine {
  window: any;
  storage: Storage | undefined;
  context: AudioContext | null;
  master: GainNode | null;
  muted: boolean;

  constructor({ windowRef = globalThis.window, storage = globalThis.localStorage }: { windowRef?: any; storage?: Storage } = {}) {
    this.window = windowRef;
    this.storage = storage;
    this.context = null;
    this.master = null;
    this.muted = this.#readMuted();
  }

  #readMuted() {
    try {
      return this.storage?.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  get isMuted() {
    return this.muted;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.context.currentTime, 0.012);
    }
    try {
      this.storage?.setItem(STORAGE_KEY, String(this.muted));
    } catch {
      // Storage can be unavailable in private browsing; sound still works for this visit.
    }
    return this.muted;
  }

  toggle() {
    return this.setMuted(!this.muted);
  }

  async #ensureContext() {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume();
      return true;
    }

    const Context = this.window?.AudioContext || this.window?.webkitAudioContext;
    if (!Context) return false;

    try {
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.72;
      this.master.connect(this.context.destination);
      if (this.context.state === 'suspended') await this.context.resume();
      return true;
    } catch {
      this.context = null;
      this.master = null;
      return false;
    }
  }

  async play(name) {
    const recipe = SOUND_RECIPES[name];
    if (!recipe || this.muted || !(await this.#ensureContext())) return false;

    const now = this.context.currentTime;
    this.#tone(recipe, now);
    if (recipe.noise) this.#noise(now, recipe.duration * 0.75, recipe.volume * 0.45);
    if (recipe.chord) {
      this.#tone({ ...recipe, frequency: recipe.frequency * 1.25, endFrequency: recipe.endFrequency * 1.25, volume: recipe.volume * 0.6 }, now + 0.06);
      this.#tone({ ...recipe, frequency: recipe.frequency * 1.5, endFrequency: recipe.endFrequency * 1.5, volume: recipe.volume * 0.45 }, now + 0.12);
    }
    return true;
  }

  #tone(recipe, start) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const end = start + recipe.duration;

    oscillator.type = recipe.type;
    oscillator.frequency.setValueAtTime(recipe.frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, recipe.endFrequency), end);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(recipe.volume, start + Math.min(0.025, recipe.duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  #noise(start, duration, volume) {
    if (!this.context.createBuffer || !this.context.createBufferSource) return;
    const sampleCount = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) channel[i] = Math.random() * 2 - 1;

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    envelope.gain.setValueAtTime(volume, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    source.start(start);
  }

  suspend() {
    if (this.context?.state === 'running') this.context.suspend().catch(() => {});
  }

  close() {
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
  }
}

export { STORAGE_KEY as AUDIO_STORAGE_KEY };
