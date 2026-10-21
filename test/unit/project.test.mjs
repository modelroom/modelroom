// modelroom — how a project runs modelroom.
//
// The command that ends up in the layer's AGENTS.md, on the CLI's `next:` line
// and in the update notice. All three have to be the *project's* command, so
// this holds the manager's own spelling — a pnpm project must never be handed
// an `npm` command.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectCommands } from '../../core/project.ts';

const SHOP = `${JSON.stringify({ name: 'shop', scripts: { modelroom: 'modelroom' } }, null, 2)}\n`;
const NO_SCRIPT = `${JSON.stringify({ name: 'shop' }, null, 2)}\n`;

/** A project root: the state lives in `<dir>/.modelroom`, so the root is `dir`. */
async function project(files) {
  const dir = await mkdtemp(join(tmpdir(), 'mr-project-'));
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return { dir, cfg: { stateDir: join(dir, '.modelroom') } };
}

async function withProject(files, run) {
  const { dir, cfg } = await project(files);
  try {
    await run(await projectCommands(cfg));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a project with the script runs its own manager', async () => {
  await withProject({ 'package.json': SHOP }, (commands) => {
    assert.equal(commands.cli, 'npm run modelroom');
    assert.equal(commands.cliLatest, 'npx modelroom@latest');
    // Install the new one, then let *that* copy refresh what it generated.
    assert.equal(
      commands.update,
      'npm install --save-dev modelroom@latest && npm run modelroom update',
    );
  });
});

test('the manager is the project’s own, lockfile and all', async () => {
  await withProject({ 'package.json': SHOP, 'pnpm-lock.yaml': '' }, (commands) => {
    assert.equal(commands.cli, 'pnpm modelroom');
    assert.equal(commands.cliLatest, 'pnpm dlx modelroom@latest');
    assert.equal(commands.update, 'pnpm add --save-dev modelroom@latest && pnpm modelroom update');
  });
  await withProject({ 'package.json': SHOP, 'yarn.lock': '' }, (commands) => {
    assert.equal(commands.cli, 'yarn modelroom');
    assert.equal(commands.update, 'yarn add --dev modelroom@latest && yarn modelroom update');
  });
  await withProject({ 'package.json': SHOP, 'bun.lock': '' }, (commands) => {
    assert.equal(commands.cli, 'bun run modelroom');
    assert.equal(commands.update, 'bun add --dev modelroom@latest && bun run modelroom update');
  });
});

test('without the script, the registry is the only way in', async () => {
  await withProject({ 'package.json': NO_SCRIPT }, (commands) => {
    assert.equal(commands.cli, 'npx modelroom');
    // `@latest` fetches the new version itself, so there is nothing to install first.
    assert.equal(commands.update, 'npx modelroom@latest update');
  });
  await withProject({}, (commands) => {
    assert.equal(commands.cli, 'npx modelroom');
    assert.equal(commands.update, 'npx modelroom@latest update');
  });
});
