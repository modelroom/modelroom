#!/usr/bin/env node
// modelroom — CLI
//
//   modelroom [serve] [--port 4321] [--host 127.0.0.1] [--open] [--lang en|ja]
//   modelroom init [<room>] [--dir rooms] [--lang en|ja] [--force]
//   modelroom check [--json] [--strict]
//   modelroom doctor
//
// `modelroom` with no command serves. See docs/03-cli.md.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findConfigPath, isLang, loadConfig, type Config, type Lang } from '../lib/config.ts';
import { detectLang } from '../lib/locale.ts';
import { t, type MessageKey } from '../lib/i18n.ts';
import { readTemplate, ROOM_FILES } from '../lib/templates.ts';
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
const str = (v: string | true | undefined): string | undefined =>
  typeof v === 'string' ? v : undefined;
if (str(opts.lang) && !isLang(opts.lang)) {
  console.error(t(detectLang().lang, 'cli.error.invalidLang', { lang: String(opts.lang) }));
  process.exit(1);
}

/** The language for the CLI itself: flag, then config, then the environment. */
async function resolveCliLang(cwd: string, explicit?: string): Promise<Lang> {
  if (explicit && isLang(explicit)) return explicit;
  const cfg = await loadConfig(cwd);
  if (await exists(cfg.configPath)) return cfg.lang;
  return detectLang().lang;
}

const earlyLang = await resolveCliLang(process.cwd(), str(opts.lang));

if (opts.version || cmd === 'version') {
  console.log(pkg.version);
  process.exit(0);
}
if (cmd === 'help' || opts.help) usage(earlyLang);

function usage(lang: Lang): never {
  console.log(t(lang, 'cli.usage', { version: pkg.version }));
  process.exit(0);
}

const cwd = resolve(typeof opts.cwd === 'string' ? opts.cwd : process.cwd());

// ── serve ───────────────────────────────────────────────────────────────────
if (cmd === 'serve') {
  const app = await createModelroom({
    cwd,
    port: str(opts.port),
    host: str(opts.host),
    lang: str(opts.lang),
  });
  const lang = app.cfg.lang;
  app.startWatching();
  try {
    const { url } = await app.listen();
    const rooms = await listRoomNames(app.cfg);
    console.log(
      [
        `modelroom ${pkg.version}`,
        `  ${url}`,
        `  root     ${app.cfg.rootDir}`,
        t(lang, 'cli.serve.rooms', {
          rooms: rooms.length ? rooms.join(', ') : t(lang, 'cli.serve.roomsNone'),
        }),
        t(lang, 'cli.serve.agent', {
          line: `${app.cfg.agent.adapter} · ${app.cfg.agent.command} · agent=${app.cfg.agent.agent || '-'} · model=${app.cfg.agent.model || 'default'}`,
        }),
        '',
        t(lang, 'cli.serve.artifacts', { docs: app.cfg.docs.join(', ') }),
        t(lang, 'cli.serve.ctrlC'),
      ].join('\n'),
    );
    if (opts.open) openBrowser(url);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    console.error(
      code === 'EADDRINUSE'
        ? t(lang, 'cli.serve.portInUse', { port: app.cfg.port })
        : err instanceof Error
          ? err.message
          : String(err),
    );
    process.exit(1);
  }
}

// ── init ────────────────────────────────────────────────────────────────────
else if (cmd === 'init') {
  const existingPath = await findConfigPath(cwd);
  const legacy = existingPath === resolve(cwd, 'modelroom.json');
  let cfg: Config;
  let lang: Lang;
  let langSource: string;
  let designDir: string;
  let configPath: string;

  const detected = detectLang();
  const pinned = isLang(opts.lang);
  if (existingPath) {
    cfg = await loadConfig(cwd);
    configPath = cfg.configPath;
    lang = isLang(opts.lang) ? opts.lang : cfg.lang;
    const raw = await readFile(configPath, 'utf8').catch(() => '');
    langSource = pinned ? 'flag' : /"lang"\s*:/.test(raw) ? 'config' : detected.source;
    if (legacy) console.log(t(lang, 'cli.init.legacy', { path: relative(cwd, existingPath) }));
  } else {
    designDir = join(cwd, 'modelroom');
    configPath = join(designDir, 'modelroom.json');
    lang = isLang(opts.lang) ? opts.lang : detected.lang;
    langSource = pinned ? 'flag' : detected.source;
    cfg = {
      root: '.',
      rooms: str(opts.dir) ?? 'rooms',
      state: '../.modelroom',
      artifact: 'index.html',
      docs: ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md'],
      port: 4321,
      host: '127.0.0.1',
      lang,
      agent: {
        adapter: 'opencode',
        command: 'opencode',
        model: null,
        agent: 'build',
        standalone: true,
        args: [],
      },
      rootDir: designDir,
      roomsDir: join(designDir, str(opts.dir) ?? 'rooms'),
      configPath,
      configDir: designDir,
      stateDir: join(cwd, '.modelroom'),
      statePath: join(cwd, '.modelroom', 'state.json'),
    };
  }

  if (str(opts.dir)) {
    cfg.rooms = str(opts.dir) as string;
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
  const newConfig = !(await exists(configPath));
  if (newConfig) {
    const stateRel = relative(dirname(configPath), cfg.stateDir) || '.modelroom';
    await mkdir(dirname(configPath), { recursive: true });
    const template = await readFile(join(templatesDir, 'modelroom.json'), 'utf8');
    let text = template.replaceAll('{{rooms}}', cfg.rooms).replaceAll('{{state}}', stateRel);
    // Auto is the default: no `lang` line unless the caller pinned one.
    text = pinned
      ? text.replaceAll('{{lang}}', lang)
      : text.replace(/^[ \t]*"lang": "\{\{lang\}\}",\r?\n/m, '');
    await writeFile(configPath, text);
    written.push(rel(configPath, cwd));
  } else {
    // An existing project keeps its config; explicit flags update only what they name.
    const raw = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    let changed = false;
    if (isLang(opts.lang) && raw.lang !== lang) {
      raw.lang = lang;
      changed = true;
    }
    if (str(opts.dir) && raw.rooms !== cfg.rooms) {
      raw.rooms = cfg.rooms;
      changed = true;
    }
    if (changed) {
      await writeFile(configPath, JSON.stringify(raw, null, 2) + '\n');
      written.push(rel(configPath, cwd));
    }
  }

  for (const f of ROOM_FILES) {
    const dest = join(roomDir, f);
    if (!force && (await exists(dest))) {
      console.log(t(lang, 'cli.init.skip', { label: rel(dest, cwd) }));
      continue;
    }
    const src = await readTemplate(templatesDir, lang, join('room', f));
    await writeFile(dest, src.replaceAll('{{room}}', room));
    written.push(rel(dest, cwd));
  }

  const agentsDest = join(cfg.rootDir, 'AGENTS.md');
  if (!force && (await exists(agentsDest))) {
    console.log(t(lang, 'cli.init.skip', { label: rel(agentsDest, cwd) }));
  } else {
    await writeFile(agentsDest, await readTemplate(templatesDir, lang, 'AGENTS.md'));
    written.push(rel(agentsDest, cwd));
  }

  const giDir = dirname(cfg.stateDir);
  const gi = join(giDir, '.gitignore');
  const stateName = relative(giDir, cfg.stateDir) || basename(cfg.stateDir);
  const entry = `/${stateName.replaceAll('\\', '/')}/`;
  const lines = await readFile(gi, 'utf8').catch(() => '');
  if (!lines.includes(entry)) {
    await mkdir(giDir, { recursive: true });
    await writeFile(gi, (lines ? lines.replace(/\n?$/, '\n') : '') + entry + '\n');
    written.push(t(lang, 'cli.init.gitignore', { path: entry }));
  }

  console.log(t(lang, 'cli.init.created', { dir: cwd }));
  for (const w of written) console.log(`  ${w}`);
  console.log(
    t(lang, 'cli.init.language', {
      lang,
      source: t(lang, `cli.init.languageSource.${langSource}` as MessageKey),
    }),
  );
  if (langSource === 'env' || langSource === 'default') {
    console.log(`  ${t(lang, 'cli.init.languageAuto')}`);
  }
  console.log(`\n${t(lang, 'cli.init.next')}`);
  console.log(t(lang, 'cli.init.nextServe'));
  console.log(t(lang, 'cli.init.nextOpen', { port: cfg.port, room }));
}

// ── check ───────────────────────────────────────────────────────────────────
// The record is derived from the docs; the check looks for what would stop the
// derivation — malformed frontmatter, reserved keys with the wrong shape, and
// the same value spelled two ways. It never deletes or rewrites.
else if (cmd === 'check') {
  const cfg = await loadConfig(cwd);
  const lang = isLang(opts.lang) ? opts.lang : cfg.lang;
  const { issues, stats } = await lintRooms({ ...cfg, lang });

  if (opts.json) {
    console.log(JSON.stringify({ stats, issues }, null, 2));
  } else {
    for (const i of issues) {
      const where = `${i.room}${i.file ? '/' + i.file : ''}`;
      console.log(
        t(lang, 'cli.check.issue', {
          level: t(lang, i.level === 'error' ? 'cli.check.level.error' : 'cli.check.level.warn'),
          where,
          code: i.code,
          message: i.message,
        }),
      );
    }
    console.log(
      `\n${t(lang, 'cli.check.summary', {
        rooms: stats.rooms,
        errors: stats.errors,
        warnings: stats.warnings,
      })}`,
    );
  }
  process.exit(stats.errors || (opts.strict && stats.warnings) ? 1 : 0);
}

// ── doctor ──────────────────────────────────────────────────────────────────
else if (cmd === 'doctor') {
  const cfg = await loadConfig(cwd);
  const lang = isLang(opts.lang) ? opts.lang : cfg.lang;
  type Check = { ok: boolean; label: string; optional?: boolean };
  const checks: Check[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    ok: nodeMajor >= 22,
    label: t(lang, 'cli.doctor.node', { version: process.versions.node }),
  });
  checks.push({
    ok: await exists(cfg.rootDir),
    label: t(lang, 'cli.doctor.root', { path: cfg.rootDir }),
  });
  checks.push({
    ok: await exists(cfg.roomsDir),
    label: t(lang, 'cli.doctor.roomsDir', { path: rel(cfg.roomsDir, cwd) }),
  });
  const rooms = await listRoomNames(cfg);
  checks.push({
    ok: rooms.length > 0,
    label: t(lang, rooms.length ? 'cli.doctor.rooms' : 'cli.doctor.roomsNone', {
      rooms: rooms.join(', '),
    }),
  });
  const configFound = await exists(cfg.configPath);
  checks.push({
    ok: configFound,
    label: t(lang, configFound ? 'cli.doctor.config' : 'cli.doctor.configDefaults', {
      path: rel(cfg.configPath, cwd),
    }),
  });
  checks.push({
    ok: true,
    label: t(lang, 'cli.doctor.state', { path: rel(cfg.stateDir, cwd) }),
  });
  checks.push({ ok: true, label: t(lang, 'cli.doctor.lang', { lang }) });
  const agentsPath = join(cfg.rootDir, 'AGENTS.md');
  checks.push({
    ok: await exists(agentsPath),
    label: t(lang, (await exists(agentsPath)) ? 'cli.doctor.agents' : 'cli.doctor.agentsMissing', {
      path: rel(agentsPath, cwd),
    }),
    optional: true,
  });
  if (
    (await exists(join(cwd, 'modelroom.json'))) &&
    (await exists(join(cwd, 'modelroom', 'modelroom.json')))
  ) {
    checks.push({
      ok: false,
      label: t(lang, 'cli.doctor.bothConfigs'),
      optional: true,
    });
  }

  const onPath = await which(cfg.agent.command);
  checks.push({
    ok: Boolean(onPath),
    label: t(lang, onPath ? 'cli.doctor.agentPath' : 'cli.doctor.agentMissing', {
      command: cfg.agent.command,
    }),
  });

  const { playwrightAvailable } = await import('../lib/artifact.ts');
  const pw = await playwrightAvailable();
  checks.push({
    ok: pw,
    label: t(lang, pw ? 'cli.doctor.playwright' : 'cli.doctor.playwrightMissing'),
    optional: !pw,
  });

  for (const room of rooms) {
    const missing: string[] = [];
    for (const d of cfg.docs) if (!(await exists(join(cfg.roomsDir, room, d)))) missing.push(d);
    const hasArtifact = await exists(join(cfg.roomsDir, room, cfg.artifact));
    checks.push({
      ok: missing.length === 0 && hasArtifact,
      label: t(lang, 'cli.doctor.room', {
        room,
        detail:
          t(lang, missing.length ? 'cli.doctor.roomMissing' : 'cli.doctor.roomDocsOk', {
            docs: missing.join(', '),
          }) + (hasArtifact ? '' : t(lang, 'cli.doctor.noArtifact', { artifact: cfg.artifact })),
      }),
    });
  }

  let bad = 0;
  for (const check of checks) {
    if (!check.ok) bad++;
    console.log(`${check.ok ? 'ok  ' : 'FAIL'} ${check.label}`);
  }
  const onlyOptional = checks.every((check) => check.ok || check.optional);
  console.log(
    bad
      ? `\n${t(lang, 'cli.doctor.problems', { count: bad })}${onlyOptional ? t(lang, 'cli.doctor.optional') : ''}`
      : `\n${t(lang, 'cli.doctor.allGood')}`,
  );
  process.exit(bad && !onlyOptional ? 1 : 0);
} else {
  console.error(t(earlyLang, 'cli.error.unknownCommand', { cmd }) + '\n');
  usage(earlyLang);
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
  const value = relative(base, p);
  return value || '.';
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
