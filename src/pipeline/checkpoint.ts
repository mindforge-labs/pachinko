import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PipelineCheckpoint } from './types';

export async function saveCheckpoint(
  workspaceRoot: string,
  checkpoint: PipelineCheckpoint,
): Promise<string> {
  const dir = path.join(workspaceRoot, '.pipeline');
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, 'checkpoint.json');
  await writeFile(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
  return filePath;
}

export async function loadCheckpoint(workspaceRoot: string): Promise<PipelineCheckpoint | null> {
  const filePath = path.join(workspaceRoot, '.pipeline', 'checkpoint.json');
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as PipelineCheckpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
