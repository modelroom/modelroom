// modelroom — the dashboard filter's matching rule.
//
// The rule is the one thing about the filter that is not a Mantine component, so
// it is the one thing worth testing on its own: how a query is reduced, and that
// a thousand candidates still narrow in well under a frame budget.

import { test, expect } from 'vitest';
import { filterOptions, normalizeQuery } from '../../web/src/dashboard/filter.ts';

const options = [
  { value: 'auth', label: 'auth' },
  { value: 'OAuth', label: 'OAuth' },
  { value: 'Ａｕｔｈ', label: 'Ａｕｔｈ' }, // full-width, NFKC-equal to "auth"
  { value: 'error', label: 'error' },
];

test('an empty query keeps every candidate', () => {
  expect(filterOptions(options, '')).toHaveLength(4);
  expect(filterOptions(options, '   ')).toHaveLength(4);
});

test('matching is a case-insensitive substring of the label', () => {
  expect(filterOptions(options, 'err').map((o) => o.value)).toEqual(['error']);
  expect(filterOptions(options, 'auth').map((o) => o.value)).toEqual(['auth', 'OAuth', 'Ａｕｔｈ']);
});

test('full-width and half-width are the same query', () => {
  expect(normalizeQuery('ＡＵＴＨ')).toBe('auth');
  expect(normalizeQuery('auth')).toBe('auth');
});

test('the limit bounds how much is rendered, not which order it comes in', () => {
  const many = Array.from({ length: 1000 }, (_, index) => ({
    value: `v${index}`,
    label: `value-${index}`,
  }));
  expect(filterOptions(many, '', 200)).toHaveLength(200);
  expect(filterOptions(many, 'value-1').length).toBeGreaterThan(100);
});

test('1000 candidates narrow in one pass, well inside the 200ms budget', () => {
  const many = Array.from({ length: 1000 }, (_, index) => ({
    value: `component-${index}`,
    label: `component-${String(index).padStart(4, '0')}`,
  }));
  const started = performance.now();
  let hits = 0;
  for (let i = 0; i < 50; i += 1) hits += filterOptions(many, '42').length;
  const perPass = (performance.now() - started) / 50;
  expect(hits).toBeGreaterThan(0);
  expect(perPass).toBeLessThan(200);
});
