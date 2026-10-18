// modelroom — end-to-end checks
//
// Starts the server on a free port against this repo's config, then exercises the
// promises that matter: rooms are discovered, pages render, the served artifact is
// byte-identical, writes are restricted, and changes stream over SSE.

import { test, expect } from 'vitest';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModelroom } from '../lib/server.ts';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function freePort() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

test('the server keeps its promises', async () => {
  const results = [];
  const check = (ok, label, extra = '') => {
    results.push({ ok: Boolean(ok), label, extra });
  };

  const port = await freePort();
  const app = await createModelroom({ cwd: pkgDir, port, host: '127.0.0.1' });
  app.startWatching();
  const { url } = await app.listen();
  const room = 'sign-in';
  const base = url;

  try {
    const health = await fetch(`${base}/health`);
    check(health.status === 200 && (await health.text()) === 'ok', 'GET /health returns ok');

    const rooms = await (await fetch(`${base}/api/rooms`)).json();
    check(
      rooms.count >= 1 && rooms.rooms.some((r) => r.name === room),
      `GET /api/rooms finds "${room}"`,
    );
    const info = rooms.rooms.find((r) => r.name === room);
    check(info?.status === 'draft', 'room status is read from the BRIEF.md frontmatter');
    check(info?.behaviourIds?.length >= 2, 'behaviour ids are counted from BEHAVIOUR.md');
    check(!('bodyText' in info), 'the public room payload does not ship the body');
    check(
      Array.isArray(rooms.facets) && rooms.facets.some((f) => f.key === 'tags'),
      'the API derives facets from the records',
    );
    check(
      rooms.facets.every((f) => ['radio', 'select', 'checkboxes'].includes(f.control)),
      'every facet has a control',
    );

    const search = await (
      await fetch(`${base}/api/search?q=${encodeURIComponent('front door')}`)
    ).json();
    const hit = search.hits?.find((h) => h.name === room);
    check(
      Boolean(hit) && hit.snippets.length > 0,
      'GET /api/search finds the room and returns a snippet',
    );
    check(typeof hit?.snippets[0]?.line === 'number', 'the snippet carries a line number');

    const miss = await (await fetch(`${base}/api/search?q=zzzz-no-such-room`)).json();
    check(miss.hits.length === 0, 'GET /api/search returns nothing for a missing term');

    const dash = await fetch(`${base}/`);
    const dashHtml = await dash.text();
    check(dash.status === 200 && dashHtml.includes('modelroom'), 'GET / serves the dashboard');

    const roomPage = await fetch(`${base}/room/${room}`);
    const roomHtml = await roomPage.text();
    check(
      roomPage.status === 200 &&
        roomHtml.includes('id="root"') &&
        roomHtml.includes('/ui/assets/app.js'),
      'GET /room/<name> serves the workspace shell',
    );

    const bundle = await fetch(`${base}/ui/assets/app.js`);
    check(
      bundle.status === 200 && (bundle.headers.get('content-type') ?? '').includes('javascript'),
      'the room UI bundle is served as JavaScript',
    );

    const settings = await fetch(`${base}/settings`);
    check(settings.status === 200, 'GET /settings serves settings');

    const raw = await fetch(`${base}/files/${rooms.config.rooms}/${room}/${rooms.config.artifact}`);
    const disk = await readFile(join(pkgDir, rooms.config.rooms, room, rooms.config.artifact));
    const served = Buffer.from(await raw.arrayBuffer());
    check(
      raw.status === 200 && Buffer.compare(served, disk) === 0,
      'served artifact is byte-identical to disk',
    );

    const traversal = await fetch(`${base}/files/..%2f..%2f..%2fetc%2fpasswd`);
    check(traversal.status === 403, 'path traversal outside root is refused');

    const escape = await fetch(`${base}/files/%2e%2e%2fpackage.json`);
    check(escape.status === 403, 'escaping above the root is refused');

    const dotfile = await fetch(`${base}/files/.env`);
    check(dotfile.status === 403, 'dotfiles (secrets, .git, .modelroom) are not served');

    const docGet = await fetch(`${base}/api/doc?room=${room}&name=BRIEF.md`);
    const docBody = await docGet.json();
    check(
      docGet.status === 200 && typeof docBody.text === 'string' && docBody.text.includes('Sign in'),
      'GET /api/doc returns a room doc',
    );

    const forbiddenName = await fetch(`${base}/api/doc`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room, name: 'index.html', text: 'nope' }),
    });
    check(forbiddenName.status === 403, 'PUT /api/doc refuses files outside cfg.docs');

    const stale = await fetch(`${base}/api/doc`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room, name: 'BRIEF.md', text: 'x', mtime: 1 }),
    });
    check(stale.status === 409, 'PUT /api/doc refuses to overwrite a file changed elsewhere');
    check(
      typeof docBody.hash === 'string' && docBody.hash.length > 0,
      'GET /api/doc returns a content hash',
    );

    const staleHash = await fetch(`${base}/api/doc`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room, name: 'BRIEF.md', text: 'x', hash: 'not-the-hash' }),
    });
    const staleHashBody = await staleHash.json();
    check(
      staleHash.status === 409 && typeof staleHashBody.hash === 'string',
      'PUT /api/doc refuses a stale hash and says which version is on disk',
    );

    // A real save — and the same file put back, so the working tree ends unchanged.
    let savedHash = docBody.hash;
    try {
      const saved = await fetch(`${base}/api/doc`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          room,
          name: 'BRIEF.md',
          text: `${docBody.text}\n<!-- probe -->\n`,
          hash: docBody.hash,
        }),
      });
      const savedBody = await saved.json();
      savedHash = savedBody.hash;
      check(
        saved.status === 200 && savedBody.hash !== docBody.hash,
        'PUT /api/doc saves when the hash matches, and returns the new one',
      );
    } finally {
      await fetch(`${base}/api/doc`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room, name: 'BRIEF.md', text: docBody.text, hash: savedHash }),
      });
    }

    // SSE: a room file change must stream to connected clients
    const briefPath = join(pkgDir, rooms.config.rooms, room, 'BRIEF.md');
    const seen = await new Promise((resolveEvents) => {
      const controller = new AbortController();
      const events = [];
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try {
          controller.abort();
        } catch {
          /* already gone */
        }
        resolveEvents(events.join(''));
      };
      const timer = setTimeout(finish, 5000);
      void (async () => {
        try {
          const stream = await fetch(`${base}/events`, { signal: controller.signal });
          const reader = stream.body.getReader();
          const decoder = new TextDecoder();
          setTimeout(async () => {
            try {
              await writeFile(briefPath, await readFile(briefPath));
            } catch {
              /* ignore */
            }
          }, 400);
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            events.push(decoder.decode(value));
            if (/event: change/.test(events.join(''))) {
              clearTimeout(timer);
              return finish();
            }
          }
        } catch {
          /* aborted */
        }
        clearTimeout(timer);
        finish();
      })();
    });
    check(/event: change/.test(seen), 'a room file change streams over SSE');
    check(/event: hello/.test(seen), 'SSE greets on connect');

    const chat = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room, prompt: '' }),
    });
    check(chat.status === 409, 'empty prompt is refused (409)');

    // A rejected request must not run the handler: no stray session, no stray render.
    const beforeSession = (await (await fetch(`${base}/api/room?room=${room}`)).json()).session;
    const bad = await fetch(`${base}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    check(bad.status === 400, 'malformed JSON to /api/session is refused (400)');
    const afterSession = (await (await fetch(`${base}/api/room?room=${room}`)).json()).session;
    check(afterSession === beforeSession, 'a rejected request does not rotate the room session');

    // Settings are local state: they apply now, land in .modelroom/state.json, and are restored.
    const setRes = await fetch(`${base}/api/settings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openrouter/deepseek/deepseek-v4.1-flash' }),
    });
    const setData = await setRes.json();
    check(
      setRes.ok && setData.config?.agent?.model === 'openrouter/deepseek/deepseek-v4.1-flash',
      'POST /api/settings applies the model',
    );
    const onDisk = JSON.parse(await readFile(join(pkgDir, '.modelroom', 'state.json'), 'utf8'));
    check(
      onDisk.settings?.model === 'openrouter/deepseek/deepseek-v4.1-flash',
      'the saved setting is written to .modelroom/state.json',
    );
    const app2 = await createModelroom({ cwd: pkgDir, port: await freePort(), host: '127.0.0.1' });
    check(
      app2.cfg.agent.model === 'openrouter/deepseek/deepseek-v4.1-flash',
      'saved settings are restored on the next start',
    );
    await app2.close();
  } finally {
    await app.close();
  }

  for (const r of results) {
    expect(r.ok, `${r.label}${r.extra ? ' — ' + r.extra : ''}`).toBe(true);
  }
});
