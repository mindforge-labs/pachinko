import { describe, expect, test } from 'bun:test';
import { compatibleRuntimeIds, pickBackendPair, pickDifferentTech, TECH_STACK } from '../src/techstack';

const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
};

describe('backend framework/runtime selection', () => {
  test('prevents the immediately previous framework from repeating', () => {
    const previous = TECH_STACK.be[0].id;
    const pair = pickBackendPair(previous, sequence(0, 0));
    expect(pair.frameworkId).not.toBe(previous);
    expect(compatibleRuntimeIds(pair.frameworkId)).toContain(pair.runtimeId);
  });

  test('selects deterministic first and last framework/runtime boundaries', () => {
    const first = pickBackendPair(null, sequence(0, 0));
    expect(first.frameworkId).toBe(TECH_STACK.be[0].id);
    expect(first.runtimeId).toBe(compatibleRuntimeIds(first.frameworkId)[0]);

    const last = pickBackendPair(null, sequence(0.999999, 0.999999));
    const lastFramework = TECH_STACK.be.at(-1)!;
    expect(last.frameworkId).toBe(lastFramework.id);
    expect(last.runtimeId).toBe(compatibleRuntimeIds(lastFramework.id).at(-1));
  });
});

describe('single-reel replacement selection', () => {
  test('frontend and database choices never repeat at random boundaries', () => {
    for (const index of [0, 2]) {
      const pool = index === 0 ? TECH_STACK.fe : TECH_STACK.db;
      for (const random of [() => 0, () => 0.999999]) {
        expect(pickDifferentTech(index, pool[0].id, random)).not.toBe(pool[0].id);
        expect(pickDifferentTech(index, pool.at(-1)!.id, random)).not.toBe(pool.at(-1)!.id);
      }
    }
  });
});
