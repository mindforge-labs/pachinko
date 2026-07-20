import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { PipelineError } from './errors';
import type { CommandResult } from './types';

export type CommandRunnerOptions = {
  workspaceRoot: string;
  defaultTimeoutMs?: number;
  maxOutputBytes?: number;
  allowlist?: string[];
  env?: NodeJS.ProcessEnv;
};

const DEFAULT_ALLOWLIST = [
  'bun',
  'npm',
  'npx',
  'node',
  'pnpm',
  'yarn',
  'python',
  'python3',
  'pip',
  'pip3',
  'pytest',
  'ruby',
  'bundle',
  'java',
  'javac',
  './mvnw',
  'mvn',
  'docker',
  'docker-compose',
  'git',
  'ls',
  'cat',
  'echo',
  'true',
  'false',
  'sleep',
  'tsc',
  'bunx',
];

const SECRET_ENV_KEYS = [
  'GEMINI_API_KEY',
  'API_KEY',
  'DATABASE_URL',
  'PASSWORD',
  'SECRET',
  'TOKEN',
  'ACCESS_TOKEN',
  'PRIVATE_KEY',
];

const DANGEROUS_PATTERNS = [
  /^\s*rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\s*$/,
  /^\s*rm\s+.*\s\/home\b/,
  /^\s*sudo\b/,
  /^\s*chmod\s+-R\s+777\b/,
  /^\s*curl\s+.*\|\s*(ba)?sh\b/,
  /^\s*git\s+config\s+--global\b/,
];

export function redactSecrets(text: string, extraSecrets: string[] = []): string {
  let result = text;
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 4) {
      result = result.split(secret).join('[REDACTED]');
    }
  }
  result = result.replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*["']?([^\s"']+)/gi, '$1=[REDACTED]');
  return result;
}

export function isCommandAllowed(
  command: string[],
  options: { allowlist?: string[]; workspaceRoot: string },
): { ok: true } | { ok: false; reason: string } {
  if (!command.length || !command[0]?.trim()) {
    return { ok: false, reason: 'Empty command' };
  }

  const binary = command[0];
  const allowlist = options.allowlist ?? DEFAULT_ALLOWLIST;
  const binaryBase = path.basename(binary);

  if (!allowlist.includes(binary) && !allowlist.includes(binaryBase)) {
    return { ok: false, reason: `Command not in allowlist: ${binary}` };
  }

  const joined = command.join(' ');
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(joined)) {
      return { ok: false, reason: `Dangerous command rejected: ${joined}` };
    }
  }

  // Reject path escapes in args
  for (const arg of command.slice(1)) {
    if (arg.startsWith('/') && !arg.startsWith(options.workspaceRoot)) {
      // Allow absolute paths only if under workspace; otherwise reject common escapes
      if (arg === '/' || arg.startsWith('/etc') || arg.startsWith('/home') || arg.startsWith('/root')) {
        return { ok: false, reason: `Argument path outside workspace: ${arg}` };
      }
    }
    if (arg.includes('..')) {
      const resolved = path.resolve(options.workspaceRoot, arg);
      const root = options.workspaceRoot.endsWith(path.sep)
        ? options.workspaceRoot
        : `${options.workspaceRoot}${path.sep}`;
      if (resolved !== options.workspaceRoot && !resolved.startsWith(root)) {
        return { ok: false, reason: `Argument escapes workspace: ${arg}` };
      }
    }
  }

  return { ok: true };
}

export class CommandRunner {
  private readonly workspaceRoot: string;
  private readonly defaultTimeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly allowlist: string[];
  private readonly env: NodeJS.ProcessEnv;
  private active: ChildProcess | null = null;
  private cancelled = false;

  constructor(options: CommandRunnerOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 200_000;
    this.allowlist = options.allowlist ?? DEFAULT_ALLOWLIST;
    this.env = sanitizeEnv(options.env ?? process.env);
  }

  cancel(): void {
    this.cancelled = true;
    if (this.active && !this.active.killed) {
      this.active.kill('SIGTERM');
    }
  }

  async run(
    command: string[],
    options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
  ): Promise<CommandResult> {
    this.cancelled = false;
    const cwd = path.resolve(this.workspaceRoot, options.cwd ?? '.');
    const rootWithSep = this.workspaceRoot.endsWith(path.sep)
      ? this.workspaceRoot
      : `${this.workspaceRoot}${path.sep}`;

    if (cwd !== this.workspaceRoot && !cwd.startsWith(rootWithSep)) {
      throw new PipelineError('COMMAND_REJECTED', `cwd outside workspace: ${cwd}`);
    }

    const allowed = isCommandAllowed(command, {
      allowlist: this.allowlist,
      workspaceRoot: this.workspaceRoot,
    });

    if (!allowed.ok) {
      return {
        command,
        cwd,
        exitCode: null,
        stdout: '',
        stderr: redactSecrets(allowed.reason),
        durationMs: 0,
        timedOut: false,
        cancelled: false,
        rejected: allowed.reason,
      };
    }

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const started = Date.now();

    return new Promise<CommandResult>((resolve) => {
      const child = spawn(command[0], command.slice(1), {
        cwd,
        env: { ...this.env, ...sanitizeEnv(options.env ?? {}) },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.active = child;

      let stdout = '';
      let stderr = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let timedOut = false;
      let settled = false;

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.active = null;
        resolve({
          command,
          cwd,
          exitCode,
          stdout: redactSecrets(stdout),
          stderr: redactSecrets(stderr),
          durationMs: Date.now() - started,
          timedOut,
          cancelled: this.cancelled && !timedOut,
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 2_000);
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdoutBytes >= this.maxOutputBytes) return;
        const take = chunk.subarray(0, this.maxOutputBytes - stdoutBytes);
        stdoutBytes += take.length;
        stdout += take.toString('utf8');
        if (stdoutBytes >= this.maxOutputBytes) stdout += '\n[truncated]';
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrBytes >= this.maxOutputBytes) return;
        const take = chunk.subarray(0, this.maxOutputBytes - stderrBytes);
        stderrBytes += take.length;
        stderr += take.toString('utf8');
        if (stderrBytes >= this.maxOutputBytes) stderr += '\n[truncated]';
      });

      child.on('error', (error) => {
        stderr += error.message;
        finish(null);
      });

      child.on('close', (code) => {
        if (timedOut) {
          finish(null);
          return;
        }
        finish(code);
      });
    }).then((result) => {
      if (result.timedOut) {
        // Preserve result but callers can detect timeout via flag / code
      }
      return result;
    });
  }
}

function sanitizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  for (const key of Object.keys(next)) {
    if (SECRET_ENV_KEYS.some((secret) => key.toUpperCase().includes(secret))) {
      // Keep PATH etc; strip obvious secrets from child env unless explicitly needed later
      if (key !== 'PATH' && key !== 'HOME' && key !== 'USER') {
        // Do not pass Gemini/API secrets into generated project commands by default
        if (/GEMINI|API_KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/i.test(key)) {
          delete next[key];
        }
      }
    }
  }
  return next;
}
