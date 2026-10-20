// modelroom — driving an opencode turn through the server API.
//
// The turn is followed on a server, not on a process: the driver polls the
// session, surfaces the agent's question as an `Ask`, answers the permission
// requests `--auto` would, and ends when the session goes idle. A fake `Api` is
// enough — the driver never knows whether it is talking to opencode or a stub.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { startTurn, toAsk, toFormAnswer } from '../../server/opencode-turn.ts';

const FORM = {
  id: 'frm_1',
  title: 'Questions',
  metadata: { kind: 'question', tool: { messageID: 'msg_1', id: 'call_1' } },
  fields: [
    {
      key: 'q0',
      title: 'Spacing',
      description: 'Which scale?',
      type: 'string',
      options: [{ value: 'A', label: 'A', description: 'compact' }],
      custom: true,
    },
    {
      key: 'q1',
      title: 'States',
      description: 'Which states?',
      type: 'multiselect',
      options: [{ value: 'Loading', label: 'Loading' }],
    },
  ],
};

const CFG = {
  rootDir: '/tmp',
  lang: 'en',
  agent: { agent: 'build', model: 'openrouter/deepseek/deepseek-v4.1-flash' },
};

function fakeApi() {
  const state = { messages: [], forms: [], permissions: [], calls: [] };
  return {
    state,
    get: async (path) => {
      if (path.endsWith('/message')) return { data: state.messages };
      if (path.endsWith('/form')) return { data: state.forms };
      if (path.endsWith('/permission')) return { data: state.permissions };
      if (path.startsWith('/api/session/')) return { data: { id: 'ses_1' } };
      return null;
    },
    post: async (path, body) => {
      state.calls.push([path, body]);
      return {};
    },
    del: async (path) => {
      state.calls.push([path, null]);
      return {};
    },
  };
}

const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

test('an opencode form becomes the driver-agnostic Ask', () => {
  const ask = toAsk(FORM);
  assert.equal(ask.id, 'frm_1');
  assert.equal(ask.title, 'Questions');
  assert.equal(ask.questions.length, 2);
  assert.equal(ask.questions[0].key, 'q0');
  assert.equal(ask.questions[0].header, 'Spacing');
  assert.equal(ask.questions[0].question, 'Which scale?');
  assert.deepEqual(ask.questions[0].options, [{ label: 'A', description: 'compact' }]);
  assert.equal(ask.questions[0].multiple, false);
  assert.equal(ask.questions[1].multiple, true);
  assert.equal(ask.source.callID, 'call_1');
});

test('a form with nothing a person can answer is not shown', () => {
  assert.equal(toAsk({ id: 'frm_2', fields: [{ key: 'n', type: 'number' }] }), null);
  assert.equal(toAsk(null), null);
});

test('the answer goes back in opencode shape: string for one, array for many', () => {
  assert.deepEqual(toFormAnswer(FORM, { q0: ['A'], q1: ['Loading', 'Error'] }), {
    q0: 'A',
    q1: ['Loading', 'Error'],
  });
});

test('a typed answer is the one choice, and blank answers are dropped', () => {
  assert.deepEqual(toFormAnswer(FORM, { q0: ['something else'], q1: [] }), {
    q0: 'something else',
  });
});

test('a turn follows parts, answers a question, and ends when the session is idle', async () => {
  const api = fakeApi();
  const parts = [];
  const asks = [];
  let exit = null;

  const turn = await startTurn({
    cfg: CFG,
    api,
    sessionId: 'ses_1',
    prompt: 'hello',
    since: 100,
    intervalMs: 5,
    callbacks: {
      onParts: (next) => parts.push(next),
      onAsk: (ask) => asks.push(ask),
      onAskDone: () => {},
      onExit: (code) => {
        exit = code;
      },
    },
  });
  assert.ok(turn, 'the turn should start');

  // The agent writes a part, then asks.
  api.state.messages = [
    { type: 'assistant', time: { created: 200 }, content: [{ type: 'text', text: 'working' }] },
  ];
  api.state.forms = [FORM];
  await settle();
  assert.ok(parts.length >= 1, 'the parts are broadcast while the turn runs');
  assert.equal(asks.length, 1, 'the question is surfaced exactly once');
  assert.equal(asks[0].id, 'frm_1');

  await turn.replyAsk('frm_1', { q0: ['A'] });
  assert.ok(
    api.state.calls.some(
      ([path, body]) => path.endsWith('/form/frm_1/reply') && body.answer.q0 === 'A',
    ),
    'the answer is sent back in opencode shape',
  );

  // The turn ends on idle.
  api.state.forms = [];
  api.state.messages = [
    ...api.state.messages,
    { type: 'idle', time: { created: 300 }, outcome: 'succeeded' },
  ];
  await settle();
  assert.equal(exit, 0, 'idle ends the turn');
  await turn.stop();
});

test('a permission request is approved the way --auto would', async () => {
  const api = fakeApi();
  let exit = null;

  const turn = await startTurn({
    cfg: CFG,
    api,
    sessionId: 'ses_1',
    prompt: 'hello',
    since: 1,
    intervalMs: 5,
    callbacks: {
      onParts: () => {},
      onAsk: () => {},
      onAskDone: () => {},
      onExit: (code) => {
        exit = code;
      },
    },
  });
  assert.ok(turn);

  api.state.permissions = [{ id: 'per_1', action: 'read', resources: ['.env'] }];
  await settle();
  assert.ok(
    api.state.calls.some(
      ([path, body]) => path.endsWith('/permission/per_1/reply') && body.decision === 'once',
    ),
    'the request is approved once',
  );

  api.state.permissions = [];
  api.state.messages = [{ type: 'idle', time: { created: 9 }, outcome: 'succeeded' }];
  await settle();
  assert.equal(exit, 0);
  await turn.stop();
});
