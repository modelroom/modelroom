// Small formatting helpers shared by the panels.

export const fmtNum = (n: number | null | undefined): string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
};

export const clock = (ms?: number | null, lang = 'en'): string =>
  new Date(ms ?? Date.now()).toLocaleTimeString(lang, {
    hour: '2-digit',
    minute: '2-digit',
  });

export const stamp = (ms?: number | null, lang = 'en'): string =>
  new Date(ms ?? Date.now()).toLocaleString(lang, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** `SPEC.md` → `SPEC`. The extension carries no meaning in a tab. */
export const docLabel = (name: string): string => name.replace(/\.md$/i, '');

export interface FrontmatterRow {
  key: string;
  value: string;
}

/**
 * Just enough YAML for the `---` head of a room doc: `key: value` lines and
 * inline lists. Anything it cannot read is left in the body, so nothing is lost.
 */
export function splitFrontmatter(text: string): { rows: FrontmatterRow[]; body: string } {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { rows: [], body: text };
  const rows: FrontmatterRow[] = [];
  for (const line of (match[1] as string).split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1] as string;
    let value = (m[2] as string).trim().replace(/^["']|["']$/g, '');
    value = value.replace(/^\[(.*)\]$/, (_all, inner: string) =>
      inner
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(', '),
    );
    rows.push({ key, value });
  }
  return { rows, body: text.slice(match[0].length) };
}
