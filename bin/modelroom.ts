#!/usr/bin/env node
// modelroom — CLI
//
//   modelroom [serve] [--port 4321] [--host 127.0.0.1] [--open]
//   modelroom init [<room>] [--dir rooms] [--force]
//   modelroom check [--json] [--strict]
//   modelroom doctor
//
// `modelroom` with no command serves. See docs/03-cli.md.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.ts';
import { createModelroom } from '../lib/server.ts';
import { listRoomNames } from '../lib/rooms.ts';
import { lintRooms } from '../lib/lint.ts';
import { findPackageRoot } from '../lib/pkg.ts';

const pkgDir = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
const templatesDir = join(pkgDir, 'templates');

const args = process.argv.slice(2);
const opts: Record<string, string | true> = {};
const flagValues = new Set<number>();
for (let i = 0; i < args.length; i++) {
  const arg = args[i] as string;
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const next = args[i + 1];
  if (next && !next.startsWith('--')) {
    opts[key] = next;
    flagValues.add(i + 1);
    i++;
  } else {
    opts[key] = true;
  }
}
// The command is the first bare word that is not a flag's value — so bare
// `modelroom` serves, and `modelroom --port 5000` still serves on that port.
const positional = args.filter((a, i) => !a.startsWith('-') && !flagValues.has(i));
const cmd = positional[0] ?? 'serve';
const pkg = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')) as { version: string };

if (opts.version || cmd === 'version') {
  console.log(pkg.version);
  process.exit(0);
}
if (cmd === 'help' || opts.help) usage();

function usage(): never {
  console.log(`modelroom ${pkg.version} — a full-scale model room for UI

usage
  modelroom [serve] [--port 4321] [--host 127.0.0.1] [--open]
  modelroom init [<room>] [--dir rooms] [--force]
  modelroom check [--json] [--strict]
  modelroom doctor
  modelroom --version | --help

A room is one screen: rooms/<name>/ with BRIEF.md, SPEC.md, BEHAVIOUR.md and an artifact.
Config lives in modelroom.json; local state in .modelroom/state.json (git-ignore it).
`);
  process.exit(0);
}

const cwd = resolve(typeof opts.cwd === 'string' ? opts.cwd : process.cwd());
const str = (v: string | true | undefined): string | undefined =>
  typeof v === 'string' ? v : undefined;

// ── serve ───────────────────────────────────────────────────────────────────
if (cmd === 'serve') {
  const app = await createModelroom({ cwd, port: str(opts.port), host: str(opts.host) });
  app.startWatching();
  try {
    const { url } = await app.listen();
    const rooms = await listRoomNames(app.cfg);
    console.log(
      [
        `modelroom ${pkg.version}`,
        `  ${url}`,
        `  root     ${app.cfg.rootDir}`,
        `  rooms    ${rooms.length ? rooms.join(', ') : '(none yet — try: npx modelroom init hello)'}`,
        `  agent    ${app.cfg.agent.adapter} · ${app.cfg.agent.command} · agent=${app.cfg.agent.agent || '-'} · model=${app.cfg.agent.model || 'default'}`,
        '',
        '  Artifacts are served unmodified. Writable files: ' + app.cfg.docs.join(', '),
        '  Ctrl+C to stop',
      ].join('\n'),
    );
    if (opts.open) openBrowser(url);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    console.error(
      code === 'EADDRINUSE'
        ? `port ${app.cfg.port} is in use — pass --port <n>`
        : err instanceof Error
          ? err.message
          : String(err),
    );
    process.exit(1);
  }
}

// ── init ────────────────────────────────────────────────────────────────────
else if (cmd === 'init') {
  const cfg = await loadConfig(cwd);
  if (typeof opts.dir === 'string' && !opts.dir.startsWith('-')) {
    cfg.rooms = opts.dir;
    cfg.roomsDir = resolve(cfg.rootDir, cfg.rooms);
  }
  const room =
    typeof opts.room === 'string' && !opts.room.startsWith('-')
      ? opts.room
      : positional[1] || 'hello';
  const force = Boolean(opts.force);
  await mkdir(cfg.roomsDir, { recursive: true });
  const roomDir = join(cfg.roomsDir, room);
  await mkdir(roomDir, { recursive: true });

  const written: string[] = [];
  for (const f of ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md', 'index.html']) {
    const dest = join(roomDir, f);
    if (!force && (await exists(dest))) {
      console.log(`skip  ${rel(dest, cwd)} (exists)`);
      continue;
    }
    const src = await readFile(join(templatesDir, 'room', f), 'utf8');
    await writeFile(dest, src.replaceAll('{{room}}', room));
    written.push(rel(dest, cwd));
  }
  for (const [tpl, dest, label] of [
    ['modelroom.json', join(cwd, 'modelroom.json'), 'modelroom.json'],
    ['AGENTS.md', join(cwd, 'AGENTS.md'), 'AGENTS.md'],
  ] as const) {
    if (!force && (await exists(dest))) {
      console.log(`skip  ${label} (exists)`);
      continue;
    }
    await writeFile(dest, await readFile(join(templatesDir, tpl), 'utf8'));
    written.push(label);
  }
  const gi = join(cwd, '.gitignore');
  const lines = await readFile(gi, 'utf8').catch(() => '');
  if (!lines.includes('.modelroom')) {
    await writeFile(gi, (lines ? lines.replace(/\n?$/, '\n') : '') + '.modelroom/\n');
    written.push('.gitignore (+ .modelroom/)');
  }

  console.log(`created in ${cwd}:`);
  for (const w of written) console.log(`  ${w}`);
  console.log(`\nnext\n  npx modelroom\n  open http://127.0.0.1:${cfg.port}/room/${room}`);
}

// ── check ───────────────────────────────────────────────────────────────────
// The record is derived from the docs; the check looks for what would stop the
// derivation — malformed frontmatter, reserved keys with the wrong shape, and
// the same value spelled two ways. It never deletes or rewrites.
else if (cmd === 'check') {
  const cfg = await loadConfig(cwd);
  const { issues, stats } = await lintRooms(cfg);

  if (opts.json) {
    console.log(JSON.stringify({ stats, issues }, null, 2));
  } else {
    for (const i of issues) {
      const where = `${i.room}${i.file ? '/' + i.file : ''}`;
      console.log(`${i.level === 'error' ? 'FAIL' : 'warn'}  ${where}  ${i.code}  ${i.message}`);
    }
    console.log(`\n${stats.rooms} room(s), ${stats.errors} error(s), ${stats.warnings} warning(s)`);
  }
  process.exit(stats.errors || (opts.strict && stats.warnings) ? 1 : 0);
}

// ── doctor ──────────────────────────────────────────────────────────────────
else if (cmd === 'doctor') {
  const cfg = await loadConfig(cwd);
  const checks: Array<[boolean, string]> = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push([nodeMajor >= 22, `node ${process.versions.node} (needs >= 22.18)`]);
  checks.push([await exists(cfg.rootDir), `root exists: ${cfg.rootDir}`]);
  checks.push([await exists(cfg.roomsDir), `rooms dir exists: ${rel(cfg.roomsDir, cwd)}`]);
  const rooms = await listRoomNames(cfg);
  checks.push([rooms.length > 0, `rooms found: ${rooms.length ? rooms.join(', ') : 'none'}`]);
  checks.push([
    await exists(cfg.configPath),
    `config: ${(await exists(cfg.configPath)) ? 'modelroom.json' : 'modelroom.json (defaults in use)'}`,
  ]);

  const onPath = await which(cfg.agent.command);
  checks.push([
    Boolean(onPath),
    `agent command on PATH: ${cfg.agent.command}${onPath ? '' : ' (not found — the chat will fail)'}`,
  ]);

  const { playwrightAvailable } = await import('../lib/artifact.ts');
  const pw = await playwrightAvailable();
  checks.push([pw, `png rendering (playwright): ${pw ? 'available' : 'not installed (optional)'}`]);

  for (const room of rooms) {
    const missing: string[] = [];
    for (const d of cfg.docs) if (!(await exists(join(cfg.roomsDir, room, d)))) missing.push(d);
    const hasArtifact = await exists(join(cfg.roomsDir, room, cfg.artifact));
    checks.push([
      missing.length === 0 && hasArtifact,
      `room ${room}: ${missing.length ? 'missing ' + missing.join(', ') : 'docs ok'}${hasArtifact ? '' : `, no ${cfg.artifact}`}`,
    ]);
  }

  let bad = 0;
  for (const [ok, label] of checks) {
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  }
  const onlyOptional = checks.every(([ok, label]) => ok || label.includes('optional'));
  console.log(bad ? `\n${bad} problem(s)${onlyOptional ? ' (optional)' : ''}` : '\nall good');
  process.exit(bad && !onlyOptional ? 1 : 0);
} else {
  console.error(`unknown command: ${cmd}\n`);
  usage();
}

// ── helpers ─────────────────────────────────────────────────────────────────
async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function rel(p: string, base: string): string {
  return p.startsWith(base) ? p.slice(base.length + 1) : p;
}

async function which(bin: string): Promise<string | null> {
  if (!bin) return null;
  const dirs = (process.env.PATH || '').split(':');
  for (const d of dirs) if (await exists(join(d, bin))) return join(d, bin);
  return null;
}

function openBrowser(url: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* headless: ignore */
  }
}
