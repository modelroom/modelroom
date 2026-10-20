// modelroom — driving one opencode turn through the server API.
//
// `opencode run` cannot answer the agent's question: the one-shot client has no
// one to ask, so it cancels the form and the tool errors. Here modelroom is the
// client instead. It creates the room's session, sends the prompt, and follows
// the turn on the server modelroom owns (`server/opencode-server.ts`) — reading
// the parts as they are written, surfacing any form as an `Ask`, and answering
// the permission requests the way `--auto` would. The turn ends when the session
// goes idle, not when a process exits.
//
// opencode's form shape is the server's business: `toAsk` turns it into the
// browser-safe `Ask`, and `replyAsk` turns the answer back.

import type { Ask, AskAnswer, AskOption, AskQuestion, Part } from '../api/chat.ts';
import type { Config } from '../core/config.ts';
import { t } from '../i18n/catalog.ts';
import { toTurns } from './parts.ts';
import type { Api } from './opencode-server.ts';

const POLL_MS = 700;
const MAX_FAILURES = 3; // then stop asking: the agent's server is gone
const MAX_TURN_MS = 30 * 60_000; // a turn that never ends must not hold the room forever

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const created = (m: unknown): number =>
  isRecord(m) && isRecord(m.time) && typeof m.time.created === 'number' ? m.time.created : 0;

const dataOf = (res: unknown): unknown => (isRecord(res) ? res.data : undefined);
const listOf = (res: unknown): unknown[] => {
  const data = dataOf(res);
  return Array.isArray(data) ? data : [];
};

/** `provider/model#variant` → the `Model.Ref` the session API takes. */
function parseModel(ref: string | null): Record<string, string> | null {
  if (!ref) return null;
  const slash = ref.indexOf('/');
  if (slash <= 0) return null;
  const providerID = ref.slice(0, slash);
  const rest = ref.slice(slash + 1);
  const hash = rest.indexOf('#');
  if (hash < 0) return { providerID, id: rest };
  return { providerID, id: rest.slice(0, hash), variant: rest.slice(hash + 1) };
}

/** The fields the question tool makes: a single choice, or several. */
function questionsOf(fields: unknown): AskQuestion[] {
  const questions: AskQuestion[] = [];
  if (!Array.isArray(fields)) return questions;
  for (const field of fields) {
    if (!isRecord(field)) continue;
    const type = str(field.type);
    if (type !== 'string' && type !== 'multiselect') continue;
    const options: AskOption[] = [];
    for (const option of Array.isArray(field.options) ? field.options : []) {
      if (!isRecord(option)) continue;
      const label = str(option.label) ?? str(option.value);
      if (!label) continue;
      const description = str(option.description);
      options.push(description ? { label, description } : { label });
    }
    const title = str(field.title) ?? '';
    questions.push({
      key: str(field.key) ?? `q${questions.length}`,
      header: title,
      question: str(field.description) ?? title,
      options,
      multiple: type === 'multiselect',
    });
  }
  return questions;
}

/**
 * opencode's form → the chat's `Ask`. Only the fields a person can answer are
 * kept; a form with none is not something this UI can show, so it is dropped.
 */
export function toAsk(form: unknown): Ask | null {
  if (!isRecord(form)) return null;
  const id = str(form.id);
  if (!id) return null;
  const questions = questionsOf(form.fields);
  if (!questions.length) return null;
  const metadata = isRecord(form.metadata) ? form.metadata : {};
  const tool = isRecord(metadata.tool) ? metadata.tool : {};
  return {
    id,
    title: str(form.title) ?? undefined,
    questions,
    source: {
      messageID: str(tool.messageID) ?? undefined,
      callID: str(tool.id) ?? undefined,
    },
  };
}

/** The opencode answer payload: a string for one choice, an array for several. */
export function toFormAnswer(form: unknown, answer: AskAnswer): Record<string, string | string[]> {
  const multiple = new Map<string, boolean>();
  if (isRecord(form) && Array.isArray(form.fields)) {
    for (const field of form.fields) {
      if (!isRecord(field)) continue;
      const key = str(field.key);
      if (key) multiple.set(key, str(field.type) === 'multiselect');
    }
  }
  const payload: Record<string, string | string[]> = {};
  for (const [key, values] of Object.entries(answer)) {
    const chosen = values.map((value) => value.trim()).filter(Boolean);
    if (!chosen.length) continue;
    const isMultiple = multiple.get(key) ?? chosen.length > 1;
    if (isMultiple) payload[key] = chosen;
    else payload[key] = chosen[0] ?? '';
  }
  return payload;
}

export interface TurnCallbacks {
  onParts: (parts: Part[]) => void;
  onAsk: (ask: Ask) => void;
  onAskDone: (askId: string) => void;
  onExit: (code: number, error?: string) => void;
}

export interface Turn {
  /** The questions the agent is still blocked on (for a client that reloads). */
  pending: () => Ask[];
  stop: () => Promise<void>;
  replyAsk: (askId: string, answer: AskAnswer) => Promise<void>;
  dismissAsk: (askId: string) => Promise<void>;
}

export interface StartTurnOptions {
  cfg: Config;
  api: Api;
  sessionId: string;
  prompt: string;
  /** When the prompt was sent: an idle message after it is this turn's end. */
  since: number;
  callbacks: TurnCallbacks;
  intervalMs?: number;
}

async function ensureSession(cfg: Config, api: Api, sessionId: string): Promise<boolean> {
  if (await api.get(`/api/session/${sessionId}`)) return true;
  const body: Record<string, unknown> = { id: sessionId, location: { directory: cfg.rootDir } };
  if (cfg.agent.agent) body.agent = cfg.agent.agent;
  const model = parseModel(cfg.agent.model);
  if (model) body.model = model;
  if (await api.post('/api/session', body)) return true;
  // The create may have lost a race with an existing session: ask once more.
  return Boolean(await api.get(`/api/session/${sessionId}`));
}

/**
 * Start the turn: ensure the session, send the prompt, and follow it until the
 * session is idle. Returns null when the session or the prompt cannot be set up.
 */
export async function startTurn(options: StartTurnOptions): Promise<Turn | null> {
  const { cfg, api, sessionId, prompt, since, callbacks } = options;
  const intervalMs = options.intervalMs ?? POLL_MS;

  if (!(await ensureSession(cfg, api, sessionId))) return null;
  if (!(await api.post(`/api/session/${sessionId}/prompt`, { text: prompt }))) return null;

  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let failures = 0;
  let lastParts = '';
  let lastForm = '';
  const openAsks = new Map<string, { ask: Ask; raw: unknown }>();
  const closedAsks = new Set<string>(); // answered or dismissed: never shown twice
  const seenPermissions = new Set<string>();

  function finish(code: number, error?: string): void {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    clearTimeout(deadline);
    callbacks.onExit(code, error);
  }

  function emitAsks(pending: unknown[]): void {
    for (const raw of pending) {
      const ask = toAsk(raw);
      if (!ask || openAsks.has(ask.id) || closedAsks.has(ask.id)) continue;
      openAsks.set(ask.id, { ask, raw });
      callbacks.onAsk(ask);
    }
  }

  function approvePermissions(requests: unknown[]): void {
    for (const raw of requests) {
      if (!isRecord(raw)) continue;
      const id = str(raw.id);
      if (!id || seenPermissions.has(id)) continue;
      seenPermissions.add(id);
      // `--auto` approves a request that asks; a configured `deny` never asks.
      void api.post(`/api/session/${sessionId}/permission/${id}/reply`, { decision: 'once' });
    }
  }

  async function poll(): Promise<void> {
    const [messages, pendingForms, permissions] = await Promise.all([
      api.get(`/api/session/${sessionId}/message`),
      api.get(`/api/session/${sessionId}/form`),
      api.get(`/api/session/${sessionId}/permission`),
    ]);
    if (stopped) return;

    if (!messages) {
      failures += 1;
      if (failures >= MAX_FAILURES) {
        finish(-1, t(cfg.lang, 'server.agentUnavailable', { room: sessionId }));
      }
      return;
    }
    failures = 0;

    const list = listOf(messages);
    const idle = list.find((m) => isRecord(m) && m.type === 'idle' && created(m) >= since);
    const last = toTurns(list).at(-1);
    if (last?.role === 'assistant' && last.parts.length) {
      const payload = JSON.stringify(last.parts);
      if (payload !== lastParts) {
        lastParts = payload;
        callbacks.onParts(last.parts);
      }
    }

    // A form is the agent asking; only a new one is announced.
    const pending = listOf(pendingForms);
    const signature = JSON.stringify(pending);
    if (signature !== lastForm) {
      lastForm = signature;
      emitAsks(pending);
    }
    if (permissions) approvePermissions(listOf(permissions));

    if (idle) {
      const outcome = isRecord(idle) ? str(idle.outcome) : null;
      finish(outcome === null || outcome === 'succeeded' ? 0 : 1);
    }
  }

  function tick(): void {
    if (stopped || inFlight) return;
    inFlight = poll().finally(() => {
      inFlight = null;
    });
  }

  const timer = setInterval(tick, intervalMs);
  const deadline = setTimeout(
    () => finish(-1, t(cfg.lang, 'server.agentTimeout', { room: sessionId })),
    MAX_TURN_MS,
  );
  deadline.unref?.();
  tick();

  return {
    pending: () => [...openAsks.values()].map((entry) => entry.ask),
    stop: async () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      clearTimeout(deadline);
      await inFlight;
      // The server keeps the session: tell it to drop the turn that is running.
      void api.post(`/api/session/${sessionId}/interrupt`);
    },
    replyAsk: async (askId, answer) => {
      const entry = openAsks.get(askId);
      const ok = await api.post(`/api/session/${sessionId}/form/${askId}/reply`, {
        answer: toFormAnswer(entry?.raw, answer),
      });
      if (!ok) return;
      openAsks.delete(askId);
      closedAsks.add(askId);
      callbacks.onAskDone(askId);
    },
    dismissAsk: async (askId) => {
      await api.del(`/api/session/${sessionId}/form/${askId}`);
      openAsks.delete(askId);
      closedAsks.add(askId);
      callbacks.onAskDone(askId);
    },
  };
}
