import { describe, expect, test } from 'bun:test';
import { DEFAULT_AUTO_STOP_DELAYS, DEFAULT_SETTLE_DELAY, SpinController } from '../src/spin-controller';

const clock = () => {
  let nextId = 1;
  const tasks = new Map<number, { callback: () => void; delay: number }>();
  return {
    tasks,
    schedule(callback: () => void, delay: number) {
      const id = nextId++;
      tasks.set(id, { callback, delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    cancel(id: ReturnType<typeof setTimeout>) { tasks.delete(id as unknown as number); },
    runDelay(delay: number) {
      const match = [...tasks].find(([, task]) => task.delay === delay);
      if (!match) throw new Error(`No task with delay ${delay}`);
      tasks.delete(match[0]);
      match[1].callback();
    },
  };
};

const completeStack = (controller: SpinController, time: ReturnType<typeof clock>) => {
  expect(controller.start()).toBe(true);
  expect(controller.stop(0)).toBe(true);
  expect(controller.stop(1)).toBe(true);
  expect(controller.stop(2)).toBe(true);
  time.runDelay(10);
  expect(controller.snapshot().stackComplete).toBe(true);
};

const setup = (overrides: ConstructorParameters<typeof SpinController>[0] = {}) => {
  const time = clock();
  const events: any[] = [];
  let generation = 0;
  const controller = new SpinController({
    autoStopDelays: [100, 200, 300],
    settleDelay: 10,
    rerollDelay: 900,
    rerollLimits: { fe: 2, be: 1, db: 1 },
    schedule: time.schedule,
    cancel: time.cancel,
    selectSymbol: (index) => ['react', 'express', 'postgresql'][index],
    selectRerollSymbol: (index) => index === 0 ? `frontend-${++generation}` : `database-${++generation}`,
    selectBackendPair: (previous) => previous === 'express'
      ? { frameworkId: 'django', runtimeId: 'python' }
      : { frameworkId: 'express', runtimeId: 'nodejs' },
    onEvent: (event) => events.push(event),
    ...overrides,
  });
  return { controller, time, events };
};

describe('SpinController rerolls', () => {
  test('uses a readable three-stage automatic stop cadence by default', () => {
    const controller = new SpinController();
    expect(controller.autoStopDelays).toEqual(DEFAULT_AUTO_STOP_DELAYS);
    expect(controller.autoStopDelays[1] - controller.autoStopDelays[0]).toBeGreaterThanOrEqual(1200);
    expect(controller.autoStopDelays[2] - controller.autoStopDelays[1]).toBeGreaterThanOrEqual(1200);
    expect(controller.settleDelay).toBe(DEFAULT_SETTLE_DELAY);
    expect(controller.settleDelay).toBeGreaterThanOrEqual(1100);
    controller.destroy();
  });

  test('rejects invalid, busy, incomplete, and exhausted rerolls', () => {
    const { controller, time } = setup();
    expect(controller.reroll(-1)).toBe(false);
    expect(controller.reroll(0)).toBe(false);
    controller.start();
    expect(controller.reroll(0)).toBe(false);
    controller.stop(0); controller.stop(1); controller.stop(2);
    expect(controller.reroll(0)).toBe(false);
    time.runDelay(10);
    expect(controller.reroll(0)).toBe(true);
    expect(controller.reroll(1)).toBe(false);
    time.runDelay(900);
    expect(controller.reroll(0)).toBe(true);
    time.runDelay(900);
    expect(controller.reroll(0)).toBe(false);
  });

  test('tracks independent remaining counts and resets them for a new stack', () => {
    const { controller, time } = setup();
    completeStack(controller, time);
    controller.reroll(0); time.runDelay(900);
    controller.reroll(1); time.runDelay(900);
    expect(controller.snapshot().rerollsRemaining).toEqual({ fe: 1, be: 0, db: 1 });
    expect(controller.start()).toBe(true);
    expect(controller.snapshot().rerollsRemaining).toEqual({ fe: 2, be: 1, db: 1 });
  });

  test('allows exactly three rerolls per reel when configured 3/3/3', () => {
    const { controller, time } = setup({
      rerollLimits: { fe: 3, be: 3, db: 3 },
      reducedMotion: true,
    });
    completeStack(controller, time);
    for (const index of [0, 1, 2]) {
      expect(controller.reroll(index)).toBe(true);
      expect(controller.reroll(index)).toBe(true);
      expect(controller.reroll(index)).toBe(true);
      expect(controller.reroll(index)).toBe(false);
    }
    expect(controller.snapshot().rerollsRemaining).toEqual({ fe: 0, be: 0, db: 0 });
    controller.reset();
    expect(controller.snapshot().rerollsRemaining).toEqual({ fe: 3, be: 3, db: 3 });
  });

  test('rerolls backend framework and runtime atomically', () => {
    const { controller, time } = setup();
    completeStack(controller, time);
    expect(controller.snapshot().reels[1].symbol).toBe('express');
    expect(controller.snapshot().backendRuntime).toBe('nodejs');
    controller.reroll(1); time.runDelay(900);
    expect(controller.snapshot().reels[1].symbol).toBe('django');
    expect(controller.snapshot().backendRuntime).toBe('python');
  });

  test('emits lifecycle snapshots with rerolling and idle phases', () => {
    const { controller, time, events } = setup();
    completeStack(controller, time);
    controller.reroll(2); time.runDelay(900);
    const lifecycle = events.filter(({ type }) => type.startsWith('reroll'));
    expect(lifecycle.map(({ type }) => type)).toEqual(['rerollStart', 'rerollStop', 'rerollComplete']);
    expect(lifecycle[0].snapshot.phase).toBe('rerolling');
    expect(lifecycle[0].snapshot.rerollsRemaining.db).toBe(0);
    expect(lifecycle[2].snapshot.phase).toBe('idle');
  });

  test('visibility cancellation restores the previous result and refunds allowance', () => {
    const { controller, time, events } = setup();
    completeStack(controller, time);
    const before = controller.snapshot();
    controller.reroll(1);
    expect(controller.cancel('visibility')).toBe(true);
    const after = controller.snapshot();
    expect(after.reels[1].symbol).toBe(before.reels[1].symbol);
    expect(after.backendRuntime).toBe(before.backendRuntime);
    expect(after.rerollsRemaining.be).toBe(1);
    expect(after.stackComplete).toBe(true);
    expect(events.at(-1).type).toBe('rerollCancel');
    expect([...time.tasks.values()].some(({ delay }) => delay === 900)).toBe(false);
  });

  test('reduced motion completes without scheduling the visual delay', () => {
    const { controller, time } = setup({ reducedMotion: true });
    completeStack(controller, time);
    expect(controller.reroll(0)).toBe(true);
    expect(controller.snapshot().phase).toBe('idle');
    expect([...time.tasks.values()].some(({ delay }) => delay === 900)).toBe(false);
  });
});
