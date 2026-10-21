import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  LOCAL_COMMAND,
  NPX_COMMAND,
  addScript,
  detectPackageManager,
  hasDependency,
  installCommand,
  isSelfPackage,
  parseManifest,
  remoteCommand,
  scriptCommand,
  scriptFallback,
  scriptOf,
} from '../../bin/manifest.ts';

const SHOP = '{\n  "name": "shop",\n  "scripts": {\n    "dev": "vite"\n  }\n}\n';

test('parseManifest reads the manifest and the shape of the file', () => {
  const m = parseManifest('{\n    "name": "shop"\n}\n');
  assert.equal(m?.json.name, 'shop');
  assert.equal(m?.indent, '    ');
  assert.equal(m?.newline, true);

  assert.equal(parseManifest('{\n\t"name": "shop"\n}\n')?.indent, '\t');
  assert.equal(parseManifest('{\n  "name": "shop"\n}')?.newline, false);
  assert.equal(parseManifest('{ "name": "shop" }')?.indent, '');
  assert.equal(parseManifest('{ "name": "shop" }')?.newline, false);

  assert.equal(parseManifest('{ not json'), null);
  assert.equal(parseManifest('[1, 2]'), null);
  assert.equal(parseManifest('"shop"'), null);
});

test('addScript writes only the script, keeping the rest of the file byte for byte', () => {
  const edit = addScript(SHOP, 'modelroom', NPX_COMMAND);
  assert.ok(edit.ok);
  assert.equal(edit.changed, true);
  assert.equal(edit.current, undefined);
  assert.equal(
    edit.text,
    '{\n  "name": "shop",\n  "scripts": {\n    "dev": "vite",\n    "modelroom": "npx --yes modelroom"\n  }\n}\n',
  );
});

test('addScript creates scripts when the manifest has none', () => {
  const edit = addScript('{\n  "name": "shop"\n}\n', 'modelroom', LOCAL_COMMAND);
  assert.ok(edit.ok);
  assert.equal(
    edit.text,
    '{\n  "name": "shop",\n  "scripts": {\n    "modelroom": "modelroom"\n  }\n}\n',
  );
});

test('addScript keeps a manifest on one line on one line', () => {
  const edit = addScript('{"name":"shop"}', 'modelroom', LOCAL_COMMAND);
  assert.ok(edit.ok);
  assert.equal(edit.text, '{"name":"shop","scripts":{"modelroom":"modelroom"}}');
});

test('addScript keeps four-space indentation and a missing trailing newline', () => {
  const text = '{\n    "name": "shop"\n}';
  const edit = addScript(text, 'modelroom', LOCAL_COMMAND);
  assert.ok(edit.ok);
  assert.equal(
    edit.text,
    '{\n    "name": "shop",\n    "scripts": {\n        "modelroom": "modelroom"\n    }\n}',
  );
});

test('addScript writes nothing when the script is already right', () => {
  const first = addScript(SHOP, 'modelroom', NPX_COMMAND);
  assert.ok(first.ok);
  const again = addScript(first.text, 'modelroom', NPX_COMMAND);
  assert.ok(again.ok);
  assert.equal(again.changed, false);
  assert.equal(again.text, first.text);
});

test('addScript keeps a different value unless overwrite is asked for', () => {
  const text =
    '{\n  "name": "shop",\n  "scripts": {\n    "modelroom": "node bin/modelroom.ts"\n  }\n}\n';
  const kept = addScript(text, 'modelroom', LOCAL_COMMAND);
  assert.ok(kept.ok);
  assert.equal(kept.changed, false);
  assert.equal(kept.text, text);
  assert.equal(kept.current, 'node bin/modelroom.ts');

  const forced = addScript(text, 'modelroom', LOCAL_COMMAND, { overwrite: true });
  assert.ok(forced.ok);
  assert.equal(forced.changed, true);
  assert.equal(forced.current, 'node bin/modelroom.ts');
  assert.match(forced.text, /"modelroom": "modelroom"/);
});

test('addScript refuses a file it cannot read, and one whose scripts is not an object', () => {
  assert.deepEqual(addScript('{ not json', 'modelroom', LOCAL_COMMAND), {
    ok: false,
    reason: 'invalid',
  });
  assert.deepEqual(addScript('{ "scripts": "vite" }', 'modelroom', LOCAL_COMMAND), {
    ok: false,
    reason: 'scripts',
  });
  assert.deepEqual(addScript('{ "scripts": null }', 'modelroom', LOCAL_COMMAND), {
    ok: false,
    reason: 'scripts',
  });
  assert.deepEqual(addScript('{ "scripts": ["dev"] }', 'modelroom', LOCAL_COMMAND), {
    ok: false,
    reason: 'scripts',
  });
});

test('scriptOf reads only a string, and only from an object', () => {
  const m = parseManifest('{ "scripts": { "modelroom": "modelroom", "build": 1 } }');
  assert.ok(m);
  assert.equal(scriptOf(m, 'modelroom'), 'modelroom');
  assert.equal(scriptOf(m, 'build'), undefined);
  assert.equal(scriptOf(m, 'missing'), undefined);
  const none = parseManifest('{ "name": "shop" }');
  assert.ok(none);
  assert.equal(scriptOf(none, 'modelroom'), undefined);
});

test('hasDependency covers the fields that install a bin locally', () => {
  const depends = (text) => hasDependency(parseManifest(text), 'modelroom');
  assert.equal(depends('{ "devDependencies": { "modelroom": "^1" } }'), true);
  assert.equal(depends('{ "dependencies": { "modelroom": "^1" } }'), true);
  assert.equal(depends('{ "optionalDependencies": { "modelroom": "^1" } }'), true);
  assert.equal(depends('{ "peerDependencies": { "modelroom": "^1" } }'), false);
  assert.equal(depends('{ "devDependencies": "none" }'), false);
  assert.equal(depends('{ "name": "shop" }'), false);
});

test('isSelfPackage spots the package itself', () => {
  const self = (name) => isSelfPackage(parseManifest(`{ "name": "${name}" }`));
  assert.equal(self('modelroom'), true);
  assert.equal(self('shop'), false);
});

test('detectPackageManager reads the lockfile', () => {
  assert.equal(detectPackageManager(['package-lock.json']), 'npm');
  assert.equal(detectPackageManager(['yarn.lock']), 'yarn');
  assert.equal(detectPackageManager(['pnpm-lock.yaml']), 'pnpm');
  assert.equal(detectPackageManager(['bun.lockb']), 'bun');
  assert.equal(detectPackageManager(['bun.lock']), 'bun');
  assert.equal(detectPackageManager([]), 'npm');
  assert.equal(detectPackageManager(['yarn.lock', 'pnpm-lock.yaml']), 'pnpm');
});

test("installCommand spells the dev dependency each manager's way", () => {
  assert.deepEqual(installCommand('npm', 'modelroom@^1.2.3'), {
    command: 'npm',
    args: ['install', '--save-dev', 'modelroom@^1.2.3'],
  });
  assert.deepEqual(installCommand('pnpm', 'modelroom@^1.2.3'), {
    command: 'pnpm',
    args: ['add', '--save-dev', 'modelroom@^1.2.3'],
  });
  assert.deepEqual(installCommand('yarn', 'modelroom@^1.2.3'), {
    command: 'yarn',
    args: ['add', '--dev', 'modelroom@^1.2.3'],
  });
  assert.deepEqual(installCommand('bun', 'modelroom@^1.2.3'), {
    command: 'bun',
    args: ['add', '--dev', 'modelroom@^1.2.3'],
  });
});

test('scriptCommand runs the project script in each manager, from the layer too', () => {
  assert.equal(scriptCommand('npm'), 'npm run modelroom');
  assert.equal(scriptCommand('pnpm'), 'pnpm modelroom');
  assert.equal(scriptCommand('yarn'), 'yarn modelroom');
  assert.equal(scriptCommand('bun'), 'bun run modelroom');
  assert.equal(scriptCommand('pnpm', 'other'), 'pnpm other');
});

test('remoteCommand names the manager, so a devEngines pin is not tripped', () => {
  assert.equal(remoteCommand('npm'), 'npx modelroom');
  assert.equal(remoteCommand('pnpm'), 'pnpm dlx modelroom');
  assert.equal(remoteCommand('yarn'), 'yarn dlx modelroom');
  assert.equal(remoteCommand('bun'), 'bunx modelroom');
  assert.equal(remoteCommand('pnpm', 'modelroom@latest'), 'pnpm dlx modelroom@latest');
});

test('scriptFallback keeps --yes for npm and leaves the others alone', () => {
  assert.equal(scriptFallback('npm'), 'npx --yes modelroom');
  assert.equal(scriptFallback('pnpm'), 'pnpm dlx modelroom');
  assert.equal(scriptFallback('yarn'), 'yarn dlx modelroom');
  assert.equal(scriptFallback('bun'), 'bunx modelroom');
});
