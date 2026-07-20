import { describe, expect, test, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CommandRunner, isCommandAllowed, redactSecrets } from '../../src/pipeline/command-runner';

describe('command runner', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const runner = async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pachinko-cmd-'));
    dirs.push(dir);
    return new CommandRunner({ workspaceRoot: dir, defaultTimeoutMs: 5_000, maxOutputBytes: 1_000 });
  };

  test('runs a successful command', async () => {
    const r = await runner();
    const result = await r.run(['echo', 'hello']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.rejected).toBeUndefined();
  });

  test('captures failed command exit codes', async () => {
    const r = await runner();
    const result = await r.run(['false']);
    expect(result.exitCode).not.toBe(0);
  });

  test('times out long commands', async () => {
    const r = await runner();
    const result = await r.run(['sleep', '30'], { timeoutMs: 200 });
    expect(result.timedOut).toBe(true);
  });

  test('supports cancellation', async () => {
    const r = await runner();
    const pending = r.run(['sleep', '30'], { timeoutMs: 10_000 });
    r.cancel();
    const result = await pending;
    expect(result.cancelled || result.timedOut || result.exitCode !== 0).toBe(true);
  });

  test('truncates oversized output', async () => {
    const r = await runner();
    const result = await r.run(['node', '-e', `process.stdout.write('x'.repeat(5000))`]);
    expect(result.stdout.includes('[truncated]') || result.stdout.length <= 1100).toBe(true);
  });

  test('redacts secrets from text', () => {
    expect(redactSecrets('api_key=supersecret123', ['supersecret123'])).toContain('[REDACTED]');
    expect(redactSecrets('password: hunter2')).toContain('[REDACTED]');
  });

  test('rejects unsafe commands', () => {
    const root = '/tmp/ws';
    expect(isCommandAllowed(['rm', '-rf', '/'], { workspaceRoot: root }).ok).toBe(false);
    expect(isCommandAllowed(['git', 'config', '--global', 'user.name', 'x'], { workspaceRoot: root }).ok).toBe(false);
    expect(isCommandAllowed(['curl', 'http://x|sh'], { workspaceRoot: root }).ok).toBe(false);
    expect(isCommandAllowed(['echo', 'ok'], { workspaceRoot: root }).ok).toBe(true);
  });
});
