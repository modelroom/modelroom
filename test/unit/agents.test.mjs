import { test } from 'vitest';
import assert from 'node:assert/strict';
import { adapters, command, getAdapter, opencode, stripAnsi } from '../../server/agents/index.ts';

test('stripAnsi removes colour codes and keeps the text', () => {
  assert.equal(stripAnsi('\u001b[31mred\u001b[0m plain'), 'red plain');
  assert.equal(stripAnsi('no codes'), 'no codes');
});

test('adapters are reached by name, and an unknown name falls back to opencode', () => {
  assert.equal(getAdapter('command'), command);
  assert.equal(getAdapter('opencode'), opencode);
  assert.equal(getAdapter('nope'), opencode);
  assert.deepEqual(Object.keys(adapters).sort(), ['command', 'opencode']);
});

test('only the adapter whose turn is readable while it runs says so', () => {
  // the chat follows the turn when the agent keeps it somewhere it can be read
  assert.equal(opencode.structured, true);
  assert.equal(command.structured, false);
});

test('session ids are unique and prefixed', () => {
  const a = opencode.newSessionId();
  const b = opencode.newSessionId();
  assert.match(a, /^ses_[a-z0-9]+$/);
  assert.notEqual(a, b);
});

test('a failed spawn reports the exit exactly once', async () => {
  const calls = [];
  await new Promise((resolve) => {
    command.run({
      cfg: {
        agent: {
          adapter: 'command',
          command: 'modelroom-no-such-binary-xyz',
          model: null,
          agent: 'build',
          standalone: false,
          args: [],
        },
      },
      cwd: process.cwd(),
      prompt: 'hi',
      sessionId: 'ses_test',
      onChunk: () => {},
      onExit: (code, err) => {
        calls.push([code, err]);
        resolve();
      },
    });
  });
  await new Promise((r) => setTimeout(r, 100)); // let a second `error`/`close` callback arrive, if any
  assert.equal(calls.length, 1, 'onExit must be called once');
  assert.equal(calls[0][0], -1);
});
