// modelroom — the browser's copy of the room-name rule.
//
// The server decides with `core/roomrefs.ts`; this is the copy the dialogs use to
// show ✓ or ✘ as you type. The two must agree on what a valid name is, so the
// cases here are the ones the server refuses too (see test/e2e-rooms.test.mjs).

import { test, expect } from 'vitest';
import {
  collidingRoom,
  isNewRoomName,
  roomNameCheck,
  roomNameState,
} from '../../client/lib/roomname.ts';

test('a name is a lowercase slug starting with a letter or digit', () => {
  expect(isNewRoomName('sign-in')).toBe(true);
  expect(isNewRoomName('a')).toBe(true);
  expect(isNewRoomName('v2.1_beta')).toBe(true);
  expect(isNewRoomName('Sign-in')).toBe(false);
  expect(isNewRoomName('-leading')).toBe(false);
  expect(isNewRoomName('trailing.')).toBe(false);
  expect(isNewRoomName('.hidden')).toBe(false);
  expect(isNewRoomName('')).toBe(false);
});

test('a collision ignores case, as a case-insensitive disk would', () => {
  expect(collidingRoom(['cart', 'sign-in'], 'Sign-in')).toBe('sign-in');
  expect(collidingRoom(['cart'], 'checkout')).toBeNull();
});

test('the state names the reason, and the check adds the current name', () => {
  const names = ['cart', 'checkout'];
  expect(roomNameState('', names).issue).toBe('empty');
  expect(roomNameState('Sign-in', names).issue).toBe('invalid');
  expect(roomNameState('cart', names)).toMatchObject({ issue: 'taken', collide: 'cart' });
  // A lowercase name that differs only by case from an existing room.
  expect(roomNameState('cart', ['Cart'])).toMatchObject({ issue: 'taken', collide: 'Cart' });
  expect(roomNameState('sign-in', names).issue).toBe('ok');

  expect(roomNameCheck('checkout', names, 'checkout').valid).toBe(false);
  expect(roomNameCheck('check-out', names, 'checkout').valid).toBe(true);
  expect(roomNameCheck('checkout', names).valid).toBe(false);
});
