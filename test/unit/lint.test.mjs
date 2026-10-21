import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintRooms } from '../../bin/lint.ts';
import { clearDocCache } from '../../core/rooms.ts';
import { normalizeDevices } from '../../core/device.ts';

const docs = ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md'];

async function fixture(rooms) {
  const dir = await mkdtemp(join(tmpdir(), 'mr-lint-'));
  for (const [name, files] of Object.entries(rooms)) {
    await mkdir(join(dir, name), { recursive: true });
    for (const [file, text] of Object.entries(files)) {
      await writeFile(join(dir, name, file), text);
    }
  }
  clearDocCache();
  return { roomsDir: dir, docs };
}

const codes = (issues) => issues.map((i) => i.code);

test('a clean room has no issues', async () => {
  const cfg = await fixture({
    good: {
      'BRIEF.md': `---\ntitle: Good\nstatus: draft\ntags: [auth]\n---\n# Good\n`,
      'SPEC.md': '# spec\n',
    },
  });
  try {
    const { issues, stats } = await lintRooms(cfg);
    assert.deepEqual(issues, []);
    assert.equal(stats.rooms, 1);
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('reserved keys keep their shape', async () => {
  const cfg = await fixture({
    bad: { 'BRIEF.md': `---\ntitle: Bad\ntags: auth\ndeprecated: "yes"\n---\n# Bad\n` },
  });
  try {
    const { issues } = await lintRooms(cfg);
    assert.equal(issues.filter((i) => i.code === 'reserved-type').length, 2);
    assert.ok(issues.every((i) => i.level === 'error'));
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('tags must be a flat list of strings', async () => {
  const cfg = await fixture({
    bad: { 'BRIEF.md': `---\ntitle: Bad\ntags: [[a], b]\n---\n# Bad\n` },
  });
  try {
    const { issues } = await lintRooms(cfg);
    assert.ok(issues.some((i) => i.code === 'tags-shape'));
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('nested frontmatter, H1 drift and a dangling supersede are reported', async () => {
  const cfg = await fixture({
    bad: {
      'BRIEF.md': `---
title: Different
meta:
  a: 1
superseded_by: nowhere
---
# Real title
`,
    },
  });
  try {
    const { issues } = await lintRooms(cfg);
    assert.ok(codes(issues).includes('nested'));
    assert.ok(codes(issues).includes('h1-title'));
    assert.ok(codes(issues).includes('superseded-missing'));
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('synonyms and spelling variants are warnings', async () => {
  const cfg = await fixture({
    a: { 'BRIEF.md': `---\ntitle: A\nstatus: Draft\nsummary: s\ndescription: d\n---\n# A\n` },
    b: { 'BRIEF.md': `---\ntitle: B\nstatus: draft\n---\n# B\n` },
  });
  try {
    const { issues, stats } = await lintRooms(cfg);
    assert.ok(codes(issues).includes('synonym'));
    assert.ok(codes(issues).includes('variant'));
    assert.equal(stats.errors, 0);
    assert.ok(stats.warnings >= 3);
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('a brief with no frontmatter is a warning, not an error', async () => {
  const cfg = await fixture({ plain: { 'BRIEF.md': '# Plain\n' } });
  try {
    const { issues } = await lintRooms(cfg);
    assert.deepEqual(codes(issues), ['no-frontmatter']);
    assert.equal(issues[0].level, 'warn');
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('missing docs are left to doctor', async () => {
  const cfg = await fixture({ partial: { 'BRIEF.md': `---\ntitle: P\n---\n# P\n` } });
  try {
    const { issues } = await lintRooms(cfg);
    assert.deepEqual(issues, []);
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});

test('a device must name one the project knows', async () => {
  const cfg = await fixture({
    known: { 'BRIEF.md': `---\ntitle: K\ndevice: pc\n---\n# K\n` },
    custom: { 'BRIEF.md': `---\ntitle: C\ndevice: kiosk\n---\n# C\n` },
    unknown: { 'BRIEF.md': `---\ntitle: U\ndevice: tv\n---\n# U\n` },
  });
  const devices = normalizeDevices({ kiosk: { width: 1024, height: 768 } });
  try {
    const { issues } = await lintRooms({ ...cfg, devices });
    assert.deepEqual(codes(issues), ['unknown-device']);
    assert.equal(issues[0].room, 'unknown');
    assert.equal(issues[0].level, 'error');
    assert.match(issues[0].message, /tv/);

    const { issues: without } = await lintRooms(cfg);
    // The same value is unknown without the project defining it.
    assert.deepEqual(
      without.filter((i) => i.code === 'unknown-device').map((i) => i.room),
      ['custom', 'unknown'],
    );
  } finally {
    await rm(cfg.roomsDir, { recursive: true, force: true });
  }
});
