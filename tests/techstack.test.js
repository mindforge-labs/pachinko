import { describe, expect, it } from 'vitest';
import { describeStack, layerForReel, pickTech, techById } from '../src/techstack.js';

describe('techstack catalog', () => {
  it('maps reels to FE, BE, and DB layers', () => {
    expect(layerForReel(0)).toBe('fe');
    expect(layerForReel(1)).toBe('be');
    expect(layerForReel(2)).toBe('db');
  });

  it('picks only from the matching layer pool', () => {
    expect(techById('fe', pickTech(0, () => 0)).name).toBe('React');
    expect(techById('be', pickTech(1, () => 0)).name).toBe('Node.js');
    expect(techById('db', pickTech(2, () => 0)).name).toBe('Postgres');
  });

  it('provides official documentation and optional GitHub links', () => {
    expect(techById('fe', 'react')).toMatchObject({
      docsUrl: 'https://react.dev/reference/react',
      githubUrl: 'https://github.com/facebook/react',
    });
    expect(techById('db', 'dynamo')).toMatchObject({
      docsUrl: 'https://docs.aws.amazon.com/dynamodb/',
      githubUrl: null,
    });
  });

  it('describes a finished stack for the carousel', () => {
    expect(describeStack(['svelte', 'rust', 'mongo'])).toEqual([
      { layer: 'fe', layerLabel: 'Frontend', id: 'svelte', name: 'Svelte', short: 'SVLT' },
      { layer: 'be', layerLabel: 'Backend', id: 'rust', name: 'Rust', short: 'RUST' },
      { layer: 'db', layerLabel: 'Database', id: 'mongo', name: 'MongoDB', short: 'MONGO' },
    ]);
  });
});
