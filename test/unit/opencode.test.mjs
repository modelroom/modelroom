import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sessionParts, sessionView, watchParts } from '../../server/opencode.ts';

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

// ── the answer that is still being written ───────────────────────────────────
//
// The watcher is what makes the chat live: while the agent works, the session on
// its own server already describes the turn, so reading it back is a view of the
// answer in parts. These fakes answer each call with the *next* payload, which is
// how a turn actually grows.

/** A fake `opencode` that answers each call with the next payload, then repeats. */
async function fakeSequence(dir, responses) {
  const file = join(dir, 'fake-seq.mjs');
  const counter = join(dir, 'seq-count');
  const src =
    '#!/usr/bin/env node\n' +
    "import { readFileSync, writeFileSync } from 'node:fs';\n" +
    `let n = 0; try { n = Number(readFileSync(${JSON.stringify(counter)}, 'utf8')) || 0; } catch {}\n` +
    `writeFileSync(${JSON.stringify(counter)}, String(n + 1));\n` +
    `const pick = ${JSON.stringify(responses)}[Math.min(n, ${responses.length - 1})];\n` +
    'process.stdout.write(JSON.stringify(pick) + "\\n");\n';
  await writeFile(file, src);
  await chmod(file, 0o755);
  return { command: file };
}

const session = (messages) => ({ data: messages });
const user = (created) => ({ id: `u${created}`, type: 'user', text: 'do it', time: { created } });
const step = (created, content) => ({
  id: `m${created}`,
  type: 'assistant',
  time: { created },
  content,
});
const toolRun = {
  type: 'tool',
  id: 'c1',
  name: 'shell',
  state: { status: 'running', input: { command: 'npm test' } },
};
const toolDone = {
  type: 'tool',
  id: 'c1',
  name: 'shell',
  state: { status: 'completed', input: { command: 'npm test' } },
};

async function waitFor(predicate, ms = 5000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timed out waiting for the watcher');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('sessionParts is the answer in flight: every step of it, and its own clock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-oc-'));
  try {
    const { command } = await fakeSequence(dir, [
      session([
        user(10),
        step(20, [{ type: 'text', text: 'looking' }, toolRun]),
        step(30, [{ type: 'text', text: 'done' }]),
      ]),
    ]);
    const snap = await sessionParts({ agent: { command }, rootDir: dir }, 'ses_test');
    // one answer over several steps is one list of parts
    assert.deepEqual(
      snap.parts.map((part) => part.kind),
      ['text', 'tool', 'text'],
    );
    assert.equal(snap.parts[1].status, 'running'); // caught mid-flight
    assert.equal(snap.created, 30); // the newest step, not the first
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a step that has nothing in it yet is not the answer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-oc-'));
  try {
    const { command } = await fakeSequence(dir, [
      session([
        user(10),
        step(20, [{ type: 'text', text: 'the previous answer' }]),
        // opencode can create the message before it fills it: the clock must come
        // from the last step that says something, or a new run opens on the old reply
        step(40, []),
      ]),
    ]);
    const snap = await sessionParts({ agent: { command }, rootDir: dir }, 'ses_test');
    assert.equal(snap.created, 20);
    assert.deepEqual(snap.parts, [{ kind: 'text', text: 'the previous answer' }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sessionParts is null while the answer has not started', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-oc-'));
  try {
    const { command } = await fakeSequence(dir, [session([user(10)])]);
    assert.equal(await sessionParts({ agent: { command }, rootDir: dir }, 'ses_test'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('sessionParts is null when opencode cannot be reached', async () => {
  const parts = await sessionParts(
    { agent: { command: 'modelroom-no-such-binary-xyz' }, rootDir: process.cwd() },
    'ses_x',
  );
  assert.equal(parts, null);
});

test('watchParts hands over each move of the turn, and nothing twice', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-oc-'));
  try {
    const { command } = await fakeSequence(dir, [
      session([user(1), step(10, [{ type: 'text', text: 'the previous answer' }])]),
      session([user(1), step(20, [toolRun])]),
      session([user(1), step(20, [toolDone, { type: 'text', text: 'all green' }])]),
    ]);
    const seen = [];
    const watcher = watchParts(
      { agent: { command }, rootDir: dir },
      'ses_test',
      (parts) => seen.push(parts),
      { since: 15, intervalMs: 20 },
    );

    await waitFor(() => seen.length >= 2);
    await watcher.stop(); // the last snapshot is taken here

    // the previous answer is skipped, then each move of the new one arrives
    assert.equal(seen[0][0].status, 'running');
    assert.equal(seen[1][0].status, 'completed');
    assert.equal(seen[1][1].text, 'all green');
    assert.equal(seen.length, 2, 'the final snapshot is not handed over twice');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the answer before the prompt is never handed over, however long it looks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-oc-'));
  try {
    const stale = session([user(1), step(10, [{ type: 'text', text: 'the previous answer' }])]);
    const fresh = session([user(1), step(20, [{ type: 'text', text: 'the new answer' }])]);
    // the first looks find the answer from the last prompt; only the third is ours
    const { command } = await fakeSequence(dir, [stale, stale, fresh]);
    const seen = [];
    const watcher = watchParts(
      { agent: { command }, rootDir: dir },
      'ses_test',
      (parts) => seen.push(parts),
      { since: 15, intervalMs: 20 },
    );

    // it is still looking several polls later — that is what makes this a real check
    await waitFor(() => seen.length >= 1);
    await watcher.stop();
    assert.deepEqual(seen, [[{ kind: 'text', text: 'the new answer' }]]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('watchParts gives up quietly when the API is not answering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-oc-'));
  try {
    let emitted = 0;
    const watcher = watchParts(
      { agent: { command: 'modelroom-no-such-binary-xyz' }, rootDir: dir },
      'ses_test',
      () => {
        emitted += 1;
      },
      { since: 0, intervalMs: 10 },
    );
    await sleep(200);
    await watcher.stop(); // must resolve rather than hang on a server that never answers
    assert.equal(emitted, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
