// modelroom — the one question `init` asks.
//
// The prompt is the only interactive thing in the tool, so it is held to the
// same rule as everything else: the moving parts are pure and tested, and the
// stream half is driven by hand through a pair of in-memory streams — no TTY,
// no real keyboard, no timing.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { answerLine, draw, keptLine, select, step } from '../../bin/prompt.ts';

const KEYS = { up: '\x1b[A', down: '\x1b[B', enter: '\r', escape: '\x1b' };

const LANGS = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

/** Run `select` against in-memory streams, press `keys`, and collect what it drew. */
function press(choices, keys, options = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  let drawn = '';
  output.on('data', (chunk) => {
    drawn += String(chunk);
  });
  const chosen = select('language', choices, { ...options, streams: { input, output } });
  for (const key of keys) input.write(key);
  return chosen.then((value) => ({ value, drawn }));
}

test('step wraps the cursor around the list', () => {
  assert.equal(step(0, 2, 1), 1);
  assert.equal(step(1, 2, 1), 0);
  assert.equal(step(0, 2, -1), 1);
  assert.equal(step(1, 2, -1), 0);
  assert.equal(step(0, 0, 1), 0);
});

test('draw marks exactly the active choice', () => {
  assert.deepEqual(draw(LANGS, 0), ['❯ English', '  日本語']);
  assert.deepEqual(draw(LANGS, 1), ['  English', '❯ 日本語']);
});

test('answerLine reads as the question and its answer', () => {
  assert.equal(answerLine('language', '日本語'), '✔ language  日本語');
});

test('keptLine reads as the question left alone', () => {
  assert.equal(keptLine('language', 'keep automatic'), '– language  keep automatic');
});

test('the question and its choices are drawn before any key', async () => {
  const { drawn } = await press(LANGS, [KEYS.enter]);
  assert.match(drawn, /^language\n❯ English\n  日本語/);
});

test('Enter takes the choice the cursor started on', async () => {
  const { value, drawn } = await press(LANGS, [KEYS.enter], { initial: 1 });
  assert.equal(value, 'ja');
  assert.match(drawn, /✔ language  日本語/);
});

test('down and up move the cursor, and wrap around the ends', async () => {
  assert.equal((await press(LANGS, [KEYS.down, KEYS.enter])).value, 'ja');
  assert.equal((await press(LANGS, [KEYS.up, KEYS.enter])).value, 'ja'); // up from the top
  assert.equal((await press(LANGS, [KEYS.down, KEYS.down, KEYS.enter])).value, 'en'); // past the end
});

test('j and k work like the arrows', async () => {
  assert.equal((await press(LANGS, ['j', KEYS.enter])).value, 'ja');
  assert.equal((await press(LANGS, ['k', KEYS.enter], { initial: 1 })).value, 'en');
});

test('Escape with no cancel line keeps the language it started on', async () => {
  const { value, drawn } = await press(LANGS, [KEYS.down, KEYS.down, KEYS.escape], { initial: 1 });
  assert.equal(value, 'ja');
  assert.match(drawn, /✔ language  日本語/);
});

test('Escape with a cancel line resolves nothing, and says so', async () => {
  const { value, drawn } = await press(LANGS, [KEYS.down, KEYS.escape], {
    initial: 0,
    cancelLine: keptLine('language', 'keep automatic'),
  });
  assert.equal(value, undefined);
  assert.match(drawn, /– language {2}keep automatic/);
});

test('a stream that ends without an answer resolves instead of hanging', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chosen = select('language', LANGS, {
    streams: { input, output },
    cancelLine: keptLine('language', 'keep automatic'),
  });
  input.end();
  assert.equal(await chosen, undefined);
});

test('a one-choice list still answers', async () => {
  const { value } = await press([{ value: 'en', label: 'English' }], [KEYS.enter]);
  assert.equal(value, 'en');
});

test('an out-of-range initial index is clamped, not followed', async () => {
  assert.equal((await press(LANGS, [KEYS.enter], { initial: 9 })).value, 'ja');
  assert.equal((await press(LANGS, [KEYS.enter], { initial: -3 })).value, 'en');
});

test('an empty list is refused rather than awaited forever', async () => {
  await assert.rejects(press([], [KEYS.enter]), /at least one choice/);
});
