// modelroom — the tool's own writes are not room changes.
//
// Rendering a snapshot means writing a file, and the server watches the rooms
// directory for changes. If the file it writes is inside that tree, the render
// it just finished looks like an edit: the dashboard is told the room changed,
// asks for the list, the room looks stale again — and the picture is rendered
// once more, forever. Two rules keep that apart, and both are here: the watcher
// passes over dot paths (`visiblePath`), and the render's scratch file is
// written under the state directory (`prepareScratch`), never in a room.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import { visiblePath } from '../../server/http.ts';
import { prepareScratch, snapshotPath } from '../../server/artifact.ts';

test('the watcher and the file server look at ordinary project files only', () => {
  assert.equal(visiblePath('rooms/sign-in/index.html'), true);
  assert.equal(visiblePath('rooms/sign-in/BRIEF.md'), true);
  assert.equal(visiblePath('rooms'), true);

  // A room's own scratch, wherever a stray one is left, is not a room change.
  assert.equal(visiblePath('rooms/sign-in/.index.png.4242.1.tmp'), false);
  assert.equal(visiblePath('.modelroom/state.json'), false);
  assert.equal(visiblePath('rooms/sign-in/.DS_Store'), false);
  assert.equal(visiblePath('node_modules/react/index.js'), false);
  // The root itself is not a file in it: `withinRoot` answers that separately.
  assert.equal(visiblePath(''), false);
});

test("a render's scratch file is written outside the watched tree", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-scratch-'));
  const cfg = { roomsDir: join(dir, 'rooms'), stateDir: join(dir, '.modelroom') };
  try {
    const out = snapshotPath({ roomsDir: cfg.roomsDir, artifact: 'index.html' }, 'sign-in');
    assert.equal(out, join(dir, 'rooms', 'sign-in', 'index.png'));

    const one = await prepareScratch(cfg, out, 'tmp');
    const two = await prepareScratch(cfg, out, 'tmp');
    assert.ok(one.startsWith(cfg.stateDir + sep), `scratch lives in state: ${one}`);
    assert.ok(!one.startsWith(cfg.roomsDir + sep), `scratch never lives in a room: ${one}`);
    assert.notEqual(one, two, 'two renders of one room do not fight over a path');
    assert.match(basename(one), /^index\.png\.\d+\.\d+\.tmp$/);
    assert.ok((await stat(dirname(one))).isDirectory(), 'its directory is made on the way');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
