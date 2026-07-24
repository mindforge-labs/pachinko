import { describe, expect, test, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile, symlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  WorkspaceManager,
  _assertSafeRelativePath,
  _resolvePathWithinWorkspace,
} from '../../src/pipeline/workspace';
import { PipelineError } from '../../src/pipeline/errors';

describe('workspace manager', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const tempWorkspace = async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pachinko-ws-'));
    dirs.push(dir);
    return new WorkspaceManager({ rootDir: dir });
  };

  test('creates, updates, and deletes files', async () => {
    const ws = await tempWorkspace();
    await ws.applyBatch('b1', [
      { path: 'src/a.ts', operation: 'create', content: 'one' },
    ]);
    expect(await ws.readText('src/a.ts')).toBe('one');

    await ws.applyBatch('b2', [
      { path: 'src/a.ts', operation: 'update', content: 'two' },
    ]);
    expect(await ws.readText('src/a.ts')).toBe('two');

    await ws.applyBatch('b3', [
      { path: 'src/a.ts', operation: 'delete' },
    ]);
    expect(await ws.readText('src/a.ts')).toBeNull();
  });

  test('rollbacks a batch', async () => {
    const ws = await tempWorkspace();
    await ws.applyBatch('b1', [
      { path: 'file.txt', operation: 'create', content: 'original' },
    ]);
    await ws.applyBatch('b2', [
      { path: 'file.txt', operation: 'update', content: 'changed' },
    ]);
    await ws.rollbackBatch('b2');
    expect(await readFile(path.join(ws.rootDir, 'file.txt'), 'utf8')).toBe('original');
  });

  test('rejects absolute paths and traversal', () => {
    expect(() => _assertSafeRelativePath('/etc/passwd')).toThrow(PipelineError);
    expect(() => _assertSafeRelativePath('../secret')).toThrow(PipelineError);
    expect(() => _assertSafeRelativePath('ok/../../etc/passwd')).toThrow(PipelineError);
  });

  test('resolve rejects escape even if relative looks safe after normalize tricks', async () => {
    const ws = await tempWorkspace();
    expect(() => ws.resolve('..')).toThrow(PipelineError);
  });
});

describe('workspace symlink escape hardening', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const tempDirs = async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'pachinko-ws-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'pachinko-out-'));
    dirs.push(workspace, outside);
    return { workspace, outside };
  };

  test('rejects reading through a file symlink that points outside the workspace', async () => {
    const { workspace, outside } = await tempDirs();
    const secret = path.join(outside, 'secret.txt');
    await writeFile(secret, 'top-secret', 'utf8');
    await symlink(secret, path.join(workspace, 'leak.txt'));

    await expect(_resolvePathWithinWorkspace(workspace, 'leak.txt')).rejects.toBeInstanceOf(PipelineError);
    await expect(_resolvePathWithinWorkspace(workspace, 'leak.txt')).rejects.toMatchObject({
      code: 'UNSAFE_FILE_PATH',
      message: expect.stringContaining('escape'),
    });

    const ws = new WorkspaceManager({ rootDir: workspace });
    await expect(ws.readText('leak.txt')).rejects.toBeInstanceOf(PipelineError);
  });

  test('rejects writing through a file symlink that points outside the workspace', async () => {
    const { workspace, outside } = await tempDirs();
    const secret = path.join(outside, 'secret.txt');
    await writeFile(secret, 'original', 'utf8');
    await symlink(secret, path.join(workspace, 'leak.txt'));

    const ws = new WorkspaceManager({ rootDir: workspace });
    await expect(ws.applyBatch('evil', [
      { path: 'leak.txt', operation: 'update', content: 'pwned' },
    ])).rejects.toBeInstanceOf(PipelineError);

    expect(await readFile(secret, 'utf8')).toBe('original');
  });

  test('rejects writing under a directory symlink that points outside the workspace', async () => {
    const { workspace, outside } = await tempDirs();
    await symlink(outside, path.join(workspace, 'vendor'));

    const ws = new WorkspaceManager({ rootDir: workspace });
    await expect(ws.applyBatch('evil', [
      { path: 'vendor/pwned.txt', operation: 'create', content: 'nope' },
    ])).rejects.toMatchObject({
      code: 'UNSAFE_FILE_PATH',
    });

    await expect(readFile(path.join(outside, 'pwned.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('rejects nested symlink escape (parent dir link)', async () => {
    const { workspace, outside } = await tempDirs();
    await mkdir(path.join(workspace, 'pkg'), { recursive: true });
    await symlink(outside, path.join(workspace, 'pkg', 'ext'));

    const ws = new WorkspaceManager({ rootDir: workspace });
    await expect(ws.resolveSafe('pkg/ext/x.txt')).rejects.toMatchObject({
      code: 'UNSAFE_FILE_PATH',
    });
  });

  test('allows symlink that stays inside the workspace for reads', async () => {
    const { workspace } = await tempDirs();
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    await writeFile(path.join(workspace, 'src', 'real.ts'), 'inside', 'utf8');
    await symlink(path.join(workspace, 'src', 'real.ts'), path.join(workspace, 'alias.ts'));

    const ws = new WorkspaceManager({ rootDir: workspace });
    expect(await ws.readText('alias.ts')).toBe('inside');
  });

  test('refuses to write through an in-workspace leaf symlink', async () => {
    const { workspace } = await tempDirs();
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    await writeFile(path.join(workspace, 'src', 'real.ts'), 'inside', 'utf8');
    await symlink(path.join(workspace, 'src', 'real.ts'), path.join(workspace, 'alias.ts'));

    const ws = new WorkspaceManager({ rootDir: workspace });
    await expect(ws.applyBatch('b1', [
      { path: 'alias.ts', operation: 'update', content: 'changed' },
    ])).rejects.toMatchObject({
      code: 'UNSAFE_FILE_PATH',
      message: expect.stringContaining('symlink'),
    });
    expect(await readFile(path.join(workspace, 'src', 'real.ts'), 'utf8')).toBe('inside');
  });
});
