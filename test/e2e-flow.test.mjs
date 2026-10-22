// modelroom — the flow and app records, end to end.
//
// The dashboard's app tabs and flow view are derived, not stored: `app` is a
// free key that becomes a facet, and `updated_at` is what "updated" sorting
// reads. This starts the server against a throwaway project with several apps
// and checks that `/api/rooms` carries both — the shapes the UI depends on.

import { test, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'mr-flow-'));
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
  return dir;
}

/** Write a room's BRIEF.md frontmatter; arrays are inline lists. */
async function room(dir, name, fields) {
  const rdir = join(dir, 'rooms', name);
  await mkdir(rdir, { recursive: true });
  const fm = Object.entries(fields)
    .map(([key, value]) =>
      Array.isArray(value) ? `${key}: [${value.join(', ')}]` : `${key}: ${value}`,
    )
    .join('\n');
  await writeFile(join(rdir, 'BRIEF.md'), `---\n${fm}\n---\n# ${name}\n`);
  await writeFile(join(rdir, 'index.html'), `<h1>${name}</h1>\n`);
}

test('the app facet and sortAt come out of the records', async () => {
  const dir = await project();
  let app = null;
  try {
    await room(dir, 'login', { title: 'Login', app: 'user', next: 'top', tags: ['auth'] });
    await room(dir, 'top', { title: 'Top', app: 'user', next: 'detail', tags: ['auth', 'form'] });
    await room(dir, 'detail', { title: 'Detail', app: 'user' });
    await room(dir, 'admin-home', { title: 'Admin', app: 'admin', next: 'reports' });
    await room(dir, 'reports', { title: 'Reports', app: 'admin' });
    await room(dir, 'legacy', { title: 'Legacy', app: 'user-legacy' });
    await room(dir, 'orphan', { title: 'Orphan' });
    // A declared date that predates the file, so the two cannot be confused.
    await writeFile(
      join(dir, 'rooms', 'login', 'BRIEF.md'),
      `---\ntitle: Login\napp: user\nnext: top\ntags: [auth]\nupdated_at: 2020-01-02\n---\n# Login\n`,
    );

    app = await createModelroom({
      cwd: dir,
      port: await freePort(),
      host: '127.0.0.1',
      checkForUpdates: false,
    });
    const { url } = await app.listen();
    const body = await (await fetch(`${url}/api/rooms`)).json();

    expect(body.count).toBe(7);
    expect(body.rooms.every((r) => Number.isFinite(r.sortAt))).toBe(true);

    const login = body.rooms.find((r) => r.name === 'login');
    expect(login.sortAt).toBe(Date.parse('2020-01-02'));
    // A room with no updated_at sorts by its file mtime, not by NaN.
    const top = body.rooms.find((r) => r.name === 'top');
    expect(top.sortAt).toBe(top.updatedAt);

    // `app` is free text, so the facet is derived like any other — with counts.
    const appFacet = body.facets.find((f) => f.key === 'app');
    expect(appFacet).toBeTruthy();
    expect(appFacet.control).toBe('radio');
    expect(Object.fromEntries(appFacet.values.map((v) => [v.value, v.count]))).toEqual({
      user: 3,
      admin: 2,
      'user-legacy': 1,
    });

    expect(body.facets.some((f) => f.key === 'tags')).toBe(true);
  } finally {
    if (app) await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
