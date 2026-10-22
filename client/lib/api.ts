// Everything the room UI asks of the modelroom server, typed once.
//
// The chat turn is the exception: it is defined once in `api/chat.ts` and shared
// with the server, so the two sides cannot drift.

import type {
  Ask,
  AskAnswer,
  AskOption,
  AskQuestion,
  DiffFile,
  Part,
  Turn,
} from '../../api/chat.ts';

export type { Ask, AskAnswer, AskOption, AskQuestion, DiffFile, Part, Turn };

export interface AgentConfig {
  adapter: string;
  command: string;
  agent: string;
  model: string | null;
  standalone: boolean;
}

/** One device the server can render at, resolved (rotation applied). */
export interface DeviceInfo {
  name: string;
  width: number;
  height: number;
  rotated: boolean;
}

export interface RoomConfig {
  root: string;
  rooms: string;
  artifact: string;
  docs: string[];
  lang: 'en' | 'ja';
  /** The project's default device and the png scale. */
  thumbnail: { device: string; scale: number };
  /** Every device the project knows: the built-ins plus its own. */
  devices: DeviceInfo[];
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
  createdAt: number;
  /** `updated_at` when it parses, else mtime — what "updated" sorting reads. */
  sortAt: number;
  /** The device this room's snapshot renders at: its own, else the project's. */
  device: string;
  hasArtifact: boolean;
  hasThumb: boolean;
  /** The artifact changed after its snapshot: the committed png is out of date. */
  thumbStale: boolean;
  artifactUrl: string;
  thumbUrl: string | null;
  behaviourIds: string[];
}

export interface RoomResponse {
  room: RoomInfo;
  session: string | null;
  /** Every room's name: what the rename dialog checks a new name against. */
  names: string[];
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

/** The words of a turn: what the copy button takes, and what the plain view shows. */
export const partsText = (parts: Part[]): string =>
  parts
    .filter((part): part is Extract<Part, { kind: 'text' }> => part.kind === 'text')
    .map((part) => part.text)
    .join('\n\n');

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
  /** Questions the agent is blocked on right now. */
  asks?: Ask[];
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

/** Answer the question the agent is blocked on, or dismiss it. */
export const postAnswer = (
  room: string,
  askId: string,
  answer: AskAnswer,
): Promise<{ ok?: boolean; error?: string }> =>
  json('/api/chat/answer', jsonPost({ room, askId, answer }));

export const postDismiss = (
  room: string,
  askId: string,
): Promise<{ ok?: boolean; error?: string }> =>
  json('/api/chat/dismiss', jsonPost({ room, askId }));

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
  /** `updated_at` when it parses, else mtime — what "updated" sorting reads. */
  sortAt: number;
  hasArtifact: boolean;
  hasThumb: boolean;
  thumbStale: boolean;
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
  /** A newer modelroom, when there is one. It is a notice, never an install. */
  update: UpdateInfo;
}

/**
 * A newer modelroom exists — or, when `latest` is null, we do not know yet
 * (off, still asking, or the registry was out of reach). `command` is the one
 * that fits *this* project: its own package manager, its own script.
 */
export interface UpdateInfo {
  current: string;
  latest: string | null;
  available: boolean;
  /** When the answer was fetched; 0 when it never was. */
  checkedAt: number;
  /** The check is on. When it is off, nothing is asked and nothing is claimed. */
  enabled: boolean;
  command: string;
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

/* ── room operations — add, rename, remove ────────────────────────────────── */

export interface CreateRoomResult {
  room?: string;
  url?: string;
  error?: string;
  collide?: string;
}

export interface Rewrite {
  file: string;
  count: number;
  mentions: Array<{ line: number; text: string }>;
}

export interface RenameRoomResult {
  from?: string;
  to?: string;
  url?: string;
  rewrites?: Rewrite[];
  error?: string;
  collide?: string;
}

export interface RemoveRoomResult {
  room?: string;
  forced?: boolean;
  error?: string;
  referencing?: string[];
}

export const createRoom = (name: string, title?: string): Promise<CreateRoomResult> =>
  json('/api/rooms', jsonPost({ name, title }));

export const renameRoom = (from: string, to: string): Promise<RenameRoomResult> =>
  json('/api/rooms/rename', jsonPost({ from, to }));

export const removeRoom = (name: string, force = false): Promise<RemoveRoomResult> =>
  json('/api/rooms/remove', jsonPost({ name, force }));

export const getRoomRefs = (room: string): Promise<{ room?: string; referencing?: string[] }> =>
  json(`/api/rooms/refs?room=${encodeURIComponent(room)}`);
