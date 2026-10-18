import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionView } from '../../lib/opencode.ts';

// A fake `opencode` that answers the API paths sessionView reads.
const RESPONSES = {
  '/api/session/ses_test': {
    data: {
      id: 'ses_test',
      cost: 0.5,
      tokens: { input: 1000, output: 200, reasoning: 50, cache: { read: 3000, write: 0 } },
      outcome: 'succeeded',
      model: { id: 'openrouter/deepseek/deepseek-v4.1-flash' },
      location: { directory: '/tmp/room' },
    },
  },
  '/api/session/ses_test/message': {
    data: [
      {
        id: 'm1',
        time: { created: 2 },
        type: 'assistant',
        tokens: { input: 1000, output: 200, reasoning: 50, cache: { read: 3000, write: 0 } },
        content: [
          { type: 'text', text: 'hello' },
          { type: 'tool', name: 'shell', state: { status: 'completed' } },
          { type: 'reasoning', text: 'hidden thinking' },
        ],
      },
      { id: 'm0', time: { created: 1 }, type: 'user', text: 'タイトルを変えて' },
    ],
  },
  '/api/model': {
    data: [{ id: 'openrouter/deepseek/deepseek-v4.1-flash', limit: { context: 10000 } }],
  },
  '/api/mcp': { data: [{ name: 'notion', status: { status: 'failed', error: 'timeout' } }] },
  '/api/skill': {
    data: [
      { id: 'opencode', name: 'OpenCode' },
      { id: 'x', name: 'X' },
    ],
  },
};

async function fakeOpencode(dir) {
  const file = join(dir, 'fake-opencode.mjs');
  const src =
    '#!/usr/bin/env node\n' +
    `const path = process.argv.slice(2).pop();\n` +
    `const r = ${JSON.stringify(RESPONSES)};\n` +
    `process.stdout.write(JSON.stringify(r[path] ?? null) + "\\n");\n`;
  await writeFile(file, src);
  await chmod(file, 0o755);
  return file;
}

test('sessionView normalizes an opencode session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-oc-'));
  try {
    const command = await fakeOpencode(dir);
    const view = await sessionView({ agent: { command }, rootDir: dir }, 'ses_test');
    assert.equal(view.stats.cost, 0.5);
    assert.equal(view.stats.outcome, 'succeeded');
    assert.equal(view.stats.model, 'openrouter/deepseek/deepseek-v4.1-flash');
    assert.equal(view.stats.tokens.cacheRead, 3000);
    // context = last turn's fresh input + cache reads
    assert.deepEqual(view.context, { used: 4000, limit: 10000, pct: 40 });
    assert.deepEqual(view.turns, [
      { role: 'user', parts: [{ kind: 'text', text: 'タイトルを変えて' }] },
      {
        role: 'assistant',
        parts: [
          { kind: 'text', text: 'hello' },
          {
            kind: 'tool',
            id: 'tool-1',
            name: 'shell',
            status: 'completed',
            summary: null,
            files: [],
            output: null,
            exit: null,
            truncated: false,
          },
          { kind: 'reasoning', text: 'hidden thinking' },
        ],
      },
    ]);
    assert.equal(view.mcp[0].name, 'notion');
    assert.equal(view.mcp[0].error, 'timeout');
    assert.deepEqual(view.skills, ['OpenCode', 'X']);
    assert.equal(view.workspace, '/tmp/room');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sessionView is null when opencode cannot be reached', async () => {
  const view = await sessionView(
    { agent: { command: 'modelroom-no-such-binary-xyz' }, rootDir: process.cwd() },
    'ses_x',
  );
  assert.equal(view, null);
});
