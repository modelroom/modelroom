import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  collidingRoom,
  isNewRoomName,
  roomMentions,
  rewriteRoomRefs,
} from '../../core/roomrefs.ts';

test('a room name is a lowercase slug, without an edge dot', () => {
  assert.equal(isNewRoomName('sign-in'), true);
  assert.equal(isNewRoomName('a.b_c-1'), true);
  assert.equal(isNewRoomName('Sign-in'), false);
  assert.equal(isNewRoomName('checkout.'), false);
  assert.equal(isNewRoomName('-checkout'), false);
  assert.equal(isNewRoomName('.hidden'), false);
  assert.equal(isNewRoomName('../escape'), false);
  assert.equal(isNewRoomName(''), false);
});

test('collisions ignore case, so a case-insensitive disk cannot hold two rooms', () => {
  assert.equal(collidingRoom(['checkout', 'sign-in'], 'Sign-In'), 'sign-in');
  assert.equal(collidingRoom(['checkout'], 'checkout'), 'checkout');
  assert.equal(collidingRoom(['checkout'], 'cart'), null);
});

test('rewriteRoomRefs rewrites the frontmatter pointer', () => {
  const text = '---\ntitle: Checkout\nsuperseded_by: checkout\n---\n# Checkout\n';
  const out = rewriteRoomRefs(text, 'checkout', 'cart');
  assert.equal(out.count, 1);
  assert.match(out.text, /superseded_by: cart/);
  assert.match(out.text, /title: Checkout/); // prose, not a path
});

test('rewriteRoomRefs rewrites quoted frontmatter and keeps a comment', () => {
  const out = rewriteRoomRefs('superseded_by: "checkout" # replaced\n', 'checkout', 'cart');
  assert.equal(out.count, 1);
  assert.equal(out.text, 'superseded_by: "cart" # replaced\n');
});

test('rewriteRoomRefs rewrites the room addresses', () => {
  const text = [
    'See /rooms/checkout and /rooms/checkout/index.html.',
    'From here: rooms/checkout/BRIEF.md.',
    '![shot](/files/rooms/checkout/index.png)',
  ].join('\n');
  const out = rewriteRoomRefs(text, 'checkout', 'cart');
  assert.equal(out.count, 4);
  assert.equal(
    out.text,
    [
      'See /rooms/cart and /rooms/cart/index.html.',
      'From here: rooms/cart/BRIEF.md.',
      '![shot](/files/rooms/cart/index.png)',
    ].join('\n'),
  );
});

test('rewriteRoomRefs rewrites relative links between rooms', () => {
  const text = '[brief](../checkout/BRIEF.md) and [same](./checkout)';
  const out = rewriteRoomRefs(text, 'checkout', 'cart');
  assert.equal(out.count, 2);
  assert.equal(out.text, '[brief](../cart/BRIEF.md) and [same](./cart)');
});

test('rewriteRoomRefs rewrites a bare relative path', () => {
  const out = rewriteRoomRefs('[brief](checkout/BRIEF.md)\n', 'checkout', 'cart');
  assert.equal(out.count, 1);
  assert.equal(out.text, '[brief](cart/BRIEF.md)\n');
});

test('rewriteRoomRefs leaves prose, headings and titles alone', () => {
  const text = 'The checkout room is ready.\n# checkout\n- not a path: checkout\n';
  const out = rewriteRoomRefs(text, 'checkout', 'cart');
  assert.equal(out.count, 0);
  assert.equal(out.text, text);
});

test('rewriteRoomRefs honours a custom rooms directory', () => {
  const out = rewriteRoomRefs(
    'open /files/screens/checkout/index.png and /rooms/checkout',
    'checkout',
    'cart',
    'screens',
  );
  assert.equal(out.count, 2);
  // The served path uses the configured directory; the address is always `/rooms`.
  assert.equal(out.text, 'open /files/screens/cart/index.png and /rooms/cart');
});

test('rewriteRoomRefs leaves a file name that merely starts with the room name', () => {
  const out = rewriteRoomRefs('see rooms/checkout.md and checkout.html', 'checkout', 'cart');
  assert.equal(out.count, 0);
});

test('rewriteRoomRefs rewrites a reference that ends a sentence', () => {
  const out = rewriteRoomRefs('Go to /rooms/checkout.', 'checkout', 'cart');
  assert.equal(out.count, 1);
  assert.equal(out.text, 'Go to /rooms/cart.');
});

test('rewriteRoomRefs counts when the name does not change', () => {
  const out = rewriteRoomRefs('see /rooms/checkout', 'checkout', 'checkout');
  assert.equal(out.count, 1);
  assert.equal(out.text, 'see /rooms/checkout');
});

test('roomMentions finds the places a name is used as prose', () => {
  const mentions = roomMentions('# Checkout\n\nThe checkout room is ready.\n', 'checkout');
  assert.deepEqual(
    mentions.map((m) => m.line),
    [3],
  );
  assert.match(mentions[0].text, /checkout room/);
});

test('roomMentions does not match a part of a longer word', () => {
  assert.deepEqual(roomMentions('checkouts and checkout-list', 'checkout'), []);
});
