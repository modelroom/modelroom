// modelroom — reading an opencode session back
//
// The room already runs through the configured `command`. When that command is
// opencode we can also ask its API what happened in the session: cost, tokens,
// the messages, the model's context window, MCP servers and skills. Everything
// here is best-effort and opencode-only — any failure returns null/empty and the
// UI just hides the panel. Nothing here writes.

import { spawn, type ChildProcess } from 'node:child_process';
import type { Config } from './config.ts';
import { toTurns, type Turn } from './parts.ts';

const MAX_OUTPUT = 8 * 1024 * 1024; // a runaway response must not grow without bound
const TIMEOUT_MS = 15_000;
const MODEL_TTL = 10 * 60_000;
const EXTRAS_TTL = 60_000;

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface SessionStats {
  cost: number | null;
  tokens: TokenUsage | null;
  outcome: string | null;
  model: string | null;
}

export interface ContextUsage {
  used: number;
  limit: number;
  pct: number; // 0..100, one decimal
}

export interface McpServer {
  name: string;
  status: string;
  error: string | null;
}

export interface SessionView {
  stats: SessionStats;
  context: ContextUsage | null;
  /** The conversation, as parts: text, reasoning and one entry per tool call. */
  turns: Turn[];
  mcp: McpServer[];
  skills: string[];
  workspace: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The `{ data: … }` envelope opencode puts around most responses. */
const dataOf = (res: unknown): unknown => (isRecord(res) ? res.data : undefined);
const listOf = (res: unknown): unknown[] => {
  const d = dataOf(res);
  return Array.isArray(d) ? d : [];
};

/** One `opencode api GET` call. Never throws; null on any failure. */
function runApi(cfg: Config, path: string, standalone: boolean): Promise<unknown> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      const args = standalone ? ['api', '--standalone', 'GET', path] : ['api', 'GET', path];
      child = spawn(cfg.agent.command || 'opencode', args, {
        cwd: cfg.rootDir,
        // `--standalone` shares the data directory but needs no background service.
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      });
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    let settled = false;
    const finish = (value: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    child.stdout?.on('data', (b: Buffer) => {
      out += String(b);
      if (out.length > MAX_OUTPUT) finish(null);
    });
    child.stderr?.on('data', () => {}); // the error text is not useful to us
    child.on('error', () => finish(null));
    child.on('close', (code) => {
      if (code !== 0 || !out.trim()) return finish(null);
      try {
        finish(JSON.parse(out));
      } catch {
        finish(null);
      }
    });
  });
}

/**
 * Ask opencode's API. The background service knows the model catalogue, MCP
 * servers and skills; a private (`--standalone`) server shares the data
 * directory but not those. Try the service first, then a private server.
 */
async function apiGet(cfg: Config, path: string): Promise<unknown> {
  return (await runApi(cfg, path, false)) ?? (await runApi(cfg, path, true));
}

function toTokens(raw: unknown): TokenUsage | null {
  if (!isRecord(raw)) return null;
  const cache = isRecord(raw.cache) ? raw.cache : {};
  return {
    input: num(raw.input) ?? 0,
    output: num(raw.output) ?? 0,
    reasoning: num(raw.reasoning) ?? 0,
    cacheRead: num(cache.read) ?? 0,
    cacheWrite: num(cache.write) ?? 0,
  };
}

const created = (m: unknown): number =>
  isRecord(m) && isRecord(m.time) ? (num(m.time.created) ?? 0) : 0;
const byTime = (a: unknown, b: unknown): number => created(a) - created(b);

/** The model the last assistant step used, when the session itself has none. */
function lastModel(messages: unknown[]): string | null {
  for (const raw of [...messages].sort(byTime).toReversed()) {
    if (isRecord(raw) && raw.type === 'assistant' && isRecord(raw.model)) {
      const id = str(raw.model.id);
      if (id) return id;
    }
  }
  return null;
}

/** The last turn's prompt size is the current context: fresh input + cache reads. */
function contextUsed(messages: unknown[]): number | null {
  for (const raw of [...messages].sort(byTime).toReversed()) {
    if (!isRecord(raw) || raw.type !== 'assistant') continue;
    const tokens = toTokens(raw.tokens);
    if (tokens) return tokens.input + tokens.cacheRead;
  }
  return null;
}

let modelLimitsCache: { at: number; map: Map<string, number> } | null = null;
async function modelLimits(cfg: Config): Promise<Map<string, number>> {
  if (modelLimitsCache && Date.now() - modelLimitsCache.at < MODEL_TTL) return modelLimitsCache.map;
  const map = new Map<string, number>();
  for (const raw of listOf(await apiGet(cfg, '/api/model'))) {
    if (!isRecord(raw)) continue;
    const id = str(raw.id);
    const limit = isRecord(raw.limit) ? num(raw.limit.context) : null;
    if (id && limit) map.set(id, limit);
  }
  if (map.size) modelLimitsCache = { at: Date.now(), map };
  return map;
}

let extrasCache: { at: number; mcp: McpServer[]; skills: string[] } | null = null;
async function extras(cfg: Config): Promise<{ mcp: McpServer[]; skills: string[] }> {
  if (extrasCache && Date.now() - extrasCache.at < EXTRAS_TTL) return extrasCache;
  const [mcpRes, skillRes] = await Promise.all([
    apiGet(cfg, '/api/mcp'),
    apiGet(cfg, '/api/skill'),
  ]);
  const mcp: McpServer[] = [];
  for (const raw of listOf(mcpRes)) {
    if (!isRecord(raw)) continue;
    const status = isRecord(raw.status) ? raw.status : {};
    mcp.push({
      name: str(raw.name) ?? '?',
      status: str(status.status) ?? 'unknown',
      error: str(status.error),
    });
  }
  const skills: string[] = [];
  for (const raw of listOf(skillRes)) {
    if (!isRecord(raw)) continue;
    const name = str(raw.name) ?? str(raw.id);
    if (name) skills.push(name);
  }
  extrasCache = { at: Date.now(), mcp, skills };
  return extrasCache;
}

/**
 * Everything the session panel needs for one room session.
 * Returns null when opencode is unreachable, so the caller can say so plainly.
 */
export async function sessionView(
  cfg: Config,
  sessionId: string | null,
): Promise<SessionView | null> {
  if (!sessionId) return null;
  const [infoRes, msgRes] = await Promise.all([
    apiGet(cfg, `/api/session/${sessionId}`),
    apiGet(cfg, `/api/session/${sessionId}/message`),
  ]);
  if (!infoRes && !msgRes) return null;

  const info = dataOf(infoRes);
  const messages = listOf(msgRes);

  const model =
    (isRecord(info) && isRecord(info.model) ? str(info.model.id) : null) ?? lastModel(messages);
  const stats: SessionStats = {
    cost: isRecord(info) ? num(info.cost) : null,
    tokens: isRecord(info) ? toTokens(info.tokens) : null,
    outcome: isRecord(info) ? str(info.outcome) : null,
    model,
  };

  let context: ContextUsage | null = null;
  const used = contextUsed(messages);
  if (used !== null && model) {
    const limit = (await modelLimits(cfg)).get(model) ?? null;
    if (limit)
      context = { used, limit, pct: Math.min(100, Math.round((used / limit) * 1000) / 10) };
  }

  const { mcp, skills } = await extras(cfg);
  const workspace = isRecord(info) && isRecord(info.location) ? str(info.location.directory) : null;

  return { stats, context, turns: toTurns(messages), mcp, skills, workspace };
}
