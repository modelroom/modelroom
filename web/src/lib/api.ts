// Everything the room UI asks of the modelroom server, typed once.

export interface AgentConfig {
  adapter: string;
  command: string;
  agent: string;
  model: string | null;
  standalone: boolean;
}

export interface RoomConfig {
  root: string;
  rooms: string;
  artifact: string;
  docs: string[];
  agent: AgentConfig;
}

export interface RoomInfo {
  name: string;
  title: string;
  status: string | null;
  summary: string | null;
  tags: string[];
  keyPoints: string[];
  version: string | number | null;
  deprecated: boolean;
  updatedAt: number;
  hasArtifact: boolean;
  hasThumb: boolean;
  artifactUrl: string;
  thumbUrl: string | null;
  behaviourIds: string[];
}

export interface RoomResponse {
  room: RoomInfo;
  session: string | null;
  config: RoomConfig;
}

export interface DocResponse {
  room: string;
  name: string;
  text: string;
  mtime: number;
  /** sha256 of the text, truncated — the version a save is based on. */
  hash: string;
  missing?: boolean;
  error?: string;
}

export interface PutDocResponse {
  room?: string;
  name?: string;
  mtime?: number;
  hash?: string;
  error?: string;
  text?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

/** One file an edit touched, with the patch opencode produced for it. */
export interface DiffFile {
  file: string;
  patch: string;
}

/**
 * A turn is a list of parts. `text` is what the model said, `reasoning` is what
 * it thought, and `tool` is one call with its input, output and patches — all of
 * it from the session API, none of it parsed out of the CLI's stdout.
 */
export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | {
      kind: 'tool';
      id: string;
      name: string;
      status: 'running' | 'completed' | 'error';
      summary: string | null;
      files: DiffFile[];
      output: string | null;
      exit: number | null;
      truncated: boolean;
    };

export interface Turn {
  role: 'user' | 'assistant';
  parts: Part[];
}

export interface SessionView {
  available: boolean;
  room: string;
  session: string | null;
  stats?: {
    cost: number | null;
    tokens: TokenUsage | null;
    outcome: string | null;
    model: string | null;
  };
  context?: { used: number; limit: number; pct: number } | null;
  turns?: Turn[];
  mcp?: Array<{ name: string; status: string; error: string | null }>;
  skills?: string[];
  workspace?: string | null;
}

export interface ChatResponse {
  started: boolean;
  reason?: string;
  error?: string;
  sessionId?: string;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  return data;
}

const jsonPost = (payload: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

export const getRoom = (room: string): Promise<RoomResponse> =>
  json(`/api/room?room=${encodeURIComponent(room)}`);

export const getDoc = (room: string, name: string): Promise<DocResponse> =>
  json(`/api/doc?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`);

export async function putDoc(body: {
  room: string;
  name: string;
  text: string;
  hash: string;
  mtime: number;
}): Promise<{ ok: boolean; status: number; data: PutDocResponse }> {
  const res = await fetch('/api/doc', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as PutDocResponse;
  return { ok: res.ok, status: res.status, data };
}

export const getSession = (room: string): Promise<SessionView> =>
  json(`/api/session?room=${encodeURIComponent(room)}`);

export const postChat = (room: string, prompt: string): Promise<ChatResponse> =>
  json('/api/chat', jsonPost({ room, prompt }));

export const postSession = (room: string): Promise<{ sessionId?: string; error?: string }> =>
  json('/api/session', jsonPost({ room }));

export const postRender = (
  room: string,
  device: string,
): Promise<{ ok?: boolean; error?: string }> => json('/api/artifact', jsonPost({ room, device }));

/** `3.4%` → the width a bar should have, clamped and safe. */
export const clampPct = (pct: number): number => Math.max(0, Math.min(100, pct));

/* ── the dashboard ───────────────────────────────────────────────────────── */

export interface DashboardRoom {
  name: string;
  title: string;
  status: string | null;
  summary: string | null;
  tags: string[];
  version: string | number | null;
  deprecated: boolean;
  updatedAt: number;
  hasArtifact: boolean;
  hasThumb: boolean;
  thumbUrl: string | null;
  behaviourIds: string[];
  fields: Record<string, unknown>;
  /** True while an agent is running a prompt in this room. */
  running: boolean;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface Facet {
  key: string;
  kind: 'string' | 'array';
  control: 'checkboxes' | 'radio' | 'select';
  values: FacetValue[];
}

export interface RoomsResponse {
  count: number;
  rooms: DashboardRoom[];
  facets: Facet[];
  config: RoomConfig;
}

export interface Snippet {
  line: number;
  text: string;
}

export interface SearchHit {
  name: string;
  score: number;
  snippets: Snippet[];
}

export const getRooms = (): Promise<RoomsResponse> => json('/api/rooms');

export const searchRooms = (q: string): Promise<{ q: string; hits: SearchHit[] }> =>
  json(`/api/search?q=${encodeURIComponent(q)}`);

export const postSettings = (
  patch: Record<string, unknown>,
): Promise<{ applied?: Record<string, unknown>; config?: RoomConfig; error?: string }> =>
  json('/api/settings', jsonPost(patch));
