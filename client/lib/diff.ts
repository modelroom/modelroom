// A line diff, for the doc view: what the agent changed since you last looked.
//
// Pure and dependency-free. It returns hunks of same/add/del lines, folded with
// a few lines of context so a small edit in a long doc stays readable, and it is
// the one piece of the diff worth testing on its own.

export type DiffLineKind = 'same' | 'add' | 'del';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

export interface DiffHunk {
  /** 1-based line in the before text where the hunk begins. */
  beforeStart: number;
  /** 1-based line in the after text where the hunk begins. */
  afterStart: number;
  lines: DiffLine[];
}

/** Unchanged lines kept on each side of a change. */
const CONTEXT = 3;

/**
 * Above this many cells the alignment table is not worth its memory: a doc that
 * large reads as one replacement, which is honest and never freezes the tab.
 */
const MAX_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return trimmed === '' ? [] : trimmed.split('\n');
}

/** The edit script, as a flat list of same/add/del lines. */
function align(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ kind: 'del', text })),
      ...b.map((text): DiffLine => ({ kind: 'add', text })),
    ];
  }

  // Longest common subsequence lengths, filled from the end so the walk below
  // can read forward. Two rows would fit memory, but backtracking wants the
  // whole table, and the cap above keeps it small.
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + (j + 1)] as number) + 1
          : Math.max(table[(i + 1) * width + j] as number, table[i * width + (j + 1)] as number);
    }
  }

  const ops: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'same', text: a[i] as string });
      i++;
      j++;
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + (j + 1)] as number)) {
      ops.push({ kind: 'del', text: a[i] as string });
      i++;
    } else {
      ops.push({ kind: 'add', text: b[j] as string });
      j++;
    }
  }
  while (i < n) ops.push({ kind: 'del', text: a[i++] as string });
  while (j < m) ops.push({ kind: 'add', text: b[j++] as string });
  return ops;
}

/**
 * The hunks that turn `before` into `after`. An empty list means they are the
 * same; callers use that as "nothing to show" rather than rendering a diff.
 */
export function diffLines(before: string, after: string): DiffHunk[] {
  if (before === after) return [];
  const ops = align(splitLines(before), splitLines(after));
  if (!ops.some((op) => op.kind !== 'same')) return [];

  // Which ops to keep: the changes, plus a little context around each.
  const keep = Array.from({ length: ops.length }, () => false);
  ops.forEach((op, index) => {
    if (op.kind === 'same') return;
    for (let k = index - CONTEXT; k <= index + CONTEXT; k++) {
      if (k >= 0 && k < ops.length) keep[k] = true;
    }
  });

  const hunks: DiffHunk[] = [];
  let beforeNo = 1;
  let afterNo = 1;
  let index = 0;
  while (index < ops.length) {
    const op = ops[index] as DiffLine;
    if (!keep[index]) {
      if (op.kind !== 'add') beforeNo++;
      if (op.kind !== 'del') afterNo++;
      index++;
      continue;
    }
    const hunk: DiffHunk = { beforeStart: beforeNo, afterStart: afterNo, lines: [] };
    while (index < ops.length && keep[index]) {
      const line = ops[index] as DiffLine;
      hunk.lines.push(line);
      if (line.kind !== 'add') beforeNo++;
      if (line.kind !== 'del') afterNo++;
      index++;
    }
    hunks.push(hunk);
  }
  return hunks;
}

/** Added and removed line counts, for a summary line. */
export function diffStat(hunks: DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'add') added++;
      else if (line.kind === 'del') removed++;
    }
  }
  return { added, removed };
}
