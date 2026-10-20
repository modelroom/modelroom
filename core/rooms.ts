// modelroom — rooms
//
// A room is one screen: `rooms/<name>/` with an artifact and a small set of
// single-purpose docs. Nothing here decides anything about the application layer.
//
// The frontmatter of the docs is the record. The dashboard's list, facets and
// search are derived from it on every request; nothing is stored separately, so
// there is no second place to keep in sync.

import { open, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseFrontmatter,
  type Frontmatter,
  type FrontmatterIssue,
  type FrontmatterValue,
} from './frontmatter.ts';

const isRoomName = (s: unknown): s is string =>
  typeof s === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(s) && !s.startsWith('.');

export { isRoomName };

/** The png that belongs to an artifact: `index.html` → `index.png`. */
export const snapshotName = (artifact: string): string => artifact.replace(/\.html?$/i, '.png');

export interface FileInfo {
  name: string;
  exists: boolean;
  size: number;
  mtime: number;
}

export interface RoomDoc {
  name: string;
  text: string;
  body: string;
  frontmatter: Frontmatter;
  issues: FrontmatterIssue[];
  hasFrontmatter: boolean;
  mtime: number;
  size: number;
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
  supersededBy: string | null;
  fields: Frontmatter;
  files: FileInfo[];
  updatedAt: number;
  /** The oldest file's mtime: when the room was first written. */
  createdAt: number;
  hasArtifact: boolean;
  hasThumb: boolean;
  /** The artifact changed after its snapshot: the committed png is out of date. */
  thumbStale: boolean;
  artifactUrl: string;
  thumbUrl: string | null;
  behaviourIds: string[];
  bodyText: string;
}

export interface RoomsConfig {
  roomsDir: string;
  docs: string[];
  artifact: string;
  rooms: string;
}

// Parsed docs, keyed by path and invalidated by mtime+size. A change to one file
// never re-reads the others.
const docCache = new Map<string, { key: string; value: RoomDoc }>();
export function clearDocCache(): void {
  docCache.clear();
}

async function readDoc(path: string): Promise<RoomDoc | null> {
  // One handle for stat + read: the cache key and the text always describe the
  // same file, even if the file is replaced while we read it.
  let fh;
  try {
    fh = await open(path, 'r');
  } catch {
    return null;
  }
  try {
    const s = await fh.stat();
    const key = `${s.mtimeMs}:${s.size}`;
    const hit = docCache.get(path);
    if (hit && hit.key === key) return hit.value;
    const text = await fh.readFile('utf8');
    const parsed = parseFrontmatter(text);
    const value: RoomDoc = {
      name: '',
      text,
      body: parsed.body,
      frontmatter: parsed.data,
      issues: parsed.issues,
      hasFrontmatter: parsed.hasFrontmatter,
      mtime: s.mtimeMs,
      size: s.size,
    };
    docCache.set(path, { key, value });
    return value;
  } finally {
    await fh.close();
  }
}

export async function listRoomNames(cfg: { roomsDir: string }): Promise<string[]> {
  try {
    const entries = await readdir(cfg.roomsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && isRoomName(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function fileInfo(path: string, name: string): Promise<FileInfo> {
  try {
    const s = await stat(path);
    return { name, exists: true, size: s.size, mtime: s.mtimeMs };
  } catch {
    return { name, exists: false, size: 0, mtime: 0 };
  }
}

/** Optional `Status:` line, or frontmatter `status:`, read from the brief. */
export function parseStatus(text: string | null | undefined): string | null {
  if (!text) return null;
  const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (fm) {
    const m = /^status\s*:\s*(.+)$/im.exec(fm[1] as string);
    if (m) return (m[1] as string).trim().replace(/^["']|["']$/g, '');
  }
  const m = /^\s*status\s*:\s*(.+)$/im.exec(text);
  return m ? (m[1] as string).trim() : null;
}

function parseTitle(text: string | null, fallback: string): string {
  const m = text ? /^#\s+(.+)$/m.exec(text) : null;
  return m ? (m[1] as string).trim() : fallback;
}

const asStrings = (value: FrontmatterValue | undefined): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null && typeof v !== 'object').map(String);
  }
  if (value === null || value === undefined || typeof value === 'object') return [];
  return [String(value)];
};

/**
 * Merge the docs' frontmatter. Lists are unioned (tags across docs), scalars keep
 * the first value — BRIEF wins, then SPEC, then BEHAVIOUR.
 */
export function mergeFrontmatter(
  docs: Array<{ frontmatter?: Frontmatter } | null | undefined>,
): Frontmatter {
  const out: Frontmatter = {};
  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc?.frontmatter ?? {})) {
      if (Array.isArray(value)) {
        const prev = asStrings(out[key]);
        out[key] = [...new Set([...prev, ...asStrings(value)])];
      } else if (out[key] === undefined) {
        out[key] = value;
      }
    }
  }
  return out;
}

export async function roomInfo(cfg: RoomsConfig, name: string): Promise<RoomInfo> {
  const dir = join(cfg.roomsDir, name);
  const files: FileInfo[] = [];
  for (const d of cfg.docs) files.push(await fileInfo(join(dir, d), d));
  files.push(await fileInfo(join(dir, cfg.artifact), cfg.artifact));
  const png = snapshotName(cfg.artifact);
  files.push(await fileInfo(join(dir, png), png));

  const docs: RoomDoc[] = [];
  for (const d of cfg.docs) {
    const doc = await readDoc(join(dir, d));
    if (doc) docs.push({ ...doc, name: d });
  }

  const brief = docs.find((d) => d.name === cfg.docs[0])?.text ?? null;
  const behaviour = docs.find((d) => d.name === 'BEHAVIOUR.md')?.text ?? null;
  const ids = behaviour
    ? [...behaviour.matchAll(/@([a-z][a-z0-9-]*-\d+)/gi)].map((m) => m[1] as string)
    : [];

  const fields = mergeFrontmatter(docs);
  const title =
    typeof fields.title === 'string' && fields.title ? fields.title : parseTitle(brief, name);
  const artifact = files.find((f) => f.name === cfg.artifact);
  const thumb = files.find((f) => f.name === png);
  const hasThumb = Boolean(thumb?.exists);
  const hasArtifact = Boolean(artifact?.exists);
  const born = files.filter((f) => f.exists && f.mtime > 0).map((f) => f.mtime);

  return {
    name,
    title,
    status: typeof fields.status === 'string' ? fields.status : parseStatus(brief),
    summary: typeof fields.summary === 'string' ? fields.summary : null,
    tags: asStrings(fields.tags),
    keyPoints: asStrings(fields.key_points),
    version:
      typeof fields.version === 'string' || typeof fields.version === 'number'
        ? fields.version
        : null,
    deprecated: fields.deprecated === true,
    supersededBy: typeof fields.superseded_by === 'string' ? fields.superseded_by : null,
    fields,
    files,
    updatedAt: Math.max(0, ...files.map((f) => f.mtime)),
    createdAt: born.length ? Math.min(...born) : 0,
    hasArtifact,
    hasThumb,
    // The artifact is the source of the snapshot: when it moved, the png is old.
    thumbStale: hasArtifact && (!hasThumb || (artifact?.mtime ?? 0) > (thumb?.mtime ?? 0)),
    artifactUrl: `/files/${cfg.rooms}/${name}/${cfg.artifact}`,
    thumbUrl: thumb?.exists ? `/files/${cfg.rooms}/${name}/${png}` : null,
    behaviourIds: [...new Set(ids)],
    bodyText: docs.map((d) => d.body).join('\n\n'),
  };
}

/** The room as the browser sees it: no body, no internal cache fields. */
export function publicRoom(room: RoomInfo): Omit<RoomInfo, 'bodyText'> {
  const { bodyText: _bodyText, ...rest } = room;
  return rest;
}

export async function docInfo(
  cfg: Pick<RoomsConfig, 'roomsDir' | 'docs'>,
  name: string,
): Promise<Record<string, FileInfo>> {
  const dir = join(cfg.roomsDir, name);
  const out: Record<string, FileInfo> = {};
  for (const d of cfg.docs) out[d] = await fileInfo(join(dir, d), d);
  return out;
}
