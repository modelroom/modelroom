// modelroom — the install path, end to end.
//
// `init` is the only command that writes a project, so this exercises it in a
// throwaway directory: the two-directory layout, the chosen language, the
// gitignore line, idempotence, and the old layout staying where it was.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../core/config.ts';

const run = promisify(execFile);
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(pkgDir, 'bin', 'modelroom.ts');

/** The version this checkout reports — `init` pins it, so the tests must not. */
const { version } = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'));

/** A project with no package manager on PATH: an install, if attempted, fails. */
const noPackageManager = { PATH: '/nonexistent' };

async function project() {
  return mkdtemp(join(tmpdir(), 'mr-init-'));
}

async function init(cwd, args, env = {}) {
  return run(process.execPath, [cli, 'init', ...args], {
    cwd,
    env: { ...process.env, CI: '1', LANG: 'en_US.UTF-8', ...env },
  });
}

/** Every file under dir, as text — for "a second init writes nothing at all". */
async function snapshot(dir, prefix = '') {
  const files = {};
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, await snapshot(dir, rel));
    else files[rel] = await readFile(join(dir, rel), 'utf8');
  }
  return files;
}

const shop = (extra = {}) => JSON.stringify({ name: 'shop', ...extra }, null, 2) + '\n';

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
    assert.match(await readFile(join(dir, 'modelroom', 'DESIGN.md'), 'utf8'), /デザインシステム/);
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

// ── the script that makes `npm run modelroom` work ──────────────────────────

test('init adds one script to an existing package.json, and nothing else', async () => {
  const dir = await project();
  try {
    await writeFile(
      join(dir, 'package.json'),
      '{\n  "name": "shop",\n  "scripts": {\n    "dev": "vite"\n  }\n}\n',
    );
    const result = await init(dir, ['checkout', '--skip-install']);

    // The rest of the manifest survives byte for byte.
    assert.equal(
      await readFile(join(dir, 'package.json'), 'utf8'),
      '{\n  "name": "shop",\n  "scripts": {\n    "dev": "vite",\n    "modelroom": "npx --yes modelroom"\n  }\n}\n',
    );
    assert.match(result.stdout, /package\.json \(\+ scripts\.modelroom/);
    assert.match(result.stdout, /dependencies {2}skipped \(--skip-install\)/);
    assert.match(result.stdout, /npm run modelroom/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a second init writes nothing at all', async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, 'package.json'), shop());
    await init(dir, ['checkout', '--skip-install']);
    const before = await snapshot(dir);
    assert.equal(before['.gitignore'], '/.modelroom/\n');
    assert.match(before['package.json'], /"modelroom": "npx --yes modelroom"/);

    await init(dir, ['checkout', '--skip-install']);
    assert.deepEqual(await snapshot(dir), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an existing modelroom script is kept; --force replaces it', async () => {
  const dir = await project();
  try {
    await writeFile(
      join(dir, 'package.json'),
      shop({ scripts: { modelroom: 'node bin/modelroom.ts' } }),
    );

    const first = await init(dir, ['checkout', '--skip-install'], noPackageManager);
    assert.match(first.stdout, /skip {2}package\.json scripts\.modelroom \(exists\)/);
    assert.doesNotMatch(first.stdout, /could not install/); // nothing was installed either
    assert.equal(
      JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).scripts.modelroom,
      'node bin/modelroom.ts',
    );

    await init(dir, ['checkout', '--force', '--skip-install'], noPackageManager);
    assert.equal(
      JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).scripts.modelroom,
      'npx --yes modelroom',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an installed dependency means a local script and no install', async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, 'package.json'), shop({ devDependencies: { modelroom: '^0.1.0' } }));
    const result = await init(dir, ['checkout'], noPackageManager);

    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.modelroom, 'modelroom');
    assert.equal(pkg.devDependencies.modelroom, '^0.1.0');
    assert.doesNotMatch(result.stdout, /npm install/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a pnpm project is told to run pnpm, not npx', async () => {
  const dir = await project();
  try {
    // A pnpm project: a lockfile, and the devEngines pin that makes npm refuse.
    await writeFile(join(dir, 'pnpm-lock.yaml'), '');
    await writeFile(
      join(dir, 'package.json'),
      shop({
        devEngines: {
          packageManager: { name: 'pnpm', version: '^11.9.0', onFail: 'download' },
        },
      }),
    );
    const result = await init(dir, ['checkout', '--skip-install']);

    // The generated files name the project's command, so the agent never trips
    // npm's devEngines check.
    const agents = await readFile(join(dir, 'modelroom', 'AGENTS.md'), 'utf8');
    assert.match(agents, /pnpm modelroom render <room>/);
    assert.doesNotMatch(agents, /npx modelroom/);
    const skill = await readFile(
      join(dir, 'modelroom', '.agents', 'skills', 'manage-modelroom-rooms', 'SKILL.md'),
      'utf8',
    );
    assert.match(skill, /pnpm modelroom add <room>/);
    assert.match(skill, /pnpm dlx modelroom@latest update/);
    // The script `--skip-install` writes is the manager's own runner too.
    assert.equal(
      JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).scripts.modelroom,
      'pnpm dlx modelroom',
    );
    assert.match(result.stdout, /pnpm modelroom/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update names the project manager even when the files were generated for another', async () => {
  const dir = await project();
  try {
    // Generated first for npm, with no lockfile anywhere.
    await writeFile(join(dir, 'package.json'), shop());
    await init(dir, ['checkout', '--skip-install']);
    assert.match(await readFile(join(dir, 'modelroom', 'AGENTS.md'), 'utf8'), /npm run modelroom/);

    await writeFile(join(dir, 'pnpm-lock.yaml'), '');
    await run(process.execPath, [cli, 'update'], {
      cwd: dir,
      env: { ...process.env, CI: '1', LANG: 'en_US.UTF-8' },
    });

    const agents = await readFile(join(dir, 'modelroom', 'AGENTS.md'), 'utf8');
    assert.match(agents, /pnpm modelroom render <room>/);
    assert.doesNotMatch(agents, /npx modelroom/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a failed install falls back to the npx script and init still succeeds', async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, 'package.json'), shop());
    const result = await init(dir, ['checkout'], noPackageManager);

    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.modelroom, 'npx --yes modelroom');
    assert.equal(pkg.devDependencies, undefined);
    // The message carries the version this checkout reports, so a release bump
    // does not break it.
    const spec = `modelroom@^${version}`;
    assert.ok(result.stdout.includes(`could not install ${spec} with npm`));
    assert.ok(result.stdout.includes(`npm install --save-dev ${spec}`));
    assert.match(
      await readFile(join(dir, 'modelroom', 'rooms', 'checkout', 'BRIEF.md'), 'utf8'),
      /One sentence/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('init never creates a package.json', async () => {
  const dir = await project();
  try {
    await init(dir, ['checkout', '--skip-install']);
    await assert.rejects(readFile(join(dir, 'package.json')), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--no-script keeps init out of the package.json', async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, 'package.json'), shop());
    const result = await init(dir, ['checkout', '--no-script', '--skip-install']);

    assert.equal(await readFile(join(dir, 'package.json'), 'utf8'), shop());
    assert.doesNotMatch(result.stdout, /package\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a package.json that cannot be read as JSON is left alone', async () => {
  const dir = await project();
  try {
    await writeFile(join(dir, 'package.json'), '{ "name": "shop",\n');
    const result = await init(dir, ['checkout', '--skip-install']);

    assert.match(result.stdout, /package\.json could not be read as JSON/);
    assert.equal(await readFile(join(dir, 'package.json'), 'utf8'), '{ "name": "shop",\n');
    assert.ok(await readFile(join(dir, 'modelroom', 'rooms', 'checkout', 'BRIEF.md'), 'utf8'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the script goes to the project root, even from inside modelroom/', async () => {
  const dir = await project();
  try {
    await init(dir, ['checkout', '--skip-install']);
    await writeFile(join(dir, 'package.json'), shop());

    await init(join(dir, 'modelroom'), ['second', '--skip-install']);

    assert.equal(
      JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')).scripts.modelroom,
      'npx --yes modelroom',
    );
    await assert.rejects(readFile(join(dir, 'modelroom', 'package.json')), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a flag before the room name is a flag, not its value', async () => {
  const dir = await project();
  try {
    await init(dir, ['--skip-install', 'checkout']);

    assert.ok(await readFile(join(dir, 'modelroom', 'rooms', 'checkout', 'BRIEF.md'), 'utf8'));
    await assert.rejects(readFile(join(dir, 'modelroom', 'rooms', 'hello', 'BRIEF.md')), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
