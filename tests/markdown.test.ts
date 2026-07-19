import { describe, expect, test } from 'bun:test';
import { toPreviewMarkdown } from '../src/markdown';

describe('toPreviewMarkdown', () => {
  test('promotes plain ALL-CAPS section labels to headings', () => {
    const source = [
      'ROLLED STACK',
      '- Frontend: React',
      '',
      'PROJECT GOAL',
      'Build a student CRUD app.',
    ].join('\n');

    expect(toPreviewMarkdown(source)).toBe([
      '## ROLLED STACK',
      '- Frontend: React',
      '',
      '## PROJECT GOAL',
      'Build a student CRUD app.',
    ].join('\n'));
  });

  test('leaves existing markdown headings alone', () => {
    expect(toPreviewMarkdown('## Already a heading\nBody')).toBe('## Already a heading\nBody');
  });
});
