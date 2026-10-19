// modelroom — a turn, as parts.
//
// The shapes below are trimmed from what the opencode session API actually
// returns (`GET /api/session/<id>/message`): a `text` part, a `reasoning` part,
// a `tool` part with input/content/metadata, and an `edit` part carrying the
// patch it wrote. The normalizer has to survive all of them — and the CLI's
// stdout, which it never sees.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { parseParts, summarise, toTurns } from '../../shared/parts.ts';

const shell = {
  type: 'tool',
  id: 'call_shell',
  name: 'shell',
  executed: false,
  time: { created: 3, ran: 4, completed: 5 },
  state: {
    status: 'completed',
    input: { command: 'npm test\nnpm run build' },
    content: [{ type: 'text', text: 'Tests  67 passed' }],
    metadata: { status: 'completed', truncated: false, exit: 0 },
  },
};

const edit = {
  type: 'tool',
  id: 'call_edit',
  name: 'edit',
  state: {
    status: 'completed',
    input: {
      path: '/repo/client/dashboard/DashboardApp.tsx',
      oldString: 'const a = 1;',
      newString: 'const a = 2;',
    },
    content: [{ type: 'text', text: 'Edited DashboardApp.tsx (1 replacement)' }],
    metadata: {
      truncated: false,
      files: [
        {
          file: 'client/dashboard/DashboardApp.tsx',
          patch:
            'Index: client/dashboard/DashboardApp.tsx\n@@ -1,1 +1,1 @@\n-const a = 1;\n+const a = 2;',
        },
      ],
    },
  },
};

test('text and reasoning parts pass through, empties are dropped', () => {
  const parts = parseParts({
    content: [
      { type: 'text', text: 'Here is what I found.' },
      { type: 'text', text: '   ' },
      { type: 'reasoning', text: 'Let me check the config first.' },
      { type: 'reasoning', text: '' },
    ],
  });
  assert.deepEqual(parts, [
    { kind: 'text', text: 'Here is what I found.' },
    { kind: 'reasoning', text: 'Let me check the config first.' },
  ]);
});

test('a shell call carries its command, output and exit code', () => {
  const [part] = parseParts({ content: [shell] });
  assert.equal(part.kind, 'tool');
  assert.equal(part.name, 'shell');
  assert.equal(part.status, 'completed');
  // the row says what it ran; the whole command lives in the body
  assert.equal(part.summary, 'npm test');
  assert.equal(part.output, 'Tests  67 passed');
  assert.equal(part.exit, 0);
  assert.equal(part.truncated, false);
  assert.deepEqual(part.files, []);
});

test('an edit call carries the patch opencode produced', () => {
  const [part] = parseParts({ content: [edit] });
  assert.equal(part.summary, '/repo/client/dashboard/DashboardApp.tsx');
  assert.deepEqual(part.files, [
    {
      file: 'client/dashboard/DashboardApp.tsx',
      patch:
        'Index: client/dashboard/DashboardApp.tsx\n@@ -1,1 +1,1 @@\n-const a = 1;\n+const a = 2;',
    },
  ]);
});

test('a call with no id still gets a stable one', () => {
  const message = { content: [{ type: 'tool', name: 'shell', state: { status: 'completed' } }] };
  assert.equal(parseParts(message)[0].id, 'tool-0');
  assert.equal(parseParts(message)[0].id, 'tool-0');
});

test('a failing tool is not a completed one', () => {
  const [part] = parseParts({
    content: [
      {
        type: 'tool',
        id: 'c',
        name: 'shell',
        state: { status: 'error', input: { command: 'false' }, metadata: { exit: 1 } },
      },
    ],
  });
  assert.equal(part.status, 'error');
  assert.equal(part.exit, 1);
});

test('a running tool says so', () => {
  const [part] = parseParts({
    content: [
      { type: 'tool', id: 'c', name: 'read', state: { status: 'running', input: { path: '/x' } } },
    ],
  });
  assert.equal(part.status, 'running');
  assert.equal(part.summary, '/x');
});

test('an unknown tool still gets a row, from its input keys', () => {
  assert.equal(summarise('mystery', { alpha: 'a', beta: 'b' }), 'alpha, beta');
  assert.equal(summarise('mystery', {}), null);
  assert.equal(summarise('grep', { pattern: 'TODO' }), 'TODO');
});

test('a truncation flag survives', () => {
  const [part] = parseParts({
    content: [
      {
        type: 'tool',
        id: 'c',
        name: 'shell',
        state: {
          status: 'completed',
          input: { command: 'yes' },
          content: [{ type: 'text', text: 'x'.repeat(9000) }],
          metadata: { truncated: true, exit: 0 },
        },
      },
    ],
  });
  assert.equal(part.truncated, true);
  assert.ok(part.output.endsWith('…'));
  assert.ok(part.output.length <= 4001);
});

test('consecutive assistant messages are one turn, so one prompt reads as one answer', () => {
  const turns = toTurns([
    { type: 'assistant', time: { created: 2 }, content: [{ type: 'text', text: 'first step' }] },
    { type: 'idle', time: { created: 3 } },
    { type: 'assistant', time: { created: 4 }, content: [shell, { type: 'text', text: 'done' }] },
    { type: 'user', time: { created: 5 }, text: 'now change the title' },
    { type: 'assistant', time: { created: 1 }, content: [{ type: 'text', text: 'earlier' }] },
  ]);
  // every step of one answer is one turn
  assert.deepEqual(
    turns.map((turn) => turn.role),
    ['assistant', 'user'],
  );
  assert.equal(turns[0].parts.length, 4); // text + text + shell + text
  // ordered by `time.created`, not by the order the API happened to list them
  assert.equal(turns[0].parts[0].text, 'earlier');
  assert.equal(turns[0].parts.at(-1).text, 'done');
  assert.equal(turns[1].parts[0].text, 'now change the title');
});

test('an assistant message with nothing in it is not a turn', () => {
  const turns = toTurns([
    { type: 'assistant', time: { created: 1 }, content: [] },
    { type: 'assistant', time: { created: 2 }, content: [{ type: 'text', text: '   ' }] },
  ]);
  assert.deepEqual(turns, []);
});

test('a user message with no text is dropped', () => {
  assert.deepEqual(toTurns([{ type: 'user', time: { created: 1 }, text: '  ' }]), []);
});

test('a message without content does not throw', () => {
  assert.deepEqual(parseParts({}), []);
  assert.deepEqual(parseParts({ content: 'not a list' }), []);
  assert.deepEqual(toTurns([null, 42, 'nope']), []);
});
