// modelroom — the chat follows a structured turn
//
// The opencode adapter keeps its turn on the agent's own server while it works, so
// the chat can show the parts — the text, the tool calls, the patches — instead of
// waiting for the CLI's prose to stop. This drives the whole way: the adapter runs
// the agent, the watcher reads the session back, and the parts arrive over SSE.

import { test, expect } from 'vitest';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createModelroom } from '../lib/server.ts';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function freePort() {
  return new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

/** Listen to `/events` while `action` runs, and stop when the chat says it is done. */
async function collectEvents(url, action, timeoutMs = 8000) {
  const controller = new AbortController();
  const chunks = [];
  return new Promise((resolveEvents) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        controller.abort();
      } catch {
        /* already gone */
      }
      resolveEvents(chunks.join(''));
    };
    const timer = setTimeout(finish, timeoutMs);
    void (async () => {
      try {
        const stream = await fetch(`${url}/events`, { signal: controller.signal });
        const reader = stream.body.getReader();
        const decoder = new TextDecoder();
        setTimeout(() => void action(), 300);
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(decoder.decode(value));
          if (/event: chat-done/.test(chunks.join(''))) {
            clearTimeout(timer);
            return finish();
          }
        }
      } catch {
        /* aborted */
      }
      clearTimeout(timer);
      finish();
    })();
  });
}

/** `event: x` / `data: {…}` blocks, in the order they arrived. */
function parseEvents(text) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1] ?? '';
      const raw = /^data: (.+)$/m.exec(block)?.[1] ?? '';
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {
        /* keep null */
      }
      return { event, data };
    });
}

const ask = (url, prompt) => () =>
  fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ room: 'sign-in', prompt }),
  });

/**
 * A fake opencode that behaves like the real one where it matters: `run` prints
 * prose and takes its time, and the session API describes the turn in parts —
 * including the patch an edit wrote — while that is still happening.
 */
async function fakeOpencode(dir) {
  const file = join(dir, 'fake-opencode.mjs');
  const src = `#!/usr/bin/env node
const argv = process.argv.slice(2);
if (argv[0] === 'run') {
  process.stdout.write('the same words, as prose\\n');
  setTimeout(() => process.exit(0), 900);
} else {
  const answer = {
    data: [
      { id: 'm1', type: 'user', text: 'hi', time: { created: 1 } },
      {
        id: 'm2',
        type: 'assistant',
        time: { created: Date.now() },
        content: [
          { type: 'reasoning', text: 'let me look at the room' },
          { type: 'text', text: 'I changed the badge.' },
          {
            type: 'tool',
            id: 'call_1',
            name: 'edit',
            state: {
              status: 'completed',
              input: { path: 'rooms/sign-in/BRIEF.md' },
              metadata: {
                files: [{ file: 'rooms/sign-in/BRIEF.md', patch: '@@ -1 +1 @@\\n-old\\n+new' }],
              },
            },
          },
        ],
      },
    ],
  };
  process.stdout.write(JSON.stringify(answer) + '\\n');
}
`;
  await writeFile(file, src);
  await chmod(file, 0o755);
  return file;
}

/** A server of this repo's rooms, with the agent swapped for something local. */
async function appWithAgent(dir, agent) {
  const app = await createModelroom({
    cwd: pkgDir,
    port: await freePort(),
    host: '127.0.0.1',
  });
  // Keep this run's session out of the repo's own state file.
  app.cfg.stateDir = dir;
  app.cfg.statePath = join(dir, 'state.json');
  Object.assign(app.cfg.agent, agent);
  return { app, url: (await app.listen()).url };
}

test('a structured turn reaches the chat while the agent is still working', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-parts-'));
  const { app, url } = await appWithAgent(dir, { command: await fakeOpencode(dir) });

  try {
    const events = parseEvents(await collectEvents(url, ask(url, 'change the badge')));
    const parts = events.filter((e) => e.event === 'chat-parts');

    expect(parts.length, 'the parts stream while the agent works').toBeGreaterThan(0);
    expect(
      events.findIndex((e) => e.event === 'chat-parts'),
      'they arrive before the run is over',
    ).toBeLessThan(events.findIndex((e) => e.event === 'chat-done'));

    const last = parts.at(-1).data.parts;
    expect(last.map((part) => part.kind)).toEqual(['reasoning', 'text', 'tool']);
    expect(last[1].text).toContain('I changed the badge');
    expect(last[2]).toMatchObject({ name: 'edit', status: 'completed' });
    expect(last[2].files[0]).toMatchObject({
      file: 'rooms/sign-in/BRIEF.md',
      patch: expect.stringContaining('+new'),
    });

    // The CLI's own words still stream — as raw output, not as a second answer.
    expect(events.some((e) => e.event === 'chat' && e.data.stream === 'stdout')).toBe(true);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('a plain-text adapter is left exactly as it was', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-plain-'));
  const { app, url } = await appWithAgent(dir, {
    adapter: 'command',
    command: process.execPath,
    args: ['-e', 'process.stdout.write("just words\\n")'],
  });

  try {
    const events = parseEvents(await collectEvents(url, ask(url, 'say something'), 6000));
    expect(
      events.some((e) => e.event === 'chat-parts'),
      'no parts: it has none to show',
    ).toBe(false);
    expect(
      events.some(
        (e) => e.event === 'chat' && e.data.stream === 'stdout' && /just words/.test(e.data.chunk),
      ),
      'its text is the answer, as before',
    ).toBe(true);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
