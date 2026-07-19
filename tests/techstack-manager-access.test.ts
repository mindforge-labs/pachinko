import { describe, expect, test } from 'bun:test';
import { techstackManagerAvailable } from '../src/techstack-manager-access';

describe('/techstack-manager access', () => {
  test('is available outside production and unavailable in production', () => {
    expect(techstackManagerAvailable('development')).toBe(true);
    expect(techstackManagerAvailable('test')).toBe(true);
    expect(techstackManagerAvailable('production')).toBe(false);
  });
});
