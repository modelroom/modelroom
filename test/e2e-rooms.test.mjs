// modelroom — room operations, end to end.
//
// `add`, `rename`, `remove` and `update` in a throwaway project: the name stays
// unique, the required docs are written, the references move with the directory,
// and `update` refreshes only what modelroom generated.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(pkgDir, 'bin', 'modelroom.ts');
const templates = join(pkgDir, 'templates', 'en');

async function project() {
  return mkdtemp(join(tmpdir(), 'mr-rooms-'));
}

/** Run the CLI and return the outcome instead of throwing on a non-zero exit. */
async function cliRun(cwd, args) {
  try {
    const result = await run(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, CI: '1', LANG: 'en_US.UTF-8' },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const room = (dir, name, file) => join(dir, 'modelroom', 'rooms', name, file);
const roomDir = (dir, name) => join(dir, 'modelroom', 'rooms', name);

/** Local state is written by `serve`; a test writes it where the CLI looks. */
async function writeState(dir, sessions) {
  await mkdir(join(dir, '.modelroom'), { recursive: true });
  await writeFile(
    join(dir, '.modelroom', 'state.json'),
    JSON.stringify({ sessions, settings: {} }, null, 2) + '\n',
  );
}

test('add creates a room with the required docs and a title', async () => {
  const dir = await project();
  try {
    assert.equal((await cliRun(dir, ['init', 'hello', '--lang', 'en'])).code, 0);
    const result = await cliRun(dir, ['add', 'sign-in', '--title', 'Sign in']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /created room sign-in/);

    for (const file of ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md', 'index.html']) {
      assert.equal(await exists(room(dir, 'sign-in', file)), true, file);
    }
    const brief = await readFile(room(dir, 'sign-in', 'BRIEF.md'), 'utf8');
    assert.match(brief, /^title: Sign in$/m);
    assert.match(brief, /^# Sign in$/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('`new` stays as a hidden alias for `add`', async () => {
  const dir = await project();
  try {
    await cliRun(dir, ['init', 'hello', '--lang', 'en']);
    const result = await cliRun(dir, ['new', 'cart']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /created room cart/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('add refuses an invalid, an existing and a case-only name', async () => {
  const dir = await project();
  try {
    await cliRun(dir, ['init', 'Checkout', '--lang', 'en']);
    await cliRun(dir, ['init', 'cart', '--lang', 'en']);

    const upper = await cliRun(dir, ['add', 'Sign-in']);
    assert.equal(upper.code, 1);
    assert.match(upper.stderr, /invalid room name/);

    const dup = await cliRun(dir, ['add', 'cart']);
    assert.equal(dup.code, 1);
    assert.match(dup.stderr, /already exists/);

    // A lowercase name that only differs by case from an existing room.
    const caseOnly = await cliRun(dir, ['add', 'checkout']);
    assert.equal(caseOnly.code, 1);
    assert.match(caseOnly.stderr, /differs only by case/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('add without a config says how to start', async () => {
  const dir = await project();
  try {
    const result = await cliRun(dir, ['add', 'checkout']);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /npx modelroom init/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rename moves the directory, the references and the session', async () => {
  const dir = await project();
  try {
    await cliRun(dir, ['init', 'checkout', '--lang', 'en']);
    await cliRun(dir, ['add', 'sign-in']);
    await writeFile(
      room(dir, 'sign-in', 'SPEC.md'),
      `---
superseded_by: checkout
---
# sign-in — spec

The checkout room stays. See /rooms/checkout and [brief](../checkout/BRIEF.md).
`,
    );
    await writeState(dir, { checkout: 'ses_test' });

    // A dry run changes nothing.
    const dry = await cliRun(dir, ['rename', 'checkout', 'check-out', '--dry-run']);
    assert.equal(dry.code, 0);
    assert.match(dry.stdout, /dry run/);
    assert.equal(await exists(room(dir, 'checkout', 'BRIEF.md')), true);
    assert.match(
      await readFile(room(dir, 'sign-in', 'SPEC.md'), 'utf8'),
      /superseded_by: checkout/,
    );

    const result = await cliRun(dir, ['rename', 'checkout', 'check-out']);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /checkout → check-out/);
    assert.equal(await exists(room(dir, 'check-out', 'BRIEF.md')), true);
    assert.equal(await exists(roomDir(dir, 'checkout')), false);

    const spec = await readFile(room(dir, 'sign-in', 'SPEC.md'), 'utf8');
    assert.match(spec, /superseded_by: check-out/);
    assert.match(spec, /\/rooms\/check-out/);
    assert.match(spec, /\.\.\/check-out\/BRIEF\.md/);
    // Prose is not a path: it stays, and the command points at it.
    assert.match(spec, /The checkout room stays\./);
    assert.match(result.stdout, /still mentions|sign-in\/SPEC\.md/);

    const state = JSON.parse(await readFile(join(dir, '.modelroom', 'state.json'), 'utf8'));
    assert.deepEqual(state.sessions, { 'check-out': 'ses_test' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('remove refuses while a room points at it, and takes --yes to delete', async () => {
  const dir = await project();
  try {
    await cliRun(dir, ['init', 'checkout', '--lang', 'en']);
    await cliRun(dir, ['add', 'sign-in']);
    await writeFile(room(dir, 'sign-in', 'SPEC.md'), 'superseded_by: checkout\n');
    await writeState(dir, { checkout: 'ses_test' });

    const dry = await cliRun(dir, ['remove', 'checkout', '--dry-run']);
    assert.equal(dry.code, 0);
    assert.match(dry.stdout, /would remove room checkout/);
    assert.match(dry.stdout, /sign-in/);

    const noYes = await cliRun(dir, ['remove', 'checkout']);
    assert.equal(noYes.code, 1);
    assert.match(noYes.stderr, /referenced by sign-in/);

    const yes = await cliRun(dir, ['remove', 'checkout', '--yes']);
    assert.equal(yes.code, 1, 'a referenced room is refused even with --yes');

    const forced = await cliRun(dir, ['remove', 'checkout', '--yes', '--force']);
    assert.equal(forced.code, 0);
    assert.match(forced.stdout, /removed room checkout/);
    assert.equal(await exists(roomDir(dir, 'checkout')), false);

    const state = JSON.parse(await readFile(join(dir, '.modelroom', 'state.json'), 'utf8'));
    assert.deepEqual(state.sessions, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a running serve blocks a room move until --force', async () => {
  const dir = await project();
  try {
    await cliRun(dir, ['init', 'checkout', '--lang', 'en']);
    await mkdir(join(dir, '.modelroom'), { recursive: true });
    // This process is alive, which is all the pid check reads.
    await writeFile(join(dir, '.modelroom', 'serve.pid'), String(process.pid));

    const refused = await cliRun(dir, ['rename', 'checkout', 'cart']);
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /serve is running/);
    assert.equal(await exists(roomDir(dir, 'checkout')), true);

    const forced = await cliRun(dir, ['rename', 'checkout', 'cart', '--force']);
    assert.equal(forced.code, 0);
    assert.equal(await exists(roomDir(dir, 'cart')), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('add fills in a doc and an artifact the templates do not have', async () => {
  const dir = await project();
  try {
    await cliRun(dir, ['init', 'checkout', '--lang', 'en']);
    const config = join(dir, 'modelroom', 'modelroom.json');
    const raw = JSON.parse(await readFile(config, 'utf8'));
    raw.docs = ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md', 'NOTES.md'];
    raw.artifact = 'screen.html';
    await writeFile(config, JSON.stringify(raw, null, 2) + '\n');

    const result = await cliRun(dir, ['add', 'cart']);
    assert.equal(result.code, 0);
    assert.equal(
      await readFile(room(dir, 'cart', 'NOTES.md'), 'utf8'),
      '---\ntitle: cart\n---\n# cart\n',
    );
    assert.equal(await exists(room(dir, 'cart', 'screen.html')), true);
    assert.equal(await exists(room(dir, 'cart', 'index.html')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update refreshes the generated files and leaves the project alone', async () => {
  const dir = await project();
  try {
    await cliRun(dir, ['init', 'checkout', '--lang', 'en']);
    const skill = join(dir, 'modelroom', '.opencode', 'skills', 'read-modelroom', 'SKILL.md');
    const agents = join(dir, 'modelroom', 'AGENTS.md');
    const config = join(dir, 'modelroom', 'modelroom.json');
    await writeFile(skill, 'edited\n');
    await writeFile(agents, 'edited\n');
    await writeFile(room(dir, 'checkout', 'BRIEF.md'), 'mine\n');
    const configText = (await readFile(config, 'utf8')) + '\n';
    await writeFile(config, configText);

    const dry = await cliRun(dir, ['update', '--dry-run']);
    assert.equal(dry.code, 0);
    assert.equal(await readFile(skill, 'utf8'), 'edited\n');

    const result = await cliRun(dir, ['update']);
    assert.equal(result.code, 0);
    assert.equal(
      await readFile(skill, 'utf8'),
      await readFile(join(templates, 'skills', 'read-modelroom', 'SKILL.md'), 'utf8'),
    );
    assert.equal(
      await readFile(agents, 'utf8'),
      await readFile(join(templates, 'AGENTS.md'), 'utf8'),
    );
    // A room and the committed config are the project's, not modelroom's.
    assert.equal(await readFile(room(dir, 'checkout', 'BRIEF.md'), 'utf8'), 'mine\n');
    assert.equal(await readFile(config, 'utf8'), configText);

    const again = await cliRun(dir, ['update']);
    assert.match(again.stdout, /already current|unchanged/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
