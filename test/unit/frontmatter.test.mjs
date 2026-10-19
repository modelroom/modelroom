import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseFrontmatter,
  parseYamlLite,
  parseScalar,
  splitFrontmatter,
  readFrontmatterFile,
} from '../../core/frontmatter.ts';

test('no frontmatter: the whole file is the body', () => {
  const doc = parseFrontmatter('# Title\n\nBody');
  assert.equal(doc.hasFrontmatter, false);
  assert.equal(doc.body, '# Title\n\nBody');
  assert.deepEqual(doc.issues, []);
});

test('scalars, booleans, numbers and null', () => {
  const { data } = parseFrontmatter(
    `---\ntitle: Sign in\nversion: 3\nflag: true\nempty: null\nratio: 1.5\n---\nbody`,
  );
  assert.deepEqual(data, { title: 'Sign in', version: 3, flag: true, empty: null, ratio: 1.5 });
});

test('inline lists and block lists', () => {
  const { data } = parseFrontmatter(`---
tags: [auth, "two words", 'single']
points:
  - one
  - two
---`);
  assert.deepEqual(data.tags, ['auth', 'two words', 'single']);
  assert.deepEqual(data.points, ['one', 'two']);
});

test('a key with nothing after it is null, not an empty list', () => {
  const { data } = parseYamlLite('next:\ntitle: x');
  assert.equal(data.next, null);
  assert.equal(data.title, 'x');
});

test('quoted values keep their colon and hash', () => {
  const { data } = parseFrontmatter(`---\nsummary: "a: b # not a comment"\n---`);
  assert.equal(data.summary, 'a: b # not a comment');
});

test('comments are dropped outside quotes', () => {
  const { data } = parseFrontmatter(`---
title: Sign in # the screen
summary: "keep # this"
---`);
  assert.equal(data.title, 'Sign in');
  assert.equal(data.summary, 'keep # this');
});

test('duplicate keys are reported', () => {
  const { issues } = parseFrontmatter(`---\ntitle: a\ntitle: b\n---`);
  assert.equal(issues[0].code, 'duplicate-key');
  assert.equal(issues[0].key, 'title');
});

test('nested values are reported, not accepted', () => {
  const { data, issues } = parseFrontmatter(`---
title: x
meta:
  a: 1
---`);
  assert.deepEqual(data.meta, []);
  assert.equal(issues[0].code, 'nested');
  assert.equal(issues[0].key, 'meta');
});

test('unterminated frontmatter is an error', () => {
  const doc = parseFrontmatter(`---\ntitle: x\nno closing`);
  assert.equal(doc.issues[0].code, 'unterminated');
  assert.equal(doc.body, `---\ntitle: x\nno closing`);
});

test('CRLF and a BOM are tolerated', () => {
  const { data } = parseFrontmatter('\uFEFF---\r\ntitle: x\r\n---\r\nbody');
  assert.equal(data.title, 'x');
});

test('a syntax line is reported', () => {
  const { issues } = parseYamlLite('this is not yaml');
  assert.equal(issues[0].code, 'syntax');
});

test('parseScalar handles the shapes the convention allows', () => {
  assert.deepEqual(parseScalar('[]'), []);
  assert.deepEqual(parseScalar('[a, 2, true]'), ['a', 2, true]);
  assert.equal(parseScalar('"q"'), 'q');
  assert.equal(parseScalar("'it''s'"), "it's");
  assert.equal(parseScalar('~'), null);
  assert.equal(parseScalar('-2'), -2);
});

test('splitFrontmatter keeps the body intact', () => {
  const { raw, body } = splitFrontmatter('---\na: 1\n---\n# H\n\ntext');
  assert.equal(raw, 'a: 1');
  assert.equal(body, '# H\n\ntext');
});

test('readFrontmatterFile reads only the head when the frontmatter fits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-fm-'));
  try {
    const path = join(dir, 'BRIEF.md');
    await writeFile(path, `---\ntitle: Small\n---\n${'body\n'.repeat(4000)}`);
    const doc = await readFrontmatterFile(path);
    assert.equal(doc.data.title, 'Small');
    assert.equal(doc.source, 'head');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readFrontmatterFile falls back to the whole file when the head is not enough', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-fm-'));
  try {
    const path = join(dir, 'BRIEF.md');
    const long = 'x'.repeat(9000);
    await writeFile(path, `---\ntitle: Big\nsummary: ${long}\n---\nbody`);
    const doc = await readFrontmatterFile(path);
    assert.equal(doc.data.title, 'Big');
    assert.equal(doc.data.summary, long);
    assert.equal(doc.source, 'full');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readFrontmatterFile tolerates a missing file', async () => {
  await assert.rejects(() => readFrontmatterFile('/nonexistent/modelroom/BRIEF.md'));
});
