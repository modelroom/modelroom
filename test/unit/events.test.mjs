// modelroom — the client hears every event the server sends.
//
// `EventSource` delivers a named event only to listeners registered by that exact
// name, and the client registers a fixed list. So the two lists have to agree: an
// event the server sends and the client does not name is a feature that silently
// never arrives (that is exactly how the live chat's `chat-parts` first shipped),
// and a name the server never sends is a listener that can never fire.

import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER_EVENTS } from '../../web/src/lib/events.ts';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the names the client listens for are the names the server sends', async () => {
  const source = await readFile(join(pkgDir, 'lib', 'server.ts'), 'utf8');
  const sent = new Set([
    ...[...source.matchAll(/broadcast\('([^']+)'/g)].map((match) => match[1]),
    // `hello` is written out by hand on connect, not through broadcast()
    ...[...source.matchAll(/`event: ([a-z-]+)\\n/g)].map((match) => match[1]),
  ]);

  const heard = new Set(SERVER_EVENTS);
  const unheard = [...sent].filter((name) => !heard.has(name));
  const never = [...heard].filter((name) => !sent.has(name));
  expect(unheard, 'the server sends these and the UI never hears them').toEqual([]);
  expect(never, 'the UI listens for these and the server never sends them').toEqual([]);
});
