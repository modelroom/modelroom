// modelroom — frontmatter
//
// Frontmatter is the record: a small, flat YAML map at the top of a room doc.
// The body stays the content. We read only the head of the file (8 KiB) because
// frontmatter lives there, and fall back to the whole file only when a closing
// delimiter is missing.
//
// The parser is deliberately a subset of YAML: one level, scalars and string
// lists. Nested maps are reported, not silently accepted — facets are built from
// this map, so a nested value has nowhere to go.

import { open, readFile } from 'node:fs/promises';

export const HEAD_BYTES = 8192;
const OPEN = /^---[ \t]*\r?\n/;
const CLOSE = /^(---|\.\.\.)[ \t]*$/m;

export type FrontmatterValue = string | number | boolean | null | FrontmatterValue[];
export type Frontmatter = Record<string, FrontmatterValue>;

export interface FrontmatterIssue {
  code: string;
  key?: string | null;
  message: string;
}

export interface ParsedDocument {
  hasFrontmatter: boolean;
  data: Frontmatter;
  body: string;
  issues: FrontmatterIssue[];
}

export interface SplitResult {
  raw: string | null;
  body: string;
  error: string | null;
}

/** Split `text` into raw frontmatter and body. */
export function splitFrontmatter(text: string | null | undefined): SplitResult {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  if (!OPEN.test(src)) return { raw: null, body: src, error: null };
  const start = src.indexOf('\n') + 1;
  const rest = src.slice(start);
  const m = CLOSE.exec(rest);
  if (!m) return { raw: null, body: src, error: 'unterminated frontmatter' };
  return {
    raw: rest.slice(0, m.index).replace(/\r?\n$/, ''),
    body: rest.slice(m.index + m[0].length).replace(/^\r?\n/, ''),
    error: null,
  };
}

/** Cut a trailing `# comment` that is outside quotes and preceded by space. */
function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quote) {
      if (ch === quote && line[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1] as string))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function splitInline(src: string): string[] {
  const out: string[] = [];
  let quote: string | null = null;
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (quote) {
      buf += ch;
      if (ch === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ',') {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  return s.slice(1, -1).replace(/''/g, "'");
}

/** One scalar: quoted string, inline list, boolean, null, number, or string. */
export function parseScalar(raw: string | null | undefined): FrontmatterValue {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (s === '[]') return [];
  if (s.startsWith('[') && s.endsWith(']')) {
    return splitInline(s.slice(1, -1)).map(parseScalar);
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return unquote(s);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/** Parse the flat YAML subset. Returns `{ data, issues }`. */
export function parseYamlLite(raw: string | null | undefined): {
  data: Frontmatter;
  issues: FrontmatterIssue[];
} {
  const data: Frontmatter = {};
  const issues: FrontmatterIssue[] = [];
  const lines = String(raw ?? '').split(/\r?\n/);
  let pending: string | null = null; // `key:` with no value yet — may become a list
  let skipIndent = 0; // > 0 while skipping a nested block

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    if (/^\s*#/.test(rawLine)) continue;

    const indent = (rawLine.match(/^\s*/) ?? [''])[0]?.length ?? 0;
    if (skipIndent && indent >= skipIndent) continue;
    if (skipIndent && indent < skipIndent) skipIndent = 0;

    if (indent > 0) {
      if (pending && /^-\s+/.test(rawLine.trim())) {
        const list = data[pending];
        if (Array.isArray(list)) list.push(parseScalar(rawLine.trim().replace(/^-\s+/, '')));
        continue;
      }
      issues.push({
        code: 'nested',
        key: pending,
        message: 'nested values are not supported — keep frontmatter flat',
      });
      skipIndent = indent;
      pending = null;
      continue;
    }

    if (pending) {
      data[pending] = null;
      pending = null;
    }

    const line = stripComment(rawLine.trim());
    if (!line) continue;
    const m = /^([^:]+):(.*)$/.exec(line);
    if (!m) {
      issues.push({ code: 'syntax', message: `not a key: value line — ${line}` });
      continue;
    }
    const key = (m[1] as string).trim();
    const value = (m[2] as string).trim();

    if (Object.prototype.hasOwnProperty.call(data, key) || pending === key) {
      issues.push({ code: 'duplicate-key', key, message: `duplicate key: ${key}` });
    }

    if (value === '') {
      pending = key;
      data[key] = [];
      continue;
    }
    data[key] = parseScalar(value);
  }

  if (pending) {
    // A key with no items and no following key is an empty value, not an empty list.
    const value = data[pending];
    if (Array.isArray(value) && value.length === 0) data[pending] = null;
  }
  return { data, issues };
}

/** Parse a whole document: frontmatter + body. */
export function parseFrontmatter(text: string | null | undefined): ParsedDocument {
  const src = String(text ?? '');
  const { raw, body, error } = splitFrontmatter(src);
  if (error) {
    return {
      hasFrontmatter: true,
      data: {},
      body: src,
      issues: [{ code: 'unterminated', message: error }],
    };
  }
  if (raw === null) return { hasFrontmatter: false, data: {}, body, issues: [] };
  const { data, issues } = parseYamlLite(raw);
  return { hasFrontmatter: true, data, body, issues };
}

function needsWholeFile(text: string): boolean {
  return OPEN.test(text) && !CLOSE.test(text.slice(text.indexOf('\n') + 1));
}

export interface FrontmatterRead extends ParsedDocument {
  source: 'head' | 'full';
}

/**
 * Read a doc's frontmatter without reading the whole file.
 * `source` is 'head' when the frontmatter fit in the first `head` bytes.
 */
export async function readFrontmatterFile(
  path: string,
  { head = HEAD_BYTES }: { head?: number } = {},
): Promise<FrontmatterRead> {
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  try {
    fh = await open(path, 'r');
    const buf = Buffer.alloc(head + 4);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const slice = buf.subarray(0, bytesRead).toString('utf8');
    if (needsWholeFile(slice)) {
      return { ...parseFrontmatter(await readFile(path, 'utf8')), source: 'full' };
    }
    return { ...parseFrontmatter(slice), source: 'head' };
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}
