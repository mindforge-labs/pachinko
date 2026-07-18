import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpinController } from '../src/spin-controller.js';

describe('SpinController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts only from idle and automatically stops reels in staggered order', () => {
    const events = [];
    const symbols = ['nova', 'bell', 'seven'];
    const controller = new SpinController({
      autoStopDelays: [100, 200, 300],
      settleDelay: 50,
      selectSymbol: (index) => symbols[index],
      onEvent: (event) => events.push(event),
    });

    expect(controller.start()).toBe(true);
    expect(controller.start()).toBe(false);
    expect(controller.snapshot().reels.every((reel) => reel.state === 'spinning')).toBe(true);

    vi.advanceTimersByTime(100);
    expect(controller.snapshot().reels[0]).toMatchObject({ state: 'stopped', symbol: 'nova' });
    expect(controller.snapshot().reels[1].state).toBe('spinning');

    vi.advanceTimersByTime(200);
    expect(controller.snapshot().phase).toBe('settling');
    expect(controller.snapshot().reels.map((reel) => reel.symbol)).toEqual(symbols);

    vi.advanceTimersByTime(50);
    expect(controller.snapshot().phase).toBe('idle');
    expect(events.filter((event) => event.type === 'reelStop').map((event) => event.index)).toEqual([0, 1, 2]);
    expect(events.at(-1).type).toBe('complete');
  });

  it('supports mixed out-of-order manual and automatic stops without stopping twice', () => {
    const events = [];
    const controller = new SpinController({
      autoStopDelays: [100, 200, 300],
      settleDelay: 20,
      selectSymbol: (index, reason) => `${reason}-${index}`,
      onEvent: (event) => events.push(event),
    });

    expect(controller.stop(0)).toBe(false);
    controller.start();
    expect(controller.stop(2)).toBe(true);
    expect(controller.stop(2)).toBe(false);
    vi.advanceTimersByTime(200);

    expect(events.filter((event) => event.type === 'reelStop').map(({ index, reason }) => [index, reason])).toEqual([
      [2, 'manual'],
      [0, 'automatic'],
      [1, 'automatic'],
    ]);
    expect(controller.snapshot().phase).toBe('settling');

    vi.advanceTimersByTime(20);
    expect(events.filter((event) => event.type === 'reelStop')).toHaveLength(3);
    expect(controller.snapshot().phase).toBe('idle');
  });

  it('cleans up pending work when cancelled or destroyed', () => {
    const onEvent = vi.fn();
    const controller = new SpinController({ autoStopDelays: [100, 200, 300], onEvent });
    controller.start();
    expect(controller.cancel('visibility')).toBe(true);
    expect(controller.snapshot().phase).toBe('idle');
    vi.runAllTimers();
    expect(onEvent.mock.calls.flatMap(([event]) => event.type).filter((type) => type === 'reelStop')).toHaveLength(0);

    controller.start();
    controller.destroy();
    vi.runAllTimers();
    expect(controller.snapshot().phase).toBe('spinning');
  });
});
