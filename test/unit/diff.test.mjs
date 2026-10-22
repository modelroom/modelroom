// modelroom — the line diff behind the doc view.
//
// It is pure and it decides what the reader is shown, so it is tested on its own:
// an unchanged doc has no hunks, a small edit keeps its context, and the line
// numbers a hunk reports are the ones the gutter prints.

import { test, expect } from 'vitest';
import { diffLines, diffStat } from '../../client/lib/diff.ts';

const kinds = (before, after) =>
  diffLines(before, after).flatMap((hunk) => hunk.lines.map((line) => line.kind));

test('an unchanged doc has no hunks', () => {
  expect(diffLines('a\nb\nc\n', 'a\nb\nc\n')).toEqual([]);
});

test('a changed line is a delete and an add, with its neighbours as context', () => {
  const hunks = diffLines('a\nb\nc\nd\ne\n', 'a\nb\nX\nd\ne\n');
  expect(hunks).toHaveLength(1);
  expect(hunks[0]?.lines.map((line) => `${line.kind}:${line.text}`)).toEqual([
    'same:a',
    'same:b',
    'del:c',
    'add:X',
    'same:d',
    'same:e',
  ]);
  expect(hunks[0]?.beforeStart).toBe(1);
  expect(hunks[0]?.afterStart).toBe(1);
});

test('an insertion at the top starts where the line would go', () => {
  const hunks = diffLines('a\nb\n', 'x\na\nb\n');
  expect(hunks[0]?.lines).toEqual([
    { kind: 'add', text: 'x' },
    { kind: 'same', text: 'a' },
    { kind: 'same', text: 'b' },
  ]);
  expect(hunks[0]?.beforeStart).toBe(1);
  expect(hunks[0]?.afterStart).toBe(1);
});

test('two changes far apart fold into two hunks', () => {
  const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
  const after = before.replace('line 2', 'line two').replace('line 37', 'line thirty-seven');
  const hunks = diffLines(before, after);
  expect(hunks).toHaveLength(2);
  // The first hunk starts a little above line 2 (1-based), the second above 38.
  expect(hunks[0]?.beforeStart).toBe(1);
  expect(hunks[1]?.beforeStart).toBe(35);
});

test('a trailing newline is not a line of its own', () => {
  expect(diffLines('a\n', 'a\n')).toEqual([]);
  expect(diffLines('a', 'a\n')).toEqual([]);
});

test('an empty doc becoming one line is an add', () => {
  expect(kinds('', 'hello\n')).toEqual(['add']);
});

test('the stat counts what the diff shows', () => {
  const hunks = diffLines('a\nb\n', 'a\nX\nb\nY\n');
  expect(diffStat(hunks)).toEqual({ added: 2, removed: 0 });
  expect(diffStat([])).toEqual({ added: 0, removed: 0 });
});
