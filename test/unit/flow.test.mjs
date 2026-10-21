// modelroom — the dashboard's flow model.
//
// The model is the one thing about the flow view that is not React Flow or
// dagre, so it is what is tested here: how rooms group by `app`, how `next`
// becomes an edge, and what happens when a `next` points nowhere or crosses an
// app — the cases the view must not draw.

import { test, expect } from 'vitest';
import { appOf, buildFlows, nextOf } from '../../client/dashboard/flow.ts';

/** A room as the dashboard hands it in: a name and merged frontmatter. */
const room = (name, fields = {}) => ({ name, fields });

const knownOf = (rooms) => new Set(rooms.map((r) => r.name));

test('appOf reads a non-empty app, and nothing else', () => {
  expect(appOf(room('a', { app: 'user' }))).toBe('user');
  expect(appOf(room('a', { app: '  ' }))).toBe(null);
  expect(appOf(room('a', {}))).toBe(null);
  expect(appOf(room('a', { app: 3 }))).toBe(null);
});

test('nextOf keeps only a name that exists', () => {
  const known = new Set(['top']);
  expect(nextOf(room('a', { next: 'top' }), known)).toBe('top');
  expect(nextOf(room('a', { next: 'ghost' }), known)).toBe(null);
  expect(nextOf(room('a', {}), known)).toBe(null);
});

test('rooms group by app: named apps in name order, unassigned last', () => {
  const rooms = [
    room('login', { app: 'user', next: 'top' }),
    room('top', { app: 'user', next: 'detail' }),
    room('detail', { app: 'user' }),
    room('dashboard', { app: 'admin', next: 'reports' }),
    room('reports', { app: 'admin' }),
    room('legacy', { app: 'user-legacy' }),
    room('orphan'),
  ];
  const groups = buildFlows(rooms, knownOf(rooms));

  expect(groups.map((g) => g.app)).toEqual(['admin', 'user', 'user-legacy', null]);
  expect(groups.map((g) => g.nodes.length)).toEqual([2, 3, 1, 1]);

  const user = groups.find((g) => g.app === 'user');
  expect(user.nodes).toEqual(['detail', 'login', 'top']);
  expect(user.edges).toEqual([
    { from: 'login', to: 'top' },
    { from: 'top', to: 'detail' },
  ]);

  const admin = groups.find((g) => g.app === 'admin');
  expect(admin.edges).toEqual([{ from: 'dashboard', to: 'reports' }]);
});

test('a next that crosses apps is not an edge', () => {
  const rooms = [room('a', { app: 'user', next: 'b' }), room('b', { app: 'admin' })];
  const groups = buildFlows(rooms, knownOf(rooms));
  const user = groups.find((g) => g.app === 'user');
  const admin = groups.find((g) => g.app === 'admin');
  expect(user.edges).toEqual([]);
  expect(admin.edges).toEqual([]);
});

test('a next that names a room that does not exist is not an edge', () => {
  const rooms = [room('a', { app: 'user', next: 'ghost' })];
  const groups = buildFlows(rooms, knownOf(rooms));
  expect(groups[0].edges).toEqual([]);
});

test('a cycle stays in one group, with both edges', () => {
  const rooms = [room('a', { app: 'user', next: 'b' }), room('b', { app: 'user', next: 'a' })];
  const groups = buildFlows(rooms, knownOf(rooms));
  expect(groups).toHaveLength(1);
  expect(groups[0].edges).toEqual([
    { from: 'a', to: 'b' },
    { from: 'b', to: 'a' },
  ]);
});

test('an empty project is no groups', () => {
  expect(buildFlows([], new Set())).toEqual([]);
});
