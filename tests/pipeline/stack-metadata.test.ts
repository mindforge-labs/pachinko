import { describe, expect, test } from 'bun:test';
import matrix from '../../src/techstack-matrix.json';
import {
  DATABASES_REQUIRING_ADAPTER,
  EDGE_ORIENTED_RUNTIME_IDS,
  getStackMetadataCoverage,
  getTechPromptMetadata,
  listKnownMetadataIds,
  listMatrixTechnologyIds,
} from '../../src/pipeline/stack-metadata';

describe('stack-metadata coverage', () => {
  test('covers every technology id in the committed matrix', () => {
    const coverage = getStackMetadataCoverage();
    expect(coverage.missingFromMetadata).toEqual([]);
    expect(coverage.ok).toBe(true);
    expect(coverage.matrixCount).toBe(matrix.technologies.length);
    expect(listKnownMetadataIds()).toEqual(listMatrixTechnologyIds());
  });

  test('does not keep orphan metadata ids outside the matrix', () => {
    const coverage = getStackMetadataCoverage();
    expect(coverage.extraInMetadata).toEqual([]);
  });

  test('frontend entries expose package and deployment metadata', () => {
    for (const tech of matrix.technologies.filter(({ roles }) => roles.includes('frontend'))) {
      const meta = getTechPromptMetadata(tech.id, tech.name);
      expect(meta.packageName).toBeTruthy();
      expect(meta.deploymentModel).toBeTruthy();
      expect(meta.dockerSupport).toBeTruthy();
    }
  });

  test('backend frameworks sync compatibleRuntimeIds from the matrix', () => {
    for (const edge of matrix.compatibility) {
      const meta = getTechPromptMetadata(edge.frameworkId);
      expect(meta.compatibleRuntimeIds).toEqual([...edge.runtimeIds]);
      expect(meta.supportedDatabaseIds?.length).toBeGreaterThan(0);
      expect(meta.dockerSupport).toBe('production');
    }
  });

  test('backend runtimes declare supported databases and deployment model', () => {
    for (const tech of matrix.technologies.filter(({ roles }) => roles.includes('backend-runtime'))) {
      const meta = getTechPromptMetadata(tech.id, tech.name);
      expect(meta.deploymentModel).toBeTruthy();
      expect(meta.supportedDatabaseIds?.length).toBeGreaterThan(0);
    }
  });

  test('databases declare adapters and docker posture', () => {
    for (const tech of matrix.technologies.filter(({ roles }) => roles.includes('database'))) {
      const meta = getTechPromptMetadata(tech.id, tech.name);
      expect(DATABASES_REQUIRING_ADAPTER.has(tech.id)).toBe(true);
      expect(meta.recommendedAdapters?.length).toBeGreaterThan(0);
      expect(meta.dockerSupport).toBeTruthy();
      expect(meta.deploymentModel).toBe('managed');
    }
  });

  test('marks denojs as edge-oriented', () => {
    expect(EDGE_ORIENTED_RUNTIME_IDS.has('denojs')).toBe(true);
    expect(getTechPromptMetadata('denojs').deploymentModel).toBe('edge');
  });
});
