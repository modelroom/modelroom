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
  deviceStamp,
  clearDocCache,
} from '../../core/rooms.ts';
import { normalizeDevices } from '../../core/device.ts';

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

test('thumbStale follows the artifact against its snapshot', async () => {
  const cfg = await fixture();
  const dir = join(cfg.roomsDir, 'sign-in');
  try {
    // No snapshot yet: there is something to render.
    let room = await roomInfo(cfg, 'sign-in');
    assert.equal(room.hasThumb, false);
    assert.equal(room.thumbStale, true);

    const png = join(dir, 'index.png');
    const old = new Date(Date.now() - 60_000);
    const now = new Date();
    await writeFile(png, 'png');
    await utimes(join(dir, 'index.html'), old, old);
    await utimes(png, now, now);

    // Snapshot newer than the artifact: current.
    room = await roomInfo(cfg, 'sign-in');
    assert.equal(room.hasThumb, true);
    assert.equal(room.thumbStale, false);

    // Artifact newer than the snapshot: out of date.
    await utimes(join(dir, 'index.html'), now, now);
    await utimes(png, old, old);
    room = await roomInfo(cfg, 'sign-in');
    assert.equal(room.thumbStale, true);
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('a room names its own device, else the project default', async () => {
  const cfg = await fixture();
  const devices = normalizeDevices({ kiosk: { width: 1024, height: 768 } });
  const tuned = { ...cfg, devices, thumbnail: { device: 'pc' } };
  const brief = join(cfg.roomsDir, 'sign-in', 'BRIEF.md');
  try {
    assert.equal((await roomInfo(tuned, 'sign-in')).device, 'pc', 'the project default');

    await writeFile(brief, '---\ntitle: Sign in\ndevice: kiosk\n---\n# Sign in\n');
    clearDocCache();
    assert.equal((await roomInfo(tuned, 'sign-in')).device, 'kiosk', 'the room’s own name');

    // An unknown name is not a device: the project default still applies.
    await writeFile(brief, '---\ntitle: Sign in\ndevice: tv\n---\n# Sign in\n');
    clearDocCache();
    assert.equal((await roomInfo(tuned, 'sign-in')).device, 'pc');
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('changing the device marks the snapshot stale even when the artifact did not move', async () => {
  const cfg = await fixture();
  const dir = join(cfg.roomsDir, 'sign-in');
  const brief = join(dir, 'BRIEF.md');
  try {
    const png = join(dir, 'index.png');
    const old = new Date(Date.now() - 60_000);
    const now = new Date();
    await writeFile(png, 'png');
    await utimes(join(dir, 'index.html'), old, old);
    await utimes(png, now, now);
    clearDocCache();

    assert.equal((await roomInfo(cfg, 'sign-in')).thumbStale, false);
    assert.equal(await deviceStamp(cfg, 'sign-in'), 0);

    // The brief now names a device, after the png was made.
    const later = new Date(now.getTime() + 5_000);
    await writeFile(brief, '---\ntitle: Sign in\ndevice: pc\n---\n# Sign in\n');
    await utimes(brief, later, later);
    clearDocCache();

    assert.ok(
      (await deviceStamp(cfg, 'sign-in')) >= now.getTime() + 4_000,
      'the device doc dates the snapshot',
    );
    assert.equal((await roomInfo(cfg, 'sign-in')).thumbStale, true);
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

test('sortAt reads updated_at, falling back to the file mtime', async () => {
  const cfg = await fixture();
  const brief = join(cfg.roomsDir, 'sign-in', 'BRIEF.md');
  try {
    // No `updated_at`: the file's own mtime is what "updated" sorting reads.
    const plain = await roomInfo(cfg, 'sign-in');
    assert.equal(plain.sortAt, plain.updatedAt);
    assert.ok(plain.sortAt > 0);

    // A date string is parsed, even when it predates the file.
    await writeFile(brief, '---\ntitle: Sign in\nupdated_at: 2020-01-02\n---\n# Sign in\n');
    clearDocCache();
    assert.equal((await roomInfo(cfg, 'sign-in')).sortAt, Date.parse('2020-01-02'));

    // A number is epoch milliseconds.
    await writeFile(brief, '---\ntitle: Sign in\nupdated_at: 1600000000000\n---\n# Sign in\n');
    clearDocCache();
    assert.equal((await roomInfo(cfg, 'sign-in')).sortAt, 1600000000000);

    // Unreadable text falls back to the mtime — never NaN.
    await writeFile(brief, '---\ntitle: Sign in\nupdated_at: someday\n---\n# Sign in\n');
    clearDocCache();
    const fallback = await roomInfo(cfg, 'sign-in');
    assert.equal(fallback.sortAt, fallback.updatedAt);
    assert.ok(Number.isFinite(fallback.sortAt));
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});
