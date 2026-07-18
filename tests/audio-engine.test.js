import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, AUDIO_STORAGE_KEY } from '../src/audio-engine.js';

function audioParam(value = 0) {
  return {
    value,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function createContext() {
  const node = () => ({ connect: vi.fn() });
  return {
    state: 'running',
    currentTime: 1,
    sampleRate: 100,
    destination: {},
    createGain: vi.fn(() => ({ ...node(), gain: audioParam(1) })),
    createOscillator: vi.fn(() => ({ ...node(), type: '', frequency: audioParam(), start: vi.fn(), stop: vi.fn() })),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(20) })),
    createBufferSource: vi.fn(() => ({ ...node(), start: vi.fn(), buffer: null })),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: '', frequency: { value: 0 } })),
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AudioEngine', () => {
  it('restores mute without creating an AudioContext and persists changes', async () => {
    const storage = {
      getItem: vi.fn(() => 'true'),
      setItem: vi.fn(),
    };
    const Context = vi.fn(() => createContext());
    const engine = new AudioEngine({ windowRef: { AudioContext: Context }, storage });

    expect(engine.isMuted).toBe(true);
    expect(await engine.play('start')).toBe(false);
    expect(Context).not.toHaveBeenCalled();

    engine.setMuted(false);
    expect(storage.setItem).toHaveBeenCalledWith(AUDIO_STORAGE_KEY, 'false');
    expect(await engine.play('start')).toBe(true);
    expect(Context).toHaveBeenCalledOnce();
  });

  it('fails safely when Web Audio is unavailable', async () => {
    const engine = new AudioEngine({ windowRef: {}, storage: null });
    expect(await engine.play('stop')).toBe(false);
    expect(() => engine.setMuted(true)).not.toThrow();
  });

  it('maps showcase events to synthesized sounds including ticks', async () => {
    const Context = vi.fn(() => createContext());
    const engine = new AudioEngine({ windowRef: { AudioContext: Context }, storage: { getItem: () => null, setItem: vi.fn() } });

    for (const name of ['start', 'click', 'tick', 'stop', 'complete']) {
      expect(await engine.play(name)).toBe(true);
    }
    expect(Context.mock.results[0].value.createOscillator).toHaveBeenCalled();
  });
});
