// modelroom — the room operations the CLI and the server share.
//
// `core/roomops.ts` is what both `modelroom add|rename|remove` and the UI's
// endpoints call, so this is where "creating writes the required docs", "a
// rename moves the references" and "a removal knows who points at the room" are
// pinned down without a process.

import { test, expect } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../core/config.ts';
import { listRoomNames } from '../../core/rooms.ts';
import {
  applyRename,
  createRoom,
  planRename,
  referencingRooms,
  removeRoom,
} from '../../core/roomops.ts';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const templatesDir = join(pkgDir, 'templates');

const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );

async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'mr-ops-'));
  return { dir, cfg: await loadConfig(dir) };
}

test('createRoom writes every doc the config names and the artifact', async () => {
  const { dir, cfg } = await project();
  try {
    const written = await createRoom(cfg, templatesDir, 'en', 'sign-in', 'Sign in');
    expect(written.map((p) => p.replace(dir + '/', '')).sort()).toEqual([
      'rooms/sign-in/BEHAVIOUR.md',
      'rooms/sign-in/BRIEF.md',
      'rooms/sign-in/SPEC.md',
      'rooms/sign-in/index.html',
    ]);
    const brief = await readFile(join(cfg.roomsDir, 'sign-in', 'BRIEF.md'), 'utf8');
    expect(brief).toMatch(/^title: Sign in$/m);
    expect(brief).toMatch(/^# Sign in$/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('createRoom fills a skeleton for a doc the templates do not have', async () => {
  const { dir, cfg } = await project();
  try {
    cfg.docs = ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md', 'NOTES.md'];
    cfg.artifact = 'screen.html';
    await createRoom(cfg, templatesDir, 'en', 'cart');
    expect(await readFile(join(cfg.roomsDir, 'cart', 'NOTES.md'), 'utf8')).toBe(
      '---\ntitle: cart\n---\n# cart\n',
    );
    expect(await exists(join(cfg.roomsDir, 'cart', 'screen.html'))).toBe(true);
    expect(await exists(join(cfg.roomsDir, 'cart', 'index.html'))).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a rename moves the directory and every reference, and leaves prose', async () => {
  const { dir, cfg } = await project();
  try {
    await createRoom(cfg, templatesDir, 'en', 'checkout');
    await createRoom(cfg, templatesDir, 'en', 'sign-in');
    await writeFile(
      join(cfg.roomsDir, 'sign-in', 'SPEC.md'),
      '---\nsuperseded_by: checkout\n---\n# sign-in\n\nThe checkout room stays.\nSee /rooms/checkout and ../checkout/BRIEF.md.\n',
    );

    const names = await listRoomNames(cfg);
    const plans = await planRename(cfg, names, 'checkout', 'check-out');
    expect(plans.map((p) => p.file.replace(cfg.roomsDir + '/', ''))).toEqual(['sign-in/SPEC.md']);
    expect(plans[0].count).toBe(3);
    expect(plans[0].mentions.map((m) => m.line)).toContain(6);

    await applyRename(cfg, 'checkout', 'check-out', plans);
    expect(await exists(join(cfg.roomsDir, 'checkout'))).toBe(false);
    expect(await exists(join(cfg.roomsDir, 'check-out', 'BRIEF.md'))).toBe(true);
    const spec = await readFile(join(cfg.roomsDir, 'sign-in', 'SPEC.md'), 'utf8');
    expect(spec).toMatch(/superseded_by: check-out/);
    expect(spec).toMatch(/\/rooms\/check-out/);
    expect(spec).toMatch(/\.\.\/check-out\/BRIEF\.md/);
    expect(spec).toMatch(/The checkout room stays\./); // prose is untouched
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a case-only rename changes the directory name', async () => {
  const { dir, cfg } = await project();
  try {
    await createRoom(cfg, templatesDir, 'en', 'cart');
    const plans = await planRename(cfg, await listRoomNames(cfg), 'cart', 'Cart');
    // `Cart` is not a valid *new* name; the point here is the directory move only.
    await applyRename(cfg, 'cart', 'Cart', plans);
    expect(await exists(join(cfg.roomsDir, 'Cart', 'BRIEF.md'))).toBe(true);
    // On a case-insensitive disk `cart` and `Cart` are one directory: read the
    // stored name rather than asking whether the old spelling "exists".
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(cfg.roomsDir)).toEqual(['Cart']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('referencingRooms finds who points at a room, and removeRoom deletes it', async () => {
  const { dir, cfg } = await project();
  try {
    await createRoom(cfg, templatesDir, 'en', 'checkout');
    await createRoom(cfg, templatesDir, 'en', 'sign-in');
    await writeFile(join(cfg.roomsDir, 'sign-in', 'SPEC.md'), 'superseded_by: checkout\n');

    const names = await listRoomNames(cfg);
    expect(await referencingRooms(cfg, 'checkout', names)).toEqual(['sign-in']);
    expect(await referencingRooms(cfg, 'sign-in', names)).toEqual([]);

    await removeRoom(cfg, 'checkout');
    expect(await exists(join(cfg.roomsDir, 'checkout'))).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
