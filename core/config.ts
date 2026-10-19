// modelroom — config and state
//
// Config (`modelroom.json`) is committed. State (`.modelroom/state.json`) is local:
// chat sessions per room, and any settings changed from the UI.

import { access, readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isLang, type Lang } from '../shared/lang.ts';
import { detectLang } from './locale.ts';

export type { Lang } from '../shared/lang.ts';
export { isLang, LANGS } from '../shared/lang.ts';

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
  /** Where local state lives, relative to the config file. */
  state: string;
  artifact: string;
  docs: string[];
  port: number;
  host: string;
  /** The language of the tool UI, the CLI and the templates. */
  lang: Lang;
  agent: AgentConfig;
  /** Resolved at load time, all relative to the config file's directory. */
  rootDir: string;
  roomsDir: string;
  configPath: string;
  configDir: string;
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
  state: '.modelroom',
  artifact: 'index.html',
  docs: ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md'],
  port: 4321,
  host: '127.0.0.1',
  lang: 'en' as Lang,
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the committed config. The old layout keeps `modelroom.json` at the
 * project root; a new install puts it inside `modelroom/`. The old path wins,
 * so an existing project never changes shape underneath itself.
 */
export async function findConfigPath(cwd: string = process.cwd()): Promise<string | null> {
  for (const path of [
    resolve(cwd, 'modelroom.json'),
    resolve(cwd, 'modelroom', 'modelroom.json'),
  ]) {
    if (await exists(path)) return path;
  }
  return null;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<Config> {
  const discovered = await findConfigPath(cwd);
  const path = discovered ?? resolve(cwd, 'modelroom.json');
  const configDir = dirname(path);
  let file: ConfigFile = {};
  try {
    file = JSON.parse(await readFile(path, 'utf8')) as ConfigFile;
  } catch {
    /* no config: defaults */
  }
  const cfg = {
    root: file.root ?? DEFAULTS.root,
    rooms: file.rooms ?? DEFAULTS.rooms,
    state: typeof file.state === 'string' && file.state ? file.state : DEFAULTS.state,
    artifact: file.artifact ?? DEFAULTS.artifact,
    docs: Array.isArray(file.docs) && file.docs.length ? file.docs : [...DEFAULTS.docs],
    port: file.port ?? DEFAULTS.port,
    host: file.host ?? DEFAULTS.host,
    // No `lang` in the config means auto: the environment and the OS decide.
    lang: isLang(file.lang) ? file.lang : detectLang().lang,
    agent: { ...DEFAULTS.agent, ...file.agent } as AgentConfig,
    rootDir: '',
    roomsDir: '',
    configPath: path,
    configDir,
    stateDir: '',
    statePath: '',
  } satisfies Config;
  cfg.rootDir = resolve(configDir, cfg.root);
  cfg.roomsDir = resolve(cfg.rootDir, cfg.rooms);
  cfg.stateDir = resolve(configDir, cfg.state);
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
