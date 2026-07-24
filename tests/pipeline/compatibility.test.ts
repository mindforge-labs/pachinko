import { describe, expect, test } from 'bun:test';
import { validateStackCompatibility } from '../../src/pipeline/compatibility';

describe('stack compatibility', () => {
  test('accepts a compatible Express + Bun + Postgres stack', () => {
    const result = validateStackCompatibility({
      frontendId: 'react',
      backendFrameworkId: 'express',
      runtimeId: 'bun',
      databaseId: 'postgresql',
    });

    expect(result.compatible).toBe(true);
    if (result.compatible) {
      expect(result.resolvedAdapters.some((adapter) => adapter.category === 'database-driver')).toBe(true);
    }
  });

  test('rejects incompatible backend/runtime pairs', () => {
    const result = validateStackCompatibility({
      frontendId: 'react',
      backendFrameworkId: 'spring',
      runtimeId: 'bun',
      databaseId: 'postgresql',
    });

    expect(result.compatible).toBe(false);
    if (!result.compatible) {
      expect(result.conflicts.some((conflict) => conflict.code === 'incompatible-backend-runtime')).toBe(true);
      expect(result.resolutionOptions.length).toBeGreaterThan(0);
    }
  });

  test('warns on unverified backend/runtime database pairings instead of hard-failing', () => {
    const result = validateStackCompatibility({
      frontendId: 'react',
      backendFrameworkId: 'django',
      runtimeId: 'python',
      databaseId: 'mongodb',
    });

    expect(result.compatible).toBe(true);
    if (result.compatible) {
      expect(result.warnings.some((warning) =>
        warning.code === 'unverified-backend-database'
        || warning.code === 'unverified-runtime-database')).toBe(true);
    }
  });

  test('resolves a database adapter when required', () => {
    const result = validateStackCompatibility({
      frontendId: 'vuejs',
      backendFrameworkId: 'express',
      runtimeId: 'nodejs',
      databaseId: 'mysql',
    });

    expect(result.compatible).toBe(true);
    if (result.compatible) {
      expect(result.resolvedAdapters[0]?.packageName).toBeTruthy();
    }
  });

  test('rejects edge runtime when it is not matrix-compatible with the framework', () => {
    const result = validateStackCompatibility({
      frontendId: 'react',
      backendFrameworkId: 'express',
      runtimeId: 'denojs',
      databaseId: 'postgresql',
    });

    // denojs is not in the Express matrix edge list
    expect(result.compatible).toBe(false);
    if (!result.compatible) {
      expect(result.conflicts.some((conflict) => conflict.code === 'incompatible-backend-runtime')).toBe(true);
    }
  });
});
