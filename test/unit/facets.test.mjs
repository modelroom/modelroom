import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildFacets,
  controlFor,
  matchesFilters,
  normalize,
  plainMarkdown,
  snippet,
  searchRooms,
} from '../../core/facets.ts';

const room = (name, fields, extra = {}) => ({
  name,
  fields,
  title: name,
  summary: null,
  tags: [],
  keyPoints: [],
  bodyText: '',
  ...extra,
});

test('a string becomes radio when short, select when long, and nothing when huge', () => {
  assert.equal(controlFor(false, 1), 'radio');
  assert.equal(controlFor(false, 8), 'radio');
  assert.equal(controlFor(false, 9), 'select');
  assert.equal(controlFor(false, 300), 'select');
  assert.equal(controlFor(false, 301), null);
  assert.equal(controlFor(true, 50), 'checkboxes');
  assert.equal(controlFor(true, 51), null);
});

test('facets are built from the values that exist, with counts', () => {
  const facets = buildFacets([
    room('a', { status: 'draft', tags: ['auth', 'form'] }),
    room('b', { status: 'draft', tags: ['auth'] }),
    room('c', { status: 'review', tags: ['form'] }),
  ]);
  const status = facets.find((f) => f.key === 'status');
  assert.equal(status.control, 'radio');
  assert.deepEqual(status.values, [
    { value: 'draft', count: 2 },
    { value: 'review', count: 1 },
  ]);

  const tags = facets.find((f) => f.key === 'tags');
  assert.equal(tags.control, 'checkboxes');
  assert.deepEqual(tags.values, [
    { value: 'auth', count: 2 },
    { value: 'form', count: 2 },
  ]);
});

test('status comes first, then tags, then the narrowest facet', () => {
  const facets = buildFacets([
    room('a', { tags: ['x'], platform: 'tablet', category: 'kiosk' }),
    room('b', { tags: ['y'], platform: 'pc', category: 'tablet' }),
  ]);
  assert.deepEqual(
    facets.map((f) => f.key),
    ['tags', 'category', 'platform'],
  );
});

test('reserved and card-only keys never become facets', () => {
  const facets = buildFacets([
    room('a', {
      title: 'A',
      summary: 's',
      key_points: ['k'],
      updated_at: '2026-01-01',
      tags: ['x'],
      status: 'draft',
    }),
    room('b', {
      title: 'B',
      summary: 't',
      key_points: ['j'],
      updated_at: '2026-01-02',
      tags: ['y'],
      status: 'review',
    }),
  ]);
  assert.deepEqual(facets.map((f) => f.key).sort(), ['status', 'tags']);
});

test('archived rooms and single-value facets are left out', () => {
  const facets = buildFacets([
    room('a', { status: 'draft', deprecated: true }),
    room('b', { status: 'draft' }),
  ]);
  assert.deepEqual(facets, []);
});

test('matchesFilters: OR within a facet, AND across facets', () => {
  const r = room('a', { status: 'draft', tags: ['auth', 'form'] });
  assert.equal(matchesFilters(r, {}), true);
  assert.equal(matchesFilters(r, { tags: ['form'] }), true);
  assert.equal(matchesFilters(r, { tags: ['form', 'other'] }), true);
  assert.equal(matchesFilters(r, { tags: ['other'] }), false);
  assert.equal(matchesFilters(r, { tags: ['form'], status: ['draft'] }), true);
  assert.equal(matchesFilters(r, { tags: ['form'], status: ['review'] }), false);
  assert.equal(matchesFilters(r, { missing: ['x'] }), false);
});

test('normalize folds width and case', () => {
  assert.equal(normalize('ＡＢＣ Draft'), 'abc draft');
});

test('snippet returns the line number and an excerpt', () => {
  const text = 'one\ntwo\nthe front door is boring\nfour';
  const s = snippet(text, ['front']);
  assert.equal(s.line, 3);
  assert.match(s.text, /front door/);
});

test('markdown markers are stripped from a snippet', () => {
  const s = snippet('## 打刻\n\n押した瞬間の **サーバー時刻** で記録する。', ['サーバー時刻']);
  assert.doesNotMatch(s.text, /\*\*|##/);
  assert.match(s.text, /サーバー時刻/);
});

test('plainMarkdown removes headings, links, code and emphasis', () => {
  assert.equal(plainMarkdown('## T'), 'T');
  assert.equal(plainMarkdown('[label](https://example.com)'), 'label');
  assert.equal(plainMarkdown('![alt](x.png)'), '');
  assert.equal(plainMarkdown('- item'), 'item');
  assert.equal(plainMarkdown('> quote'), 'quote');
  assert.equal(plainMarkdown('**bold** and `code`'), 'bold and code');
  assert.equal(plainMarkdown('```\ncode\n```'), ' ');
});

test('snippet has no match for an absent token, and skips empty text', () => {
  assert.equal(snippet('hello', ['absent']), null);
  assert.equal(snippet('', ['x']), null);
  assert.equal(snippet('hello', []), null);
});

test('search requires every token (AND) and prefers the title', () => {
  const rooms = [
    room('a', {}, { title: 'Sign in', bodyText: 'a boring front door' }),
    room('b', {}, { title: 'Checkout', bodyText: 'sign in to pay' }),
    room('c', {}, { title: 'Elsewhere', bodyText: 'nothing here' }),
  ];
  const hits = searchRooms(rooms, 'sign in');
  assert.deepEqual(
    hits.map((h) => h.name),
    ['a', 'b'],
  );
  assert.ok(hits[0].score > hits[1].score);

  assert.deepEqual(searchRooms(rooms, 'sign nowhere'), []);
  assert.deepEqual(searchRooms(rooms, '   '), []);
});

test('search matches Japanese and falls back to the summary for a snippet', () => {
  const rooms = [
    room('a', {}, { title: '打刻', summary: '押した瞬間のサーバー時刻で記録する', bodyText: '' }),
    room('b', {}, { title: '別', summary: '関係ない', bodyText: '' }),
  ];
  const hits = searchRooms(rooms, 'サーバー時刻');
  assert.equal(hits.length, 1);
  assert.match(hits[0].snippets[0].text, /サーバー時刻/);
});

test('search matches tags and key points', () => {
  const rooms = [room('a', {}, { title: 'A', tags: ['auth'], keyPoints: ['cannot be undone'] })];
  assert.equal(searchRooms(rooms, 'auth').length, 1);
  assert.equal(searchRooms(rooms, 'undone').length, 1);
});
