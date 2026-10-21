// modelroom — reading an opencode session back
//
// The room already runs through the configured `command`. When that command is
// opencode we can also ask its API what happened in the session: cost, tokens,
// the messages, the model's context window, MCP servers and skills. Everything
// here is best-effort and opencode-only — any failure returns null/empty and the
// UI just hides the panel. Nothing here writes.

import { spawn, type ChildProcess } from 'node:child_process';
import type { Config } from '../core/config.ts';
import type { Part, Turn } from '../api/chat.ts';
import { parseParts, toTurns } from './parts.ts';

const MAX_OUTPUT = 8 * 1024 * 1024; // a runaway response must not grow without bound
const TIMEOUT_MS = 15_000;
const MODEL_TTL = 10 * 60_000;
const EXTRAS_TTL = 60_000;
const MCP_STARTUP_MS = 10_000; // a server this young may still be connecting its MCP servers
const MCP_RETRY_MS = 1_500; // ...so an empty list gets one more look before we believe it
const POLL_MS = 700; // how often to look at an answer that is being written
const MAX_FAILURES = 3; // then stop asking: the CLI's own text is the answer

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

/**
 * The opencode API, as reading a session needs it. `server/opencode-server.ts`
 * produces modelroom's own server, which satisfies this; a plain fake is enough
 * in a test, and passing nothing falls back to the CLI.
 */
export interface SessionApi {
  get: (path: string) => Promise<unknown>;
  /** When the server started — see `OpenCodeServer.startedAt`. Absent when the
   *  caller has no server of its own. */
  startedAt?: number;
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
 * Ask opencode's API.
 *
 * `api` is modelroom's own server, the one the agent runs on: it answers for
 * this layer, and everything here is read from it when it is there.
 *
 * Without it we fall back to the CLI, and the order depends on the path. The
 * shared background service answers for its own location, not for the layer the
 * CLI was spawned in, so what this layer's config decides — its model
 * catalogue, its MCP servers, its skills — asks a private `--standalone` server
 * first and the shared service last. Sessions are the other way round: they live
 * in the data directory both services share, so the shared service is asked
 * first and no server of ours has to start to answer.
 */
async function apiGet(
  cfg: Config,
  path: string,
  api?: SessionApi | null,
  layerScoped = false,
): Promise<unknown> {
  if (api) return api.get(path);
  return layerScoped
    ? ((await runApi(cfg, path, true)) ?? (await runApi(cfg, path, false)))
    : ((await runApi(cfg, path, false)) ?? (await runApi(cfg, path, true)));
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
async function modelLimits(cfg: Config, api?: SessionApi | null): Promise<Map<string, number>> {
  if (modelLimitsCache && Date.now() - modelLimitsCache.at < MODEL_TTL) return modelLimitsCache.map;
  const map = new Map<string, number>();
  for (const raw of listOf(await apiGet(cfg, '/api/model', api, true))) {
    if (!isRecord(raw)) continue;
    const id = str(raw.id);
    const limit = isRecord(raw.limit) ? num(raw.limit.context) : null;
    if (id && limit) map.set(id, limit);
  }
  if (map.size) modelLimitsCache = { at: Date.now(), map };
  return map;
}

interface Extras {
  mcp: McpServer[];
  skills: string[];
}

let extrasCache: ({ at: number } & Extras) | null = null;
let extrasReading: Promise<Extras> | null = null;

/** The layer's MCP servers and skills, as its own server reports them. */
async function readExtras(cfg: Config, api?: SessionApi | null): Promise<Extras> {
  const [mcpRes, skillRes] = await Promise.all([
    apiGet(cfg, '/api/mcp', api, true),
    apiGet(cfg, '/api/skill', api, true),
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
  return { mcp, skills };
}

/**
 * The layer's MCP servers and skills, cached for a minute. Callers that arrive
 * together share the one read.
 *
 * An empty MCP list is never cached. opencode connects the servers its config
 * names a moment after it starts answering, and a slow one (a remote server, an
 * `npx` fetch) takes longer than that — so empty usually means "not yet", and
 * believing it would leave a configured layer looking unconfigured until the
 * cache expired.
 */
async function extras(cfg: Config, api?: SessionApi | null): Promise<Extras> {
  if (extrasCache && Date.now() - extrasCache.at < EXTRAS_TTL) return extrasCache;
  if (!extrasReading) {
    extrasReading = settleExtras(cfg, api).finally(() => {
      extrasReading = null;
    });
  }
  return extrasReading;
}

/**
 * Read the lists, giving a server that has just started the one look it needs:
 * an empty answer inside its startup window is asked again rather than returned
 * as the answer.
 */
async function settleExtras(cfg: Config, api?: SessionApi | null): Promise<Extras> {
  let lists = await readExtras(cfg, api);
  const age = api?.startedAt === undefined ? null : Date.now() - api.startedAt;
  if (!lists.mcp.length && age !== null && age < MCP_STARTUP_MS) {
    await new Promise((resolve) => setTimeout(resolve, MCP_RETRY_MS));
    lists = await readExtras(cfg, api);
  }
  // Only a non-empty list is worth remembering — see `extras`.
  if (lists.mcp.length) extrasCache = { at: Date.now(), ...lists };
  return lists;
}

/**
 * Everything the session panel needs for one room session. `api` is modelroom's
 * own opencode server — the one the turn runs on, and the only one whose MCP
 * servers and skills are this layer's; the CLI is the fallback when there is
 * none. Returns null when opencode is unreachable, so the caller can say so
 * plainly.
 */
export async function sessionView(
  cfg: Config,
  sessionId: string | null,
  api?: SessionApi | null,
): Promise<SessionView | null> {
  if (!sessionId) return null;
  const [infoRes, msgRes] = await Promise.all([
    apiGet(cfg, `/api/session/${sessionId}`, api),
    apiGet(cfg, `/api/session/${sessionId}/message`, api),
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
    const limit = (await modelLimits(cfg, api)).get(model) ?? null;
    if (limit)
      context = { used, limit, pct: Math.min(100, Math.round((used / limit) * 1000) / 10) };
  }

  const { mcp, skills } = await extras(cfg, api);
  const workspace = isRecord(info) && isRecord(info.location) ? str(info.location.directory) : null;

  return { stats, context, turns: toTurns(messages), mcp, skills, workspace };
}

// ── an answer that is still being written ────────────────────────────────────
//
// The chat used to have one source for a running turn: the CLI's stdout, which is
// prose. The session, on the other hand, is structured the moment it is written —
// opencode keeps the parts on its server as the agent works, so reading them back
// while the process is still alive is the live view. That is what this is.

export interface PartsSnapshot {
  /** When the newest *filled* assistant step was written (ms since epoch). */
  created: number;
  /** The trailing assistant turn, every step of it merged. */
  parts: Part[];
}

/** When the newest assistant step that has anything in it was written. */
function newestStepAt(messages: unknown[]): number {
  for (const raw of [...messages].sort(byTime).toReversed()) {
    if (!isRecord(raw) || raw.type !== 'assistant') continue;
    if (!parseParts(raw).length) continue; // created, but nothing in it yet
    return created(raw);
  }
  return 0;
}

/**
 * The answer in flight: the parts of the trailing assistant turn. `null` when the
 * API cannot be reached, or when the session has no filled assistant step yet.
 */
export async function sessionParts(cfg: Config, sessionId: string): Promise<PartsSnapshot | null> {
  const res = await apiGet(cfg, `/api/session/${sessionId}/message`);
  if (!res) return null;
  const messages = listOf(res);
  const last = toTurns(messages).at(-1);
  if (!last || last.role !== 'assistant' || !last.parts.length) return null;
  return { created: newestStepAt(messages), parts: last.parts };
}

export interface PartsWatcher {
  /**
   * Stop watching. Takes one last snapshot first, so a turn that finished between
   * two polls is not lost, and resolves when that snapshot has been handed over.
   */
  stop: () => Promise<void>;
}

/**
 * Follow the turn this prompt is producing. `since` is when the run started: an
 * answer written after it is ours, one before it is the previous prompt's, and
 * the difference is the whole reason a run does not start by showing the last one.
 *
 * Gives up after a few unreachable polls — an agent whose server is not there
 * still streams its text, and this must not spawn a process every second forever.
 */
export function watchParts(
  cfg: Config,
  sessionId: string,
  onParts: (parts: Part[]) => void,
  options: { since?: number; intervalMs?: number } = {},
): PartsWatcher {
  const since = options.since ?? Date.now();
  const intervalMs = options.intervalMs ?? POLL_MS;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let failures = 0;
  let lastPayload = '';

  function giveUp(): void {
    clearInterval(timer);
  }

  async function poll(): Promise<void> {
    const snapshot = await sessionParts(cfg, sessionId);
    if (!snapshot) {
      failures += 1;
      if (failures >= MAX_FAILURES) giveUp();
      return;
    }
    failures = 0;
    if (snapshot.created < since) return; // the answer before this prompt
    const payload = JSON.stringify(snapshot.parts);
    if (payload === lastPayload) return; // nothing moved since the last look
    lastPayload = payload;
    onParts(snapshot.parts);
  }

  function tick(): void {
    if (stopped || inFlight) return; // one call at a time
    inFlight = poll().finally(() => {
      inFlight = null;
    });
  }

  const timer = setInterval(tick, intervalMs);
  tick(); // immediately: the first step should not wait for the first interval

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await inFlight;
      await poll();
    },
  };
}
