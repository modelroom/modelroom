// modelroom — agent adapters
//
// An adapter runs a coding agent for one prompt in one room. Two ship today:
//   - `opencode`  OpenCode CLI (sessions, model, agent selection)
//   - `command`   any CLI, configured with args that contain {prompt} and {session}
//
// Adapter interface (see docs/04-agents.md):
//   name                       string
//   newSessionId()             string        one id per room, reused across prompts
//   run(options)               child handle  streams stdout/stderr

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config.ts';

export type Stream = 'stdout' | 'stderr';

export interface RunOptions {
  cfg: Config;
  cwd: string;
  prompt: string;
  sessionId: string;
  onChunk: (stream: Stream, chunk: string) => void;
  onExit: (code: number, error?: string) => void;
}

export interface Adapter {
  name: string;
  newSessionId: () => string;
  run: (options: RunOptions) => ChildProcess;
}

// eslint-disable-next-line no-control-regex -- the escape byte is the point
const stripAnsiRe = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
export const stripAnsi = (s: string): string => s.replace(stripAnsiRe, '');

// Session ids are not secrets, but they are identifiers: keep them unpredictable.
const random = () => randomUUID().replaceAll('-', '').slice(0, 8);

function spawnStreaming({
  command,
  args,
  cwd,
  env,
  onChunk,
  onExit,
}: {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  onChunk: RunOptions['onChunk'];
  onExit: RunOptions['onExit'];
}): ChildProcess {
  const child = spawn(command, args, {
    cwd,
    // Close stdin: agents that read stdin will hang forever if it stays open.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env },
  });
  // `error` (spawn failed) and `close` can both fire for one process: report the
  // exit once, so the caller never sees a double `chat-done`.
  let reported = false;
  const finish = (code: number, error?: string): void => {
    if (reported) return;
    reported = true;
    onExit(code, error);
  };
  child.stdout?.on('data', (b: Buffer) => onChunk('stdout', String(b)));
  child.stderr?.on('data', (b: Buffer) => onChunk('stderr', String(b)));
  child.on('error', (err) => finish(-1, `cannot start ${command}: ${err.message}`));
  child.on('close', (code) => finish(code ?? -1));
  return child;
}

export const opencode: Adapter = {
  name: 'opencode',
  newSessionId: () => `ses_${Date.now().toString(36)}${random()}`,
  run({ cfg, cwd, prompt, sessionId, onChunk, onExit }) {
    const a = cfg.agent;
    const args = ['run'];
    if (a.standalone) args.push('--standalone');
    if (a.agent) args.push('--agent', a.agent);
    if (a.model) args.push('--model', a.model);
    args.push('--session', sessionId, '--auto', prompt);
    return spawnStreaming({ command: a.command || 'opencode', args, cwd, onChunk, onExit });
  },
};

export const command: Adapter = {
  name: 'command',
  newSessionId: () => `ses_${Date.now().toString(36)}${random()}`,
  run({ cfg, cwd, prompt, sessionId, onChunk, onExit }) {
    const a = cfg.agent;
    const template = Array.isArray(a.args) && a.args.length ? a.args : ['{prompt}'];
    const args = template.map((s) =>
      String(s).replaceAll('{prompt}', prompt).replaceAll('{session}', sessionId),
    );
    return spawnStreaming({ command: a.command, args, cwd, onChunk, onExit });
  },
};

export const adapters: Record<string, Adapter> = { opencode, command };
export const getAdapter = (name: string): Adapter => adapters[name] ?? opencode;
