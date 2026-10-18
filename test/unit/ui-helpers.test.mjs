// modelroom — the room UI's pure helpers.
//
// The markdown renderer is the one place the tool turns agent-written text into
// HTML, so "raw HTML is escaped, not rendered" is worth a test. The frontmatter
// splitter feeds the doc preview and must never lose the body.

import { test, expect } from 'vitest';
import { renderChat, renderDoc } from '../../web/src/lib/markdown.ts';
import { docLabel, splitFrontmatter } from '../../web/src/lib/format.ts';

test('raw HTML in a reply is escaped, never rendered', () => {
  const html = renderChat('<img src=x onerror=alert(1)>');
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img');
});

test('a script tag stays text', () => {
  const html = renderChat('hello <script>alert(1)</script>');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});

test('links open in a new tab without a referrer', () => {
  const html = renderChat('[docs](https://example.com)');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
});

test('a javascript: link is not turned into one', () => {
  const html = renderChat('[x](javascript:alert(1))');
  expect(html).not.toContain('href="javascript:');
});

test('code fences are highlighted', () => {
  const html = renderChat('```js\nconst a = 1;\n```');
  expect(html).toContain('hljs');
});

test('chat turns single newlines into breaks; docs keep soft wrapping', () => {
  expect(renderChat('a\nb')).toContain('<br>');
  expect(renderDoc('a\nb')).not.toContain('<br>');
});

test('frontmatter is split off and the body survives', () => {
  const text = '---\ntitle: Sign in\ntags: [auth, form]\n---\n# Sign in\n\nBody\n';
  const { rows, body } = splitFrontmatter(text);
  expect(rows).toEqual([
    { key: 'title', value: 'Sign in' },
    { key: 'tags', value: 'auth, form' },
  ]);
  expect(body).toBe('# Sign in\n\nBody\n');
});

test('a doc without frontmatter is left whole', () => {
  const { rows, body } = splitFrontmatter('# Notes\n');
  expect(rows).toEqual([]);
  expect(body).toBe('# Notes\n');
});

test('doc labels drop the extension', () => {
  expect(docLabel('BRIEF.md')).toBe('BRIEF');
});
