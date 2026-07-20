import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PipelineError } from './errors';
import type { GeneratedFile } from './types';

export type WorkspaceApplyResult = {
  batchId: string;
  changedFiles: string[];
  backupDir: string;
};

export type WorkspaceManagerOptions = {
  rootDir: string;
  maxFileBytes?: number;
};

const DEFAULT_MAX_FILE_BYTES = 512_000;

function assertSafeRelativePath(relativePath: string): string {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new PipelineError('UNSAFE_FILE_PATH', 'Empty path is not allowed.');
  }
  if (path.isAbsolute(relativePath)) {
    throw new PipelineError('UNSAFE_FILE_PATH', `Absolute paths are not allowed: ${relativePath}`);
  }
  const normalized = path.posix.normalize(relativePath.replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || normalized.startsWith('/')) {
    throw new PipelineError('UNSAFE_FILE_PATH', `Path traversal rejected: ${relativePath}`);
  }
  if (normalized.includes('\0')) {
    throw new PipelineError('UNSAFE_FILE_PATH', 'NUL byte in path is not allowed.');
  }
  return normalized;
}

function rootPrefix(rootReal: string): string {
  return rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
}

function isInsideRoot(rootReal: string, candidateReal: string): boolean {
  const prefix = rootPrefix(rootReal);
  return candidateReal === rootReal || candidateReal.startsWith(prefix);
}

/**
 * Walk each path segment with lstat/realpath so a symlink (file or directory)
 * cannot redirect IO outside the workspace root.
 */
export async function resolvePathWithinWorkspace(
  workspaceRoot: string,
  relativePath: string,
): Promise<string> {
  const safeRel = assertSafeRelativePath(relativePath);
  const logicalRoot = path.resolve(workspaceRoot);
  let rootReal: string;
  try {
    rootReal = await realpath(logicalRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PipelineError('UNSAFE_FILE_PATH', `Workspace root does not exist: ${logicalRoot}`);
    }
    throw error;
  }

  const parts = safeRel.split('/').filter(Boolean);
  let logicalCursor = logicalRoot;
  let realCursor = rootReal;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const nextLogical = path.join(logicalCursor, part);

    let stats;
    try {
      stats = await lstat(nextLogical);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // Path does not exist yet: remaining segments are created under the verified real parent.
      const remainder = parts.slice(index).join(path.sep);
      const candidate = path.resolve(realCursor, remainder);
      if (!isInsideRoot(rootReal, candidate)) {
        throw new PipelineError(
          'UNSAFE_FILE_PATH',
          `Resolved path escapes workspace via missing-segment join: ${relativePath}`,
        );
      }
      return candidate;
    }

    let nextReal: string;
    try {
      nextReal = await realpath(nextLogical);
    } catch (error) {
      throw new PipelineError(
        'UNSAFE_FILE_PATH',
        `Could not resolve path real location: ${relativePath}`,
        { cause: error },
      );
    }

    if (!isInsideRoot(rootReal, nextReal)) {
      const kind = stats.isSymbolicLink() ? 'Symlink' : 'Path';
      throw new PipelineError(
        'UNSAFE_FILE_PATH',
        `${kind} escape rejected: ${relativePath}`,
      );
    }

    // Leaf symlink that points inside is allowed for read, but writes must not
    // silently follow an unexpected link — callers use rejectLeafSymlinkWrite.
    logicalCursor = nextLogical;
    realCursor = nextReal;
  }

  return realCursor;
}

async function assertNotLeafSymlinkForWrite(
  workspaceRoot: string,
  relativePath: string,
): Promise<void> {
  const safeRel = assertSafeRelativePath(relativePath);
  const logical = path.resolve(workspaceRoot, safeRel);
  try {
    const stats = await lstat(logical);
    if (stats.isSymbolicLink()) {
      throw new PipelineError(
        'UNSAFE_FILE_PATH',
        `Refusing to write through symlink: ${relativePath}`,
      );
    }
  } catch (error) {
    if (error instanceof PipelineError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

export class WorkspaceManager {
  readonly rootDir: string;
  private readonly maxFileBytes: number;
  private readonly batchBackups = new Map<string, string>();

  constructor(options: WorkspaceManagerOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  }

  /** Synchronous path join + lexical containment check (no symlink resolution). */
  resolve(relativePath: string): string {
    const safe = assertSafeRelativePath(relativePath);
    const resolved = path.resolve(this.rootDir, safe);
    const prefix = rootPrefix(this.rootDir);
    if (resolved !== this.rootDir && !resolved.startsWith(prefix)) {
      throw new PipelineError('UNSAFE_FILE_PATH', `Resolved path escapes workspace: ${relativePath}`);
    }
    return resolved;
  }

  /** Resolve a path and reject symlink / realpath escapes outside the workspace. */
  async resolveSafe(relativePath: string): Promise<string> {
    return resolvePathWithinWorkspace(this.rootDir, relativePath);
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  async readText(relativePath: string): Promise<string | null> {
    const absolute = await this.resolveSafe(relativePath);
    try {
      return await readFile(absolute, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async applyBatch(batchId: string, files: GeneratedFile[]): Promise<WorkspaceApplyResult> {
    await this.ensureRoot();
    const seen = new Set<string>();
    for (const file of files) {
      const safe = assertSafeRelativePath(file.path);
      if (seen.has(safe)) {
        throw new PipelineError('FILE_WRITE_FAILED', `Duplicate path in batch: ${safe}`);
      }
      seen.add(safe);
      // Reject escapes before mutating anything.
      await this.resolveSafe(safe);
      if (file.operation !== 'delete') {
        await assertNotLeafSymlinkForWrite(this.rootDir, safe);
      }
      if (file.operation !== 'delete' && file.content != null) {
        if (Buffer.byteLength(file.content, 'utf8') > this.maxFileBytes) {
          throw new PipelineError('FILE_WRITE_FAILED', `File too large: ${safe}`);
        }
        if (file.content.includes('\0')) {
          throw new PipelineError('FILE_WRITE_FAILED', `Binary/NUL content rejected: ${safe}`);
        }
      }
    }

    const backupDir = path.join(this.rootDir, '.pipeline-backups', batchId, String(Date.now()));
    await mkdir(backupDir, { recursive: true });
    // Ensure backup dir itself cannot be a symlink escape (created under root).
    await resolvePathWithinWorkspace(this.rootDir, path.relative(this.rootDir, backupDir).split(path.sep).join('/'));

    const changedFiles: string[] = [];

    try {
      for (const file of files) {
        const safe = assertSafeRelativePath(file.path);
        const absolute = await this.resolveSafe(safe);
        const backupPath = path.join(backupDir, safe);
        await mkdir(path.dirname(backupPath), { recursive: true });

        const existing = await this.readText(safe);
        if (existing != null) {
          await writeFile(backupPath, existing, 'utf8');
          await writeFile(`${backupPath}.__exists`, '1', 'utf8');
        } else {
          await writeFile(`${backupPath}.__missing`, '1', 'utf8');
        }

        if (file.operation === 'delete') {
          // Delete the logical path without following a leaf symlink outside —
          // resolveSafe already rejected outside targets; rm the logical entry via lstat path.
          const logical = this.resolve(safe);
          await rm(logical, { force: true });
        } else {
          await assertNotLeafSymlinkForWrite(this.rootDir, safe);
          await mkdir(path.dirname(absolute), { recursive: true });
          // Re-check parent after mkdir in case of race with an external symlink drop.
          await this.resolveSafe(safe);
          await assertNotLeafSymlinkForWrite(this.rootDir, safe);
          const writeTarget = this.resolve(safe);
          await writeFile(writeTarget, file.content ?? '', 'utf8');
        }
        changedFiles.push(safe);
      }
    } catch (error) {
      await this.rollbackBatch(batchId, backupDir).catch(() => undefined);
      if (error instanceof PipelineError) throw error;
      throw new PipelineError(
        'FILE_WRITE_FAILED',
        error instanceof Error ? error.message : 'Failed to write batch files',
        { cause: error },
      );
    }

    this.batchBackups.set(batchId, backupDir);
    return { batchId, changedFiles, backupDir };
  }

  async rollbackBatch(batchId: string, backupDir = this.batchBackups.get(batchId)): Promise<void> {
    if (!backupDir) {
      throw new PipelineError('FILE_WRITE_FAILED', `No backup found for batch ${batchId}`);
    }

    const { readdir } = await import('node:fs/promises');

    const walk = async (dir: string, prefix = ''): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) files.push(...await walk(path.join(dir, entry.name), rel));
        else files.push(rel);
      }
      return files;
    };

    const backupFiles = await walk(backupDir);
    const relativePaths = new Set(
      backupFiles
        .filter((f) => !f.endsWith('.__exists') && !f.endsWith('.__missing'))
        .map((f) => f),
    );

    for (const marker of backupFiles.filter((f) => f.endsWith('.__missing') || f.endsWith('.__exists'))) {
      relativePaths.add(marker.replace(/\.__missing$|\.__exists$/, ''));
    }

    for (const relative of relativePaths) {
      await this.resolveSafe(relative);
      const absolute = this.resolve(relative);
      const missingMarker = path.join(backupDir, `${relative}.__missing`);
      const existsMarker = path.join(backupDir, `${relative}.__exists`);
      const contentBackup = path.join(backupDir, relative);

      try {
        await lstat(missingMarker);
        await rm(absolute, { force: true });
        continue;
      } catch {
        // not a missing marker
      }

      try {
        await lstat(existsMarker);
        await assertNotLeafSymlinkForWrite(this.rootDir, relative);
        const content = await readFile(contentBackup, 'utf8');
        await mkdir(path.dirname(absolute), { recursive: true });
        await writeFile(absolute, content, 'utf8');
      } catch (error) {
        throw new PipelineError(
          'FILE_WRITE_FAILED',
          `Failed to rollback ${relative}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }
}

export async function createIsolatedWorkspace(baseDir: string, runId: string): Promise<WorkspaceManager> {
  const rootDir = path.resolve(baseDir, runId);
  const manager = new WorkspaceManager({ rootDir });
  await manager.ensureRoot();
  return manager;
}

/** Exposed for tests */
export const _assertSafeRelativePath = assertSafeRelativePath;
export const _resolvePathWithinWorkspace = resolvePathWithinWorkspace;
