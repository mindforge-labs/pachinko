import { describe, expect, test } from 'bun:test';
import { buildGeminiSystemPrompt, type PromptStackItem } from '../src/gemini-prompt';

const stack: PromptStackItem[] = [
  { layer: 'fe', layerLabel: 'Frontend', id: 'react', name: 'React' },
  { layer: 'be', layerLabel: 'Backend', id: 'express', name: 'Express', runtime: { id: 'bun', name: 'Bun' } },
  { layer: 'db', layerLabel: 'Database', id: 'postgresql', name: 'Postgres' },
];

describe('buildGeminiSystemPrompt', () => {
  test('includes the complete rolled stack and cross-platform delivery requirements', () => {
    const prompt = buildGeminiSystemPrompt(stack, { authentication: false });

    expect(prompt).toContain('- Frontend: React (id: react)');
    expect(prompt).toContain('- Backend: Express (framework id: express) + Bun (runtime id: bun)');
    expect(prompt).toContain('exact compatible runtime');
    expect(prompt).toContain('- Database: Postgres (id: postgresql)');
    expect(prompt).toContain('Linux/macOS (Bash)');
    expect(prompt).toContain('Windows (PowerShell 7+)');
    expect(prompt).toContain('docker-compose.yml');
    expect(prompt).toContain('Student Management System');
  });

  test('keeps authentication as an extension point when disabled', () => {
    const prompt = buildGeminiSystemPrompt(stack, { authentication: false });

    expect(prompt).toContain('Authentication is disabled');
    expect(prompt).toContain('do not implement fake login code');
  });

  test('requests authentication and roles when enabled', () => {
    const prompt = buildGeminiSystemPrompt(stack, { authentication: true });

    expect(prompt).toContain('Authentication is enabled');
    expect(prompt).toContain('ADMIN and STAFF roles');
    expect(prompt).toContain('Protect every write endpoint');
  });
});
