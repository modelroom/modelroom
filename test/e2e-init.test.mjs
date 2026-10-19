// modelroom — the install path, end to end.
//
// `init` is the only command that writes a project, so this exercises it in a
// throwaway directory: the two-directory layout, the chosen language, the
// gitignore line, idempotence, and the old layout staying where it was.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.ts';

const run = promisify(execFile);
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(pkgDir, 'bin', 'modelroom.ts');

async function project() {
  return mkdtemp(join(tmpdir(), 'mr-init-'));
}

async function init(cwd, args, env = {}) {
  return run(process.execPath, [cli, 'init', ...args], {
    cwd,
    env: { ...process.env, CI: '1', LANG: 'en_US.UTF-8', ...env },
  });
}

test('init creates modelroom/ + .modelroom/ and writes Japanese templates', async () => {
  const dir = await project();
  try {
    await init(dir, ['checkout', '--lang', 'ja']);

    const configText = await readFile(join(dir, 'modelroom', 'modelroom.json'), 'utf8');
    const config = JSON.parse(configText);
    assert.equal(config.root, '.');
    assert.equal(config.rooms, 'rooms');
    assert.equal(config.state, '../.modelroom');
    assert.equal(config.lang, 'ja');

    assert.match(await readFile(join(dir, 'modelroom', 'AGENTS.md'), 'utf8'), /日本語で書いて/);
    const brief = await readFile(join(dir, 'modelroom', 'rooms', 'checkout', 'BRIEF.md'), 'utf8');
    assert.match(brief, /^---\ntitle: checkout\nstatus: draft\n/);
    assert.match(brief, /次に読む人/);
    assert.match(await readFile(join(dir, '.gitignore'), 'utf8'), /^\/\.modelroom\/$/m);

    // The config is discovered from the project root, with every path anchored
    // to the config file.
    const cfg = await loadConfig(dir);
    assert.equal(cfg.configPath, join(dir, 'modelroom', 'modelroom.json'));
    assert.equal(cfg.rootDir, join(dir, 'modelroom'));
    assert.equal(cfg.roomsDir, join(dir, 'modelroom', 'rooms'));
    assert.equal(cfg.stateDir, join(dir, '.modelroom'));
    assert.equal(cfg.lang, 'ja');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('init without --lang auto-detects and leaves lang out of the config', async () => {
  const dir = await project();
  try {
    const result = await init(dir, ['checkout'], { LANG: 'ja_JP.UTF-8' });
    const config = JSON.parse(await readFile(join(dir, 'modelroom', 'modelroom.json'), 'utf8'));
    assert.equal('lang' in config, false);
    assert.match(result.stdout, /ja/);
    assert.match(await readFile(join(dir, 'modelroom', 'AGENTS.md'), 'utf8'), /日本語で書いて/);

    // With no `lang`, the runtime keeps auto-detecting rather than freezing one.
    const cfg = await loadConfig(dir);
    assert.ok(cfg.lang === 'en' || cfg.lang === 'ja');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a second init keeps existing files and uses the language in the config', async () => {
  const dir = await project();
  try {
    await init(dir, ['first', '--lang', 'en']);
    await writeFile(join(dir, 'modelroom', 'rooms', 'first', 'BRIEF.md'), 'kept\n');
    await init(dir, ['first']);

    assert.equal(
      await readFile(join(dir, 'modelroom', 'rooms', 'first', 'BRIEF.md'), 'utf8'),
      'kept\n',
    );

    const second = await init(dir, ['second']);
    assert.match(second.stdout, /language  en/);
    assert.match(
      await readFile(join(dir, 'modelroom', 'rooms', 'second', 'BRIEF.md'), 'utf8'),
      /One sentence/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--force overwrites a room template without touching the config language', async () => {
  const dir = await project();
  try {
    await init(dir, ['first', '--lang', 'ja']);
    await writeFile(join(dir, 'modelroom', 'rooms', 'first', 'BRIEF.md'), 'mine\n');
    await init(dir, ['first', '--force']);

    assert.match(
      await readFile(join(dir, 'modelroom', 'rooms', 'first', 'BRIEF.md'), 'utf8'),
      /次に読む人/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the old root config keeps the old layout', async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, 'modelroom.json'), JSON.stringify({ rooms: 'rooms' }));
    await init(dir, ['checkout', '--lang', 'en']);

    assert.ok(await readFile(join(dir, 'AGENTS.md'), 'utf8'));
    assert.ok(await readFile(join(dir, 'rooms', 'checkout', 'BRIEF.md'), 'utf8'));
    assert.equal(JSON.parse(await readFile(join(dir, 'modelroom.json'), 'utf8')).lang, 'en');
    await assert.rejects(readFile(join(dir, 'modelroom', 'modelroom.json')), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('init from inside modelroom/ puts the state at the project root', async () => {
  const dir = await project();
  try {
    await init(dir, ['checkout', '--lang', 'ja']);
    const inside = join(dir, 'modelroom');
    await init(inside, ['second']);

    assert.ok(await readFile(join(inside, 'rooms', 'second', 'BRIEF.md'), 'utf8'));
    assert.ok(await readFile(join(dir, '.gitignore'), 'utf8'));
    assert.equal(
      JSON.parse(await readFile(join(inside, 'modelroom.json'), 'utf8')).state,
      '../.modelroom',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
