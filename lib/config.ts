// modelroom — config and state
//
// Config (`modelroom.json`) is committed. State (`.modelroom/state.json`) is local:
// chat sessions per room, and any settings changed from the UI.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export type AdapterName = 'opencode' | 'command';

export interface AgentConfig {
  adapter: AdapterName;
  command: string;
  /** e.g. "openrouter/deepseek/deepseek-v4.1-flash" (null = let the agent decide) */
  model: string | null;
  agent: string;
  /** opencode: run with a private server (uses this process's env) */
  standalone: boolean;
  /** command adapter: e.g. ["-p", "{prompt}"] */
  args: string[];
}

export interface Config {
  root: string;
  rooms: string;
  artifact: string;
  docs: string[];
  port: number;
  host: string;
  agent: AgentConfig;
  /** Resolved at load time. */
  rootDir: string;
  roomsDir: string;
  configPath: string;
  stateDir: string;
  statePath: string;
}

export interface State {
  sessions: Record<string, string>;
  settings: Record<string, unknown>;
}

export const DEFAULTS = {
  root: '.',
  rooms: 'rooms',
  artifact: 'index.html',
  docs: ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md'],
  port: 4321,
  host: '127.0.0.1',
  agent: {
    adapter: 'opencode',
    command: 'opencode',
    model: null,
    agent: 'build',
    standalone: true,
    args: [],
  },
} as const;

type ConfigFile = Partial<Omit<Config, 'agent'>> & { agent?: Partial<AgentConfig> };

export async function loadConfig(cwd: string = process.cwd()): Promise<Config> {
  const path = resolve(cwd, 'modelroom.json');
  let file: ConfigFile = {};
  try {
    file = JSON.parse(await readFile(path, 'utf8')) as ConfigFile;
  } catch {
    /* no config: defaults */
  }
  const cfg = {
    root: file.root ?? DEFAULTS.root,
    rooms: file.rooms ?? DEFAULTS.rooms,
    artifact: file.artifact ?? DEFAULTS.artifact,
    docs: Array.isArray(file.docs) && file.docs.length ? file.docs : [...DEFAULTS.docs],
    port: file.port ?? DEFAULTS.port,
    host: file.host ?? DEFAULTS.host,
    agent: { ...DEFAULTS.agent, ...file.agent } as AgentConfig,
    rootDir: '',
    roomsDir: '',
    configPath: path,
    stateDir: '',
    statePath: '',
  } satisfies Config;
  cfg.rootDir = resolve(cwd, cfg.root);
  cfg.roomsDir = resolve(cfg.rootDir, cfg.rooms);
  cfg.stateDir = join(cfg.rootDir, '.modelroom');
  cfg.statePath = join(cfg.stateDir, 'state.json');
  return cfg;
}

export async function loadState(cfg: Config): Promise<State> {
  try {
    const raw = JSON.parse(await readFile(cfg.statePath, 'utf8')) as Partial<State>;
    return { sessions: raw.sessions ?? {}, settings: raw.settings ?? {} };
  } catch {
    return { sessions: {}, settings: {} };
  }
}

export async function saveState(cfg: Config, state: State): Promise<void> {
  await mkdir(dirname(cfg.statePath), { recursive: true });
  const tmp = cfg.statePath + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
  await rename(tmp, cfg.statePath);
}

/** Settings the UI may change (whitelist). */
export function applySettings(
  cfg: Config,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const applied: Record<string, unknown> = {};
  if (typeof patch.model === 'string') {
    cfg.agent.model = patch.model || null;
    applied.model = cfg.agent.model;
  }
  if (typeof patch.agent === 'string' && patch.agent) {
    cfg.agent.agent = patch.agent;
    applied.agent = cfg.agent.agent;
  }
  if (patch.adapter === 'opencode' || patch.adapter === 'command') {
    cfg.agent.adapter = patch.adapter;
    applied.adapter = cfg.agent.adapter;
  }
  if (typeof patch.command === 'string' && patch.command) {
    cfg.agent.command = patch.command;
    applied.command = cfg.agent.command;
  }
  if (typeof patch.standalone === 'boolean') {
    cfg.agent.standalone = patch.standalone;
    applied.standalone = cfg.agent.standalone;
  }
  return applied;
}
