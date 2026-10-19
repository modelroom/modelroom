// modelroom — the check
//
// The check verifies the convention, not the content. It never decides whether a
// room is good; it decides whether the record can be read. Errors are things an
// agent can fix without asking; warnings are things a human should look at.
//
// Nothing here writes. Deleting and merging stay a human decision.

import { join } from 'node:path';
import {
  readFrontmatterFile,
  type Frontmatter,
  type FrontmatterValue,
} from '../core/frontmatter.ts';
import { listRoomNames } from '../core/rooms.ts';
import { normalize } from '../core/facets.ts';
import { t, type MessageKey } from '../i18n/catalog.ts';
import type { Lang } from '../i18n/lang.ts';

/** Reserved keys and the shapes they must keep. Everything else is free. */
const RESERVED_TYPES: Record<string, string[]> = {
  id: ['string'],
  title: ['string'],
  summary: ['string'],
  status: ['string'],
  key_points: ['array'],
  tags: ['array'],
  version: ['number', 'string'],
  updated_at: ['string', 'number'],
  deprecated: ['boolean'],
  superseded_by: ['string'],
};

/** Keys that mean the same thing. Two of them in one file is a drift signal. */
const SYNONYMS: Record<string, string[]> = {
  summary: ['description', 'abstract', '概要', '要約'],
  tags: ['labels', 'label', 'ラベル', 'タグ'],
  status: ['state', '状態'],
  version: ['revision', '版'],
};

export type IssueLevel = 'error' | 'warn';

export interface LintIssue {
  level: IssueLevel;
  room: string;
  file: string | null;
  code: string;
  params?: Record<string, string | number>;
  message: string;
}

export interface LintStats {
  rooms: number;
  errors: number;
  warnings: number;
}

export interface LintConfig {
  roomsDir: string;
  docs: string[];
  lang?: Lang;
}

const typeOf = (v: FrontmatterValue): string => {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
};

interface VariantEntry {
  room: string;
  file: string;
  key: string;
  value: FrontmatterValue;
}

/** A variant is the same value written two ways (`draft` / `Draft` / `下書き`). */
function variantGroups(entries: VariantEntry[]): VariantEntry[][] {
  const groups = new Map<string, VariantEntry[]>();
  for (const { room, file, key, value } of entries) {
    const n = normalize(value);
    if (!n) continue;
    if (!groups.has(n)) groups.set(n, []);
    const g = groups.get(n) as VariantEntry[];
    if (!g.some((x) => x.value === String(value))) g.push({ room, file, key, value });
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/**
 * Check every room. Returns `{ issues, stats }`.
 * `issues[].level` is 'error' (fixable by an agent) or 'warn' (needs a human).
 */
export async function lintRooms(
  cfg: LintConfig,
): Promise<{ issues: LintIssue[]; stats: LintStats }> {
  const lang = cfg.lang ?? 'en';
  const names = await listRoomNames(cfg);
  const issues: LintIssue[] = [];
  const variants: VariantEntry[] = [];
  const seen = new Set(names);
  const add = (
    level: IssueLevel,
    room: string,
    file: string | null,
    code: string,
    params?: Record<string, string | number>,
  ) => {
    const message = t(lang, code as MessageKey, params);
    issues.push({ level, room, file: file || null, code, params, message });
  };

  for (const room of names) {
    for (const file of cfg.docs) {
      let doc;
      try {
        doc = await readFrontmatterFile(join(cfg.roomsDir, room, file));
      } catch {
        continue; // a missing doc is reported by `doctor`, not here
      }
      for (const issue of doc.issues) {
        add('error', room, file, issue.code, issue.params);
      }

      const data: Frontmatter = doc.data || {};
      for (const [key, value] of Object.entries(data)) {
        const allowed = RESERVED_TYPES[key];
        if (allowed) {
          const kind = typeOf(value);
          if (value !== null && !allowed.includes(kind)) {
            add('error', room, file, 'reserved-type', {
              key,
              allowed: allowed.join(` ${t(lang, 'lint.or')} `),
              got: kind,
            });
          }
          if (
            key === 'tags' &&
            Array.isArray(value) &&
            value.some((v) => typeof v === 'object' || Array.isArray(v))
          ) {
            add('error', room, file, 'tags-shape');
          }
        }

        for (const [canonical, aliases] of Object.entries(SYNONYMS)) {
          if (aliases.includes(key) && data[canonical] !== undefined) {
            add('warn', room, file, 'synonym', { key, canonical });
          }
        }

        if (
          ['status', 'category', 'type'].includes(key) &&
          !Array.isArray(value) &&
          typeof value !== 'object'
        ) {
          variants.push({ room, file, key, value });
        }
      }

      if (!doc.hasFrontmatter && file === cfg.docs[0]) {
        add('warn', room, file, 'no-frontmatter');
      }

      if (file === cfg.docs[0] && data.title) {
        const h1 = /^#\s+(.+)$/m.exec(doc.body || '');
        if (h1 && normalize((h1[1] as string).trim()) !== normalize(data.title)) {
          add('warn', room, file, 'h1-title', {
            h1: (h1[1] as string).trim(),
            title: String(data.title),
          });
        }
      }
    }
  }

  for (const group of variantGroups(variants)) {
    const values = group.map((x) => x.value).join(' / ');
    for (const item of group) {
      add('warn', item.room, item.file, 'variant', { key: item.key, values });
    }
  }

  for (const room of names) {
    for (const file of cfg.docs) {
      let doc;
      try {
        doc = await readFrontmatterFile(join(cfg.roomsDir, room, file));
      } catch {
        continue;
      }
      const target = doc.data?.superseded_by;
      if (typeof target === 'string' && target && !seen.has(target)) {
        add('warn', room, file, 'superseded-missing', { target });
      }
    }
  }

  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warn').length;
  return { issues, stats: { rooms: names.length, errors, warnings } };
}
