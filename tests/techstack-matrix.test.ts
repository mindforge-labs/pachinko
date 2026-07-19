import { describe, expect, test } from 'bun:test';
import committed from '../src/techstack-matrix.json';
import { DEVICON_CATALOG } from '../src/generated/devicon-catalog';
import {
  exportTechStackMatrix,
  parseTechStackMatrixJson,
  sortTechStackMatrix,
  validateTechStackMatrix,
  type TechStackMatrix,
} from '../src/techstack-matrix';

const fresh = () => structuredClone(committed) as TechStackMatrix;
const codes = (matrix: unknown, level: 'errors' | 'warnings' = 'errors') => validateTechStackMatrix(matrix)[level].map(({ code }) => code);

describe('tech-stack matrix', () => {
  test('parses the committed matrix, resolves multi-role entries, and reports all pools', () => {
    const validation = validateTechStackMatrix(fresh());
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);
    expect(validation.matrix?.technologies.find(({ id }) => id === 'nextjs')?.roles).toEqual(['frontend', 'backend-framework']);
  });

  test('rejects unsupported schemas, malformed JSON, invalid and duplicate ids', () => {
    const matrix = fresh();
    matrix.schemaVersion = 3;
    expect(codes(matrix)).toContain('unsupported-schema');

    const invalidIds = fresh();
    invalidIds.technologies[1].id = invalidIds.technologies[0].id;
    invalidIds.technologies[2].id = 'Bad ID';
    expect(codes(invalidIds)).toContain('duplicate-id');
    expect(codes(invalidIds)).toContain('invalid-id');
    expect(parseTechStackMatrixJson('{nope').errors[0].code).toBe('malformed-json');
  });

  test('rejects missing Devicon sources and duplicate source assignments', () => {
    const missing = fresh();
    const source = missing.technologies[0].source;
    if (source.type === 'devicon') source.sourceId = 'removed-upstream-icon';
    expect(codes(missing)).toContain('missing-devicon-source');

    const duplicate = fresh();
    duplicate.technologies.push({ ...structuredClone(duplicate.technologies[0]), id: 'angular-copy' });
    expect(codes(duplicate)).toContain('duplicate-devicon-source');
  });

  test('supports valid custom entries and validates custom attribution URLs', () => {
    const matrix = fresh();
    matrix.technologies.push({
      id: 'acme-ui', name: 'Acme UI', short: 'ACME', docsUrl: 'https://docs.acme.test/ui',
      iconUrl: '/devicons/custom/acme.svg', enabled: true,
      source: { type: 'custom', homepage: 'https://acme.test' }, roles: ['frontend'],
    });
    expect(validateTechStackMatrix(matrix).errors).toEqual([]);

    const invalid = fresh();
    invalid.technologies.push({
      id: 'bad-custom', name: 'Bad custom', short: 'BAD', docsUrl: 'http://docs.test',
      iconUrl: '//host.test/icon.svg', enabled: true,
      source: { type: 'custom', homepage: 'http://host.test' }, roles: ['database'],
    });
    expect(codes(invalid)).toEqual(expect.arrayContaining(['invalid-docs-url', 'invalid-custom-homepage', 'invalid-custom-icon']));
  });

  test('finds empty pools, frameworks without runtimes, and orphaned compatibility edges', () => {
    const empty = fresh();
    empty.technologies.forEach((tech) => { tech.roles = tech.roles.filter((role) => role !== 'database'); });
    expect(codes(empty)).toContain('empty-role-pool');

    const noRuntime = fresh();
    noRuntime.compatibility = noRuntime.compatibility.filter(({ frameworkId }) => frameworkId !== 'spring');
    expect(codes(noRuntime)).toContain('framework-without-runtime');

    const orphan = fresh();
    orphan.compatibility.find(({ frameworkId }) => frameworkId === 'express')!.runtimeIds.push('missing-runtime');
    expect(codes(orphan)).toContain('invalid-runtime-edge');
  });

  test('warns about unused runtimes, unused technologies, and source version drift', () => {
    const matrix = fresh();
    matrix.source.version = '0.0.0';
    matrix.technologies.push({
      id: 'aarch64', name: 'AArch64', short: 'ARM64', docsUrl: 'https://developer.arm.com/documentation',
      enabled: true, source: { type: 'devicon', sourceId: 'aarch64' }, roles: [],
    });
    matrix.technologies.push({
      id: 'unused-runtime', name: 'Unused', short: 'UNUSED', docsUrl: 'https://unused.test/docs',
      iconUrl: '/unused.svg', enabled: true, source: { type: 'custom', homepage: 'https://unused.test' }, roles: ['backend-runtime'],
    });
    expect(codes(matrix, 'warnings')).toEqual(expect.arrayContaining(['source-version-mismatch', 'unused-technology', 'unused-runtime']));
  });

  test('blocks custom entries without a role', () => {
    const matrix = fresh();
    matrix.technologies.push({
      id: 'idle-custom', name: 'Idle', short: 'IDLE', docsUrl: 'https://idle.test/docs',
      iconUrl: '/idle.svg', enabled: true, source: { type: 'custom', homepage: 'https://idle.test' }, roles: [],
    });
    expect(codes(matrix)).toContain('custom-without-role');
  });

  test('exports deterministically and round-trips without data loss', () => {
    const matrix = fresh();
    matrix.technologies.reverse();
    matrix.compatibility.reverse();
    matrix.technologies.find(({ id }) => id === 'nextjs')!.roles.reverse();
    const exported = exportTechStackMatrix(matrix);
    const parsed = parseTechStackMatrixJson(exported);
    expect(parsed.errors).toEqual([]);
    expect(parsed.matrix).toEqual(sortTechStackMatrix(matrix));
    expect(exported).toBe(exportTechStackMatrix(parsed.matrix!));
  });

  test('migrates schema v1 imports with one reroll per reel', () => {
    const legacy = fresh() as TechStackMatrix & { rerollLimits?: TechStackMatrix['rerollLimits'] };
    legacy.schemaVersion = 1;
    delete legacy.rerollLimits;
    const parsed = parseTechStackMatrixJson(JSON.stringify(legacy));
    expect(parsed.errors).toEqual([]);
    expect(parsed.matrix?.schemaVersion).toBe(2);
    expect(parsed.matrix?.rerollLimits).toEqual({ fe: 1, be: 1, db: 1 });
  });

  test('round-trips committed reroll limits in deterministic order and permits zero', () => {
    const matrix = fresh();
    expect(matrix.rerollLimits).toEqual({ fe: 3, be: 3, db: 3 });
    matrix.rerollLimits = { fe: 0, be: 2, db: 1 };
    const exported = exportTechStackMatrix(matrix);
    expect(exported.indexOf('"rerollLimits"')).toBeLessThan(exported.indexOf('"technologies"'));
    expect(parseTechStackMatrixJson(exported).matrix?.rerollLimits).toEqual({ fe: 0, be: 2, db: 1 });
  });

  test('rejects invalid reroll ranges and undersized enabled pools', () => {
    const invalid = fresh();
    invalid.rerollLimits.fe = -1;
    invalid.rerollLimits.be = 100;
    invalid.rerollLimits.db = 1.5;
    expect(codes(invalid)).toEqual(expect.arrayContaining(['invalid-reroll-limit']));

    const undersized = fresh();
    undersized.technologies.forEach((tech) => {
      if (tech.roles.includes('frontend')) tech.enabled = tech.id === 'react';
    });
    expect(codes(undersized)).toContain('reroll-pool-too-small');
    undersized.rerollLimits.fe = 0;
    expect(codes(undersized)).not.toContain('reroll-pool-too-small');
  });
});
