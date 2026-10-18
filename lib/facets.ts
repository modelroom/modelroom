// modelroom — facets and search
//
// The dashboard's controls are not configured: they are derived from the records.
// A string becomes a radio group or a select (unique values, with counts); a list
// becomes checkboxes. Values are free — a facet shows what exists, it does not
// decide what is allowed.

import type { Frontmatter, FrontmatterValue } from './frontmatter.ts';

/** Keys that are shown on the card, not used as filters. */
export const NOT_FACETS = new Set([
  'id',
  'title',
  'summary',
  'key_points',
  'updated_at',
  'superseded_by',
  'deprecated',
]);

/** How many values before a control stops being useful. */
export const LIMITS = { radio: 8, select: 300, checkboxes: 50 } as const;

export type Control = 'radio' | 'select' | 'checkboxes' | null;

export interface FacetValue {
  value: string;
  count: number;
}

export interface Facet {
  key: string;
  kind: 'string' | 'array';
  control: Exclude<Control, null>;
  values: FacetValue[];
}

export function controlFor(isArray: boolean, cardinality: number): Control {
  if (isArray) return cardinality <= LIMITS.checkboxes ? 'checkboxes' : null;
  if (cardinality <= LIMITS.radio) return 'radio';
  if (cardinality <= LIMITS.select) return 'select';
  return null;
}

const cmp = (a: FacetValue, b: FacetValue) =>
  b.count - a.count || String(a.value).localeCompare(String(b.value), 'ja');

export interface FacetRoom {
  fields?: Frontmatter;
  deprecated?: boolean;
}

/** Build filter facets from the rooms' merged frontmatter. */
export function buildFacets(rooms: Array<FacetRoom | null | undefined>): Facet[] {
  const values = new Map<string, Map<string, number>>();
  const arrays = new Map<string, boolean>();

  for (const room of rooms) {
    if (!room || room.deprecated) continue;
    for (const [key, value] of Object.entries(room.fields ?? {})) {
      if (NOT_FACETS.has(key) || value === null || value === undefined) continue;
      const list = Array.isArray(value) ? value : [value];
      if (!list.length) continue;
      if (!values.has(key)) values.set(key, new Map());
      const counts = values.get(key) as Map<string, number>;
      for (const v of list) {
        if (v === null || v === undefined || typeof v === 'object') continue;
        const s = String(v);
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      if (Array.isArray(value)) arrays.set(key, true);
    }
  }

  const facets: Facet[] = [];
  for (const [key, counts] of values) {
    const entries = [...counts].map(([value, count]) => ({ value, count })).sort(cmp);
    const isArray = Boolean(arrays.get(key));
    const control = controlFor(isArray, entries.length);
    if (!control || entries.length < 2) continue;
    facets.push({ key, kind: isArray ? 'array' : 'string', control, values: entries });
  }

  // status first, then tags, then the narrowest facets.
  const rank = (key: string) => (key === 'status' ? 0 : key === 'tags' ? 1 : 2);
  facets.sort(
    (a, b) =>
      rank(a.key) - rank(b.key) || a.values.length - b.values.length || a.key.localeCompare(b.key),
  );
  return facets;
}

/** Stringify only primitives; objects and arrays have no text form. */
function primitive(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function normalize(value: unknown): string {
  return primitive(value).normalize('NFKC').toLowerCase();
}

export type Filters = Record<string, string[] | undefined>;

/** Keep a room when every chosen facet matches (OR within a facet). */
export function matchesFilters(
  room: { fields?: Frontmatter } | null | undefined,
  filters: Filters = {},
): boolean {
  for (const [key, wanted] of Object.entries(filters)) {
    if (!wanted || !wanted.length) continue;
    const raw = room?.fields?.[key];
    const have: string[] = (Array.isArray(raw) ? raw : [raw])
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v as FrontmatterValue));
    if (!have.some((v) => wanted.includes(v))) return false;
  }
  return true;
}

/** Markdown markers read as noise in a one-line excerpt. */
export function plainMarkdown(text: unknown): string {
  return primitive(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

const RADIUS = 60;

export interface Snippet {
  line: number;
  text: string;
}

/** A short excerpt around the first match, with its line number in the body. */
export function snippet(
  text: string | null | undefined,
  tokens: string[] | null | undefined,
  radius = RADIUS,
): Snippet | null {
  const src = String(text ?? '');
  if (!src.trim() || !tokens?.length) return null;
  const hay = src.toLowerCase();
  let at = -1;
  let len = 0;
  for (const token of tokens) {
    const i = hay.indexOf(String(token).toLowerCase());
    if (i !== -1 && (at === -1 || i < at)) {
      at = i;
      len = String(token).length;
    }
  }
  if (at === -1) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(src.length, at + len + radius);
  const line = src.slice(0, at).split('\n').length;
  const clean = plainMarkdown(src.slice(start, end)).replace(/\s+/g, ' ').trim();
  return {
    line,
    text: `${start > 0 ? '…' : ''}${clean}${end < src.length ? '…' : ''}`,
  };
}

export interface SearchRoom {
  name: string;
  title: string;
  summary: string | null;
  tags: string[];
  keyPoints: string[];
  bodyText: string;
}

export interface SearchHit {
  name: string;
  score: number;
  snippets: Snippet[];
}

function snippetsFor(room: SearchRoom, tokens: string[]): Snippet[] {
  for (const source of [room.bodyText, room.summary, room.title]) {
    const hit = snippet(source, tokens);
    if (hit) return [hit];
  }
  return [];
}

/**
 * Full-text search over title, summary, tags, key points and the docs' bodies.
 * Every token must appear somewhere (AND); scoring only decides the order.
 */
export function searchRooms(
  rooms: SearchRoom[] | null | undefined,
  query: string | null | undefined,
  { limit = 200 }: { limit?: number } = {},
): SearchHit[] {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const tokens = normalize(q).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  const hits: SearchHit[] = [];
  for (const room of rooms ?? []) {
    const title = normalize(room.title);
    const summary = normalize(room.summary);
    const tags = normalize((room.tags ?? []).join(' '));
    const points = normalize((room.keyPoints ?? []).join(' '));
    const body = normalize(room.bodyText);
    const all = [title, summary, tags, points, body].join('\n');
    if (!tokens.every((t) => all.includes(t))) continue;

    let score = 0;
    for (const t of tokens) {
      if (title.includes(t)) score += 5;
      if (summary.includes(t)) score += 3;
      if (tags.includes(t)) score += 3;
      if (points.includes(t)) score += 2;
      if (body.includes(t)) score += 1;
    }
    hits.push({ name: room.name, score, snippets: snippetsFor(room, tokens) });
  }

  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, limit);
}
