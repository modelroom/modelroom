// modelroom — a render settles, and the tool never renders in a loop.
//
// The dashboard keeps itself current by asking (`/api/rooms` says "make sure you
// can show these") and the file watcher tells it when to ask again. A render
// whose bytes do not change writes nothing — that is the promise that keeps a
// commit honest — so what it drew from has to be remembered somewhere else: local
// state. Without that, a room whose doc names the device looks stale forever, its
// render looks like an edit, and every render feeds the next one (issue #44).
//
// Rendering itself needs Playwright, which CI installs after this pass. What is
// tested here is the decision and the loop around it — the part that has to be
// right on a machine that has neither.

import { test, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModelroom } from '../server/http.ts';

async function freePort() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

/**
 * Open the event stream, run `act`, and read until `until` matches or `ms` runs
 * out. `hello` is read first, so nothing the action causes can be missed.
 */
async function watch(url, act, { until, ms = 1500 }) {
  const controller = new AbortController();
  const chunks = [];
  const stream = await fetch(`${url}/events`, { signal: controller.signal });
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  while (!chunks.join('').includes('event: hello')) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  const matched = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    void (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) return;
          chunks.push(decoder.decode(value));
          if (until.test(chunks.join(''))) {
            clearTimeout(timer);
            return resolve(true);
          }
        }
      } catch {
        /* aborted below */
      }
    })();
  });
  await act();
  const hit = await matched;
  controller.abort();
  return { hit, seen: chunks.join('') };
}

test('a recorded render settles the room, and a scratch file is not a change', async () => {
  const results = [];
  const check = (ok, label, extra = '') => results.push({ ok: Boolean(ok), label, extra });

  const dir = await mkdtemp(join(tmpdir(), 'mr-thumbs-'));
  const rdir = join(dir, 'rooms', 'sign-in');
  const brief = join(rdir, 'BRIEF.md');
  const scratch = join(rdir, `.index.png.${process.pid}.1.tmp`);
  let app = null;
  try {
    await mkdir(rdir, { recursive: true });
    await writeFile(
      join(dir, 'modelroom.json'),
      JSON.stringify(
        {
          root: '.',
          rooms: 'rooms',
          artifact: 'index.html',
          docs: ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md'],
        },
        null,
        2,
      ) + '\n',
    );
    await writeFile(join(rdir, 'index.html'), '<h1>Sign in</h1>\n');
    await writeFile(join(rdir, 'index.png'), 'png');
    const old = new Date(Date.now() - 60_000);
    const now = new Date();
    await utimes(join(rdir, 'index.html'), old, old);
    await utimes(join(rdir, 'index.png'), old, old);
    // The doc names the device, and it moved after the png: on its own this room
    // is stale for ever — the picture cannot be told apart from the last one.
    await writeFile(brief, '---\ntitle: Sign in\ndevice: pc\n---\n# Sign in\n');
    await utimes(brief, now, now);

    // What a render that wrote nothing leaves behind: the stamp it drew from.
    const stamp = (await stat(brief)).mtimeMs;
    await mkdir(join(dir, '.modelroom'), { recursive: true });
    await writeFile(
      join(dir, '.modelroom', 'state.json'),
      `${JSON.stringify({ sessions: {}, settings: {}, renders: { 'sign-in': stamp } }, null, 2)}\n`,
    );

    app = await createModelroom({
      cwd: dir,
      port: await freePort(),
      host: '127.0.0.1',
      checkForUpdates: false,
    });
    app.startWatching();
    const { url } = await app.listen();

    // The dashboard asks for the list, which is also where the background pass
    // gets its cue. The room is drawn already, so nothing is queued.
    const quiet = await watch(
      url,
      async () => {
        const body = await (await fetch(`${url}/api/rooms`)).json();
        const info = body.rooms.find((room) => room.name === 'sign-in');
        check(info?.thumbStale === false, 'a room drawn from these sources is not stale');
        check(info?.hasThumb === true, 'and it still carries its committed png');
      },
      { until: /event: render-done/, ms: 1500 },
    );
    check(!quiet.hit, 'asking for the list does not render the room again', quiet.seen);

    // The scratch file a render writes is outside the rooms, so a stray one is
    // not a change: it is not a room edit to the dashboard, and not a reason to
    // render (that is the loop).
    const stray = await watch(url, () => writeFile(scratch, 'x'), {
      until: /event: (?:change|render-done)/,
      ms: 1200,
    });
    check(!/event: change/.test(stray.seen), 'a dotfile in a room is not a change');
    check(!/event: render-done/.test(stray.seen), 'and it does not date the snapshot');

    // The control: a real edit still arrives, so the stream is not simply quiet.
    const loud = await watch(
      url,
      () => writeFile(brief, '---\ntitle: Sign in\ndevice: pc\n---\n# Sign in, again\n'),
      { until: /event: change/, ms: 4000 },
    );
    check(loud.hit, 'a doc edit still streams to the dashboard', loud.seen);
  } finally {
    if (app) await app.close();
    await rm(dir, { recursive: true, force: true });
  }

  for (const r of results) {
    expect(r.ok, `${r.label}${r.extra ? ` — ${r.extra}` : ''}`).toBe(true);
  }
});
