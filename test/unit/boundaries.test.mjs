// modelroom — who may import whom, said out loud.
//
// The tree says where code runs: `bin/` is the CLI, `server/` is the HTTP and
// agent side, `client/` is the browser, `core/` is the model the CLI and the
// server share, `i18n/` is the language and its catalog, and `api/` is the shape
// the browser and the server agree on.
// tsconfig and esbuild already refuse to build a browser bundle that reaches for
// `node:` — this states the rule so a reviewer does not have to reconstruct it
// from three config files, and so a new import fails here instead of in review.

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The layers, and what each one may import. `packages` is `true` for a browser
 * app full of dependencies, `false` for code that must ship with none, and a
 * list when a package is optional — `playwright` is imported dynamically and
 * only by the PNG renderer, so modelroom still runs without it.
 */
const LAYERS = {
  // Browser-safe by construction: the words. Nothing here may reach for Node,
  // or for any package at all.
  i18n: { siblings: [], node: false, packages: false },
  // Browser-safe by construction: the wire. Types only — the chat turn and the
  // shape of what the server hands the browser. The same rules as the words.
  api: { siblings: [], node: false, packages: false },
  // The model both the CLI and the server work on. Node is fine; the browser is
  // not a consumer of it.
  core: { siblings: ['i18n'], node: true, packages: false },
  // The browser app. It talks to the server over HTTP and shares the words and
  // the wire, but never imports the server or the model directly.
  client: { siblings: ['i18n', 'api'], node: false, packages: true },
  // The HTTP + agent side.
  server: { siblings: ['core', 'i18n', 'api'], node: true, packages: ['playwright'] },
  // The CLI: everything above, because `serve` starts the server.
  bin: { siblings: ['server', 'core', 'i18n'], node: true, packages: false },
};

const SPECIFIER = /(?:^|[^.\w])(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/gm;

async function sources(dir, into = []) {
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) await sources(join(dir, entry.name), into);
    else if (/\.(ts|tsx)$/.test(entry.name)) into.push(join(dir, entry.name));
  }
  return into;
}

/** Imports only — not the paths that appear in prose. */
const importsOf = (text) =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(SPECIFIER)].map((match) => match[1]);

/** `@scope/name/sub` → `@scope/name`, `name/sub` → `name`. */
const packageOf = (spec) =>
  spec
    .split('/')
    .slice(0, spec.startsWith('@') ? 2 : 1)
    .join('/');

test('every layer imports only what its neighbours allow', async () => {
  const found = [];
  const violations = [];

  for (const [layer, rules] of Object.entries(LAYERS)) {
    for (const file of await sources(layer)) {
      found.push(file);
      const here = posix.dirname(file);
      for (const spec of importsOf(await readFile(join(root, file), 'utf8'))) {
        const where = `${file}  →  ${spec}`;
        if (spec.startsWith('node:')) {
          if (!rules.node) violations.push(`${where}   (no Node in ${layer}/)`);
        } else if (!spec.startsWith('.')) {
          if (rules.packages !== true && !rules.packages?.includes(packageOf(spec))) {
            const allowed = Array.isArray(rules.packages) ? rules.packages.join(', ') : 'none';
            violations.push(`${where}   (${layer}/ may only import ${allowed})`);
          }
        } else {
          const top = posix.normalize(posix.join(here, spec)).split('/')[0];
          if (top !== layer && !rules.siblings.includes(top)) {
            violations.push(`${where}   (${layer}/ may not import ${top}/)`);
          }
        }
      }
    }
  }

  // A scan that found nothing would pass without checking anything.
  expect(found.length, 'no sources found — the walk is broken').toBeGreaterThan(30);
  expect(found.filter((file) => file.startsWith('client/')).length).toBeGreaterThan(20);
  expect(violations).toEqual([]);
});

// The rename that introduced these directories also moved what `npm` publishes:
// a stale path in `exports` is not a type error and not a build error — it is a
// package that installs and does not run. So the map is held against the tree.
test('the published paths point at files that exist', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const published = [
    pkg.bin.modelroom,
    pkg.types,
    pkg.exports['.'].types,
    pkg.exports['.'].default,
  ];

  const missing = published.filter((path) => {
    const source = path
      .replace(/^\.\//, '')
      .replace(/^dist\//, '')
      .replace(/\.d\.ts$/, '.ts')
      .replace(/\.js$/, '.ts');
    return !existsSync(join(root, source));
  });

  expect(missing, 'package.json points at files that are not there').toEqual([]);
});
