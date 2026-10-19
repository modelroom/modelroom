import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isRoomName,
  listRoomNames,
  mergeFrontmatter,
  parseStatus,
  roomInfo,
  publicRoom,
  docInfo,
  clearDocCache,
} from '../../core/rooms.ts';

const docs = ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md'];

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'mr-rooms-'));
  const room = join(dir, 'sign-in');
  await mkdir(room, { recursive: true });
  await writeFile(
    join(room, 'BRIEF.md'),
    `---
title: Sign in
status: draft
version: 2
summary: Signed in, or told why not.
tags: [auth]
deprecated: false
---
# Sign in

body one
`,
  );
  await writeFile(
    join(room, 'SPEC.md'),
    `---
tags: [form]
category: kiosk
---
spec body
`,
  );
  await writeFile(
    join(room, 'BEHAVIOUR.md'),
    `# behaviour

@sign-in-1 and @sign-in-2 and @sign-in-1
`,
  );
  await writeFile(join(room, 'index.html'), '<h1>hi</h1>');
  await mkdir(join(dir, '.hidden'));
  await writeFile(join(dir, 'stray.md'), 'x');
  clearDocCache();
  return { roomsDir: dir, docs, artifact: 'index.html', rooms: 'rooms' };
}

test('room names are valid directory names only', () => {
  assert.equal(isRoomName('sign-in'), true);
  assert.equal(isRoomName('a.b_c'), true);
  assert.equal(isRoomName('.hidden'), false);
  assert.equal(isRoomName('../escape'), false);
  assert.equal(isRoomName(''), false);
});

test('listRoomNames finds directories and ignores files and dotdirs', async () => {
  const cfg = await fixture();
  try {
    assert.deepEqual(await listRoomNames(cfg), ['sign-in']);
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('listRoomNames returns [] when the rooms dir is missing', async () => {
  assert.deepEqual(await listRoomNames({ roomsDir: '/nonexistent/modelroom/rooms' }), []);
});

test('mergeFrontmatter unions lists and keeps the first scalar', () => {
  const merged = mergeFrontmatter([
    { frontmatter: { title: 'A', tags: ['x'], status: 'draft' } },
    { frontmatter: { title: 'B', tags: ['y'], status: 'review' } },
  ]);
  assert.equal(merged.title, 'A');
  assert.equal(merged.status, 'draft');
  assert.deepEqual(merged.tags, ['x', 'y']);
});

test('parseStatus reads the legacy line and the frontmatter', () => {
  assert.equal(parseStatus('Status: draft\n'), 'draft');
  assert.equal(parseStatus('---\nstatus: review\n---\n'), 'review');
  assert.equal(parseStatus('nothing'), null);
  assert.equal(parseStatus(''), null);
});

test('roomInfo derives the record from the docs', async () => {
  const cfg = await fixture();
  try {
    const room = await roomInfo(cfg, 'sign-in');
    assert.equal(room.title, 'Sign in');
    assert.equal(room.status, 'draft');
    assert.equal(room.summary, 'Signed in, or told why not.');
    assert.deepEqual(room.tags, ['auth', 'form']);
    assert.equal(room.version, 2);
    assert.equal(room.deprecated, false);
    assert.equal(room.supersededBy, null);
    assert.deepEqual(room.behaviourIds, ['sign-in-1', 'sign-in-2']);
    assert.equal(room.hasArtifact, true);
    assert.equal(room.hasThumb, false);
    assert.equal(room.thumbUrl, null);
    assert.equal(room.fields.category, 'kiosk');
    assert.match(room.bodyText, /body one/);
    assert.match(room.bodyText, /spec body/);
    assert.ok(room.updatedAt > 0);
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('roomInfo tolerates a room with nothing in it', async () => {
  const cfg = await fixture();
  try {
    await mkdir(join(cfg.roomsDir, 'empty'));
    clearDocCache();
    const room = await roomInfo(cfg, 'empty');
    assert.equal(room.title, 'empty');
    assert.equal(room.status, null);
    assert.deepEqual(room.tags, []);
    assert.equal(room.hasArtifact, false);
    assert.equal(room.bodyText, '');
    assert.equal(room.updatedAt, 0);
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('the doc cache follows a change and publicRoom drops the body', async () => {
  const cfg = await fixture();
  try {
    const first = await roomInfo(cfg, 'sign-in');
    assert.equal(first.title, 'Sign in');

    await writeFile(
      join(cfg.roomsDir, 'sign-in', 'BRIEF.md'),
      `---\ntitle: Sign in again\n---\nbody`,
    );
    const when = new Date(Date.now() + 5000);
    await utimes(join(cfg.roomsDir, 'sign-in', 'BRIEF.md'), when, when);

    const second = await roomInfo(cfg, 'sign-in');
    assert.equal(second.title, 'Sign in again');

    const pub = publicRoom(second);
    assert.equal('bodyText' in pub, false);
    assert.equal(pub.title, 'Sign in again');
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('docInfo reports existence per configured doc', async () => {
  const cfg = await fixture();
  try {
    const info = await docInfo(cfg, 'sign-in');
    assert.equal(info['BRIEF.md'].exists, true);
    assert.equal(info['BEHAVIOUR.md'].exists, true);
    assert.equal(info['SPEC.md'].size > 0, true);
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});
