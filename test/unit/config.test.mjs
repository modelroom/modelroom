import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, applySettings, loadConfig, loadState, saveState } from '../../lib/config.ts';

async function fixture(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'mr-config-'));
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(dir, name), text);
  }
  return dir;
}

test('defaults are used when modelroom.json is missing', async () => {
  const dir = await fixture();
  try {
    const cfg = await loadConfig(dir);
    assert.equal(cfg.rootDir, dir);
    assert.equal(cfg.roomsDir, join(dir, DEFAULTS.rooms));
    assert.equal(cfg.artifact, 'index.html');
    assert.deepEqual(cfg.docs, ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md']);
    assert.equal(cfg.port, 4321);
    assert.equal(cfg.agent.adapter, 'opencode');
    assert.equal(cfg.agent.model, null);
    assert.equal(cfg.statePath, join(dir, '.modelroom', 'state.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the new layout is found inside modelroom/ and paths resolve from the config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-config-'));
  await mkdir(join(dir, 'modelroom'), { recursive: true });
  await writeFile(
    join(dir, 'modelroom', 'modelroom.json'),
    JSON.stringify({
      root: '.',
      rooms: 'rooms',
      state: '../.modelroom',
      lang: 'ja',
    }),
  );
  try {
    const cfg = await loadConfig(dir);
    assert.equal(cfg.configPath, join(dir, 'modelroom', 'modelroom.json'));
    assert.equal(cfg.rootDir, join(dir, 'modelroom'));
    assert.equal(cfg.roomsDir, join(dir, 'modelroom', 'rooms'));
    assert.equal(cfg.stateDir, join(dir, '.modelroom'));
    assert.equal(cfg.statePath, join(dir, '.modelroom', 'state.json'));
    assert.equal(cfg.lang, 'ja');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the root config wins when both layouts exist, so an old project does not move', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-config-'));
  await mkdir(join(dir, 'modelroom'), { recursive: true });
  await writeFile(join(dir, 'modelroom.json'), JSON.stringify({ rooms: 'old' }));
  await writeFile(
    join(dir, 'modelroom', 'modelroom.json'),
    JSON.stringify({ rooms: 'new', lang: 'ja' }),
  );
  try {
    const cfg = await loadConfig(dir);
    assert.equal(cfg.configPath, join(dir, 'modelroom.json'));
    assert.equal(cfg.roomsDir, join(dir, 'old'));
    assert.equal(cfg.lang, 'en');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an unknown language falls back to English', async () => {
  const dir = await fixture({ 'modelroom.json': JSON.stringify({ lang: 'fr' }) });
  try {
    const cfg = await loadConfig(dir);
    assert.equal(cfg.lang, 'en');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('modelroom.json overrides defaults, and agent values merge one by one', async () => {
  const dir = await fixture({
    'modelroom.json': JSON.stringify({
      root: '.',
      rooms: 'screens',
      port: 5000,
      docs: ['BRIEF.md'],
      agent: { adapter: 'command', command: 'claude', model: 'sonnet' },
    }),
  });
  try {
    const cfg = await loadConfig(dir);
    assert.equal(cfg.roomsDir, join(dir, 'screens'));
    assert.equal(cfg.port, 5000);
    assert.deepEqual(cfg.docs, ['BRIEF.md']);
    assert.equal(cfg.agent.adapter, 'command');
    assert.equal(cfg.agent.command, 'claude');
    assert.equal(cfg.agent.model, 'sonnet');
    assert.equal(cfg.agent.agent, DEFAULTS.agent.agent); // untouched default
    assert.deepEqual(cfg.agent.args, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a broken config file falls back to defaults', async () => {
  const dir = await fixture({ 'modelroom.json': '{ nope' });
  try {
    const cfg = await loadConfig(dir);
    assert.equal(cfg.port, 4321);
    assert.deepEqual(cfg.docs, ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('applySettings accepts only the whitelisted shape', async () => {
  const dir = await fixture();
  try {
    const cfg = await loadConfig(dir);
    const applied = applySettings(cfg, {
      model: 'openrouter/x',
      agent: 'plan',
      adapter: 'command',
      command: 'codex',
      standalone: false,
    });
    assert.deepEqual(applied, {
      model: 'openrouter/x',
      agent: 'plan',
      adapter: 'command',
      command: 'codex',
      standalone: false,
    });
    assert.equal(cfg.agent.model, 'openrouter/x');
    assert.equal(cfg.agent.standalone, false);

    const rejected = applySettings(cfg, { adapter: 'nope', command: '', model: 42 });
    assert.deepEqual(rejected, {});
    assert.equal(cfg.agent.adapter, 'command');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('state round-trips and missing state reads as empty', async () => {
  const dir = await fixture();
  try {
    const cfg = await loadConfig(dir);
    assert.deepEqual(await loadState(cfg), { sessions: {}, settings: {} });

    await saveState(cfg, { sessions: { 'sign-in': 'ses_1' }, settings: { theme: 'dark' } });
    assert.deepEqual(await loadState(cfg), {
      sessions: { 'sign-in': 'ses_1' },
      settings: { theme: 'dark' },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
