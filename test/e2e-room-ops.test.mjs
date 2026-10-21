// modelroom — the room-operation HTTP API, end to end.
//
// The UI's add / rename / delete hit `/api/rooms`, `/api/rooms/rename` and
// `/api/rooms/remove`. This starts the server against a throwaway project and
// proves they do what the CLI does: create the required docs, move the
// references and the session, refuse a taken name, and refuse to delete a room
// another one still points at.

import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModelroom } from '../server/http.ts';

const run = promisify(execFile);
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(pkgDir, 'bin', 'modelroom.ts');

const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );

async function freePort() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

test('the room endpoints create, rename and remove, like the CLI', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-api-'));
  let app = null;
  try {
    await run(process.execPath, [cli, 'init', 'hello', '--lang', 'en'], {
      cwd: dir,
      env: { ...process.env, CI: '1', LANG: 'en_US.UTF-8' },
    });
    // A chat session for `hello`, so the rename has one to move.
    await mkdir(join(dir, '.modelroom'), { recursive: true });
    await writeFile(
      join(dir, '.modelroom', 'state.json'),
      JSON.stringify({ sessions: { hello: 'ses_test' }, settings: {} }, null, 2) + '\n',
    );

    app = await createModelroom({
      cwd: dir,
      port: await freePort(),
      host: '127.0.0.1',
      checkForUpdates: false,
    });
    const { url } = await app.listen();
    const post = (path, body) =>
      fetch(`${url}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const roomDir = (name) => join(dir, 'modelroom', 'rooms', name);

    // ── add ──────────────────────────────────────────────────────────────────
    const created = await post('/api/rooms', { name: 'sign-in', title: 'Sign in' });
    expect(created.status).toBe(201);
    expect((await created.json()).room).toBe('sign-in');
    for (const file of ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md', 'index.html']) {
      expect(await exists(join(roomDir('sign-in'), file)), file).toBe(true);
    }
    expect(await readFile(join(roomDir('sign-in'), 'BRIEF.md'), 'utf8')).toMatch(
      /^title: Sign in$/m,
    );

    expect((await post('/api/rooms', { name: 'Sign-in' })).status).toBe(400); // uppercase
    expect((await post('/api/rooms', { name: 'sign-in' })).status).toBe(409); // taken

    const roomResp = await (await fetch(`${url}/api/room?room=sign-in`)).json();
    expect(roomResp.names).toEqual(expect.arrayContaining(['hello', 'sign-in']));

    // ── references ───────────────────────────────────────────────────────────
    await writeFile(join(roomDir('sign-in'), 'SPEC.md'), 'superseded_by: hello\n');
    const refs = await (await fetch(`${url}/api/rooms/refs?room=hello`)).json();
    expect(refs.referencing).toEqual(['sign-in']);

    // ── rename ───────────────────────────────────────────────────────────────
    const renamed = await post('/api/rooms/rename', { from: 'hello', to: 'hello-v2' });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).to).toBe('hello-v2');
    expect(await exists(join(roomDir('hello-v2'), 'BRIEF.md'))).toBe(true);
    expect(await exists(roomDir('hello'))).toBe(false);
    expect(await readFile(join(roomDir('sign-in'), 'SPEC.md'), 'utf8')).toMatch(
      /superseded_by: hello-v2/,
    );
    // The room's chat session moved with it.
    const moved = await (await fetch(`${url}/api/room?room=hello-v2`)).json();
    expect(moved.session).toBe('ses_test');
    // A rename onto a taken name is refused.
    expect((await post('/api/rooms/rename', { from: 'hello-v2', to: 'sign-in' })).status).toBe(409);

    // ── remove ───────────────────────────────────────────────────────────────
    const refused = await post('/api/rooms/remove', { name: 'hello-v2' });
    expect(refused.status).toBe(409);
    expect((await refused.json()).referencing).toEqual(['sign-in']);
    expect(await exists(roomDir('hello-v2'))).toBe(true);

    const forced = await post('/api/rooms/remove', { name: 'hello-v2', force: true });
    expect(forced.status).toBe(200);
    expect(await exists(roomDir('hello-v2'))).toBe(false);
    const state = JSON.parse(await readFile(join(dir, '.modelroom', 'state.json'), 'utf8'));
    expect(state.sessions).toEqual({});
  } finally {
    if (app) await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
