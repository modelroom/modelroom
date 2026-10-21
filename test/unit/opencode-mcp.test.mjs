// modelroom — the MCP list in the room panel.
//
// The list is what the agent can actually call, so it is read from the server the
// agent runs on; and an empty answer is not one, because opencode connects the
// servers its config names a moment after it starts answering. The cache behind
// it is module state, so these two live in their own file and go in this order:
// the first leaves nothing cached, the second leaves the real list behind.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { sessionView } from '../../server/opencode.ts';

// No CLI: every read below goes through the fake server, as it does in the app.
const CFG = { agent: { command: 'modelroom-no-such-binary-xyz' }, rootDir: process.cwd() };

const SESSION = {
  '/api/session/ses_test': {
    data: { id: 'ses_test', model: { id: 'm' }, location: { directory: '/tmp/room' } },
  },
  '/api/session/ses_test/message': { data: [] },
};

const bootstrap = { name: 'bootstrap', status: { status: 'connected' } };

/**
 * A server the agent could be running on. `routes` may hold a list of answers
 * per path, handed over one call at a time, which is how a server that is still
 * connecting is written down.
 */
function fakeServer(routes, startedAt) {
  const calls = [];
  return {
    calls,
    startedAt,
    get: async (path) => {
      const seen = calls.filter((call) => call === path).length;
      calls.push(path);
      const answer = routes[path];
      if (Array.isArray(answer)) return answer[Math.min(seen, answer.length - 1)];
      return answer ?? null;
    },
  };
}

const mcpCalls = (api) => api.calls.filter((path) => path === '/api/mcp').length;

test("a server that just started is looked at again before 'none'", async () => {
  const api = fakeServer({ ...SESSION, '/api/mcp': { data: [] } }, Date.now());
  const view = await sessionView(CFG, 'ses_test', api);

  assert.deepEqual(view.mcp, []);
  assert.equal(mcpCalls(api), 2, 'the empty answer is asked again');
});

test('an empty MCP list is not cached: the next look is the real one', async () => {
  // Settled long ago, so nothing waits on its behalf — this is about the cache.
  const api = fakeServer(
    { ...SESSION, '/api/mcp': [{ data: [] }, { data: [bootstrap] }] },
    Date.now() - 60_000,
  );

  const first = await sessionView(CFG, 'ses_test', api);
  const second = await sessionView(CFG, 'ses_test', api);

  assert.deepEqual(first.mcp, []);
  assert.deepEqual(second.mcp, [{ name: 'bootstrap', status: 'connected', error: null }]);
});
