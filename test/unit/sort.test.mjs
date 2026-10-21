// modelroom — the dashboard's ordering rule.
//
// The rule is the one thing about sorting that is not a Mantine component, so it
// is the one thing worth testing on its own: "updated" reads `sortAt`, "name"
// reads the directory name, and a search's relevance order always wins.

import { test, expect } from 'vitest';
import { orderRooms } from '../../client/dashboard/sort.ts';

const rooms = [
  { name: 'checkout', sortAt: 300 },
  { name: 'sign-in', sortAt: 100 },
  { name: 'admin', sortAt: 200 },
];

test('"updated" puts the newest first', () => {
  expect(orderRooms(rooms, 'updated').map((r) => r.name)).toEqual(['checkout', 'admin', 'sign-in']);
});

test('"name" sorts by the directory name', () => {
  expect(orderRooms(rooms, 'name').map((r) => r.name)).toEqual(['admin', 'checkout', 'sign-in']);
});

test('a relevance map wins and keeps only the rooms it names', () => {
  const relevance = new Map([
    ['sign-in', 0],
    ['checkout', 1],
  ]);
  expect(orderRooms(rooms, 'name', relevance).map((r) => r.name)).toEqual(['sign-in', 'checkout']);
  // The chosen sort is ignored while searching.
  expect(orderRooms(rooms, 'updated', relevance).map((r) => r.name)).toEqual([
    'sign-in',
    'checkout',
  ]);
});

test('the input is never mutated', () => {
  const copy = rooms.map((r) => ({ ...r }));
  orderRooms(rooms, 'name');
  orderRooms(rooms, 'updated');
  expect(rooms).toEqual(copy);
});
