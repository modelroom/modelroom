#!/usr/bin/env node
// modelroom — CLI
//
//   modelroom [serve] [--port 4321] [--host 127.0.0.1] [--open] [--lang en|ja]
//   modelroom init [<room>] [--dir rooms] [--lang en|ja] [--force] [--skip-install] [--no-script]
//   modelroom check [--json] [--strict]
//   modelroom doctor
//   modelroom render [<room>] [--all] [--check] [--force] [--device <name>]
//
// `modelroom` with no command serves. See docs/03-cli.md.

import { readFile, writeFile, mkdir, access, readdir, stat, rm as fsRm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findConfigPath,
  isLang,
  LANGS,
  loadConfig,
  loadState,
  saveState,
  type Config,
  type Lang,
} from '../core/config.ts';
import { detectLang } from '../core/locale.ts';
import { BUILTIN_DEVICES, isDeviceName, listDevices } from '../core/device.ts';
import { t, type MessageKey } from '../i18n/catalog.ts';
import { readTemplate, ROOM_FILES, SKILLS } from '../core/templates.ts';
import {
  applyRename,
  createRoom,
  planRename,
  referencingRooms,
  removeRoom,
} from '../core/roomops.ts';
import {
  LOCAL_COMMAND,
  SCRIPT_NAME,
  addScript,
  detectPackageManager,
  hasDependency,
  hasScript,
  installCommand,
  isSelfPackage,
  parseManifest,
  scriptCommand,
  scriptFallback,
} from '../core/manifest.ts';
import { projectCommands } from '../core/project.ts';
import { NO_UPDATE_CHECK, checkForUpdate, updateCheckDisabled } from '../core/update.ts';
import { createModelroom } from '../server/http.ts';
import { listRoomNames, roomInfo, snapshotName } from '../core/rooms.ts';
import { collidingRoom, isNewRoomName } from '../core/roomrefs.ts';
import { lintRooms } from './lint.ts';
import { LANG_LABELS, configLanguage, resolveInitLang, shouldAskLang } from './langchoice.ts';
import { keptLine, select } from './prompt.ts';
import { findPackageRoot } from '../core/pkg.ts';

const pkgDir = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
const templatesDir = join(pkgDir, 'templates');

const args = process.argv.slice(2);
const opts: Record<string, string | true> = {};
const flagValues = new Set<number>();
// Flags that never take a value: without this, `init --force checkout` would read
// `checkout` as the value of `--force` and fall back to the default room.
const booleanFlags = new Set([
  'force',
  'no-script',
  'skip-install',
  'open',
  'json',
  'strict',
  'help',
  'version',
  'all',
  'check',
  'yes',
  'dry-run',
]);
for (let i = 0; i < args.length; i++) {
  const arg = args[i] as string;
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const next = args[i + 1];
  if (booleanFlags.has(key)) {
    opts[key] = true;
  } else if (next && !next.startsWith('--')) {
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
  // Ctrl+C stops the tool, and the opencode server it owns goes with it. The
  // timeout is a backstop: `close` waits for open connections, and the chat's SSE
  // stream is one of them.
  let closing = false;
  const pidPath = join(app.cfg.stateDir, 'serve.pid');
  const shutdown = () => {
    if (closing) process.exit(0);
    closing = true;
    setTimeout(() => process.exit(0), 1000).unref();
    void fsRm(pidPath, { force: true }).finally(() => app.close().finally(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  try {
    const { url } = await app.listen();
    // `add`, `rename` and `remove` read this: a room moved under a running
    // server loses the session it holds in memory, so they refuse by default.
    await writeFile(pidPath, String(process.pid)).catch(() => {});
    // The UI is a build output, not a committed file: a source checkout that
    // was never installed has no bundle, and the page would come up blank.
    if (!(await exists(join(pkgDir, 'web', 'assets', 'app.js')))) {
      console.warn(`modelroom: ${t(lang, 'cli.serve.noUi')}`);
    }
    const rooms = await listRoomNames(app.cfg);
    // How this project runs modelroom, so the "no rooms yet" hint is a command
    // that would actually work here.
    const { cli } = await projectCommands(app.cfg);
    console.log(
      [
        `modelroom ${pkg.version}`,
        `  ${url}`,
        `  root     ${app.cfg.rootDir}`,
        t(lang, 'cli.serve.rooms', {
          rooms: rooms.length ? rooms.join(', ') : t(lang, 'cli.serve.roomsNone', { cli }),
        }),
        t(lang, 'cli.serve.agent', {
          line: `${app.cfg.agent.adapter} · ${app.cfg.agent.command} · agent=${app.cfg.agent.agent || '-'} · model=${app.cfg.agent.model || 'default'}`,
        }),
        '',
        t(lang, 'cli.serve.artifacts', { docs: app.cfg.docs.join(', ') }),
        t(lang, 'cli.serve.ctrlC'),
      ].join('\n'),
    );
    // The update check answers after the banner, so the line lands when it
    // knows — and a check with nothing to say prints nothing at all.
    void (async () => {
      const update = await app.update.ready;
      if (!update.available) return;
      console.log(
        t(lang, 'cli.serve.update', { latest: update.latest ?? '', command: update.command }),
      );
    })();
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
  let designDir: string;
  let configPath: string;

  const detected = detectLang();
  // The config's own `lang` is a pin. Without one, a person at a terminal is
  // asked and a script trusts the environment — see bin/langchoice.ts.
  const configLang = existingPath
    ? configLanguage(await readFile(existingPath, 'utf8').catch(() => ''))
    : undefined;

  if (existingPath) {
    cfg = await loadConfig(cwd);
    configPath = cfg.configPath;
  } else {
    designDir = join(cwd, 'modelroom');
    configPath = join(designDir, 'modelroom.json');
    cfg = {
      root: '.',
      rooms: str(opts.dir) ?? 'rooms',
      state: '../.modelroom',
      artifact: 'index.html',
      docs: ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md'],
      port: 4321,
      host: '127.0.0.1',
      lang: detected.lang,
      devices: { ...BUILTIN_DEVICES },
      thumbnail: { device: 'tablet', scale: 1 },
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

  const explicit = isLang(opts.lang) ? opts.lang : undefined;
  const ask = shouldAskLang({ explicit, configLang, interactive: canPrompt() });
  // `undefined` is the person pressing Escape: nothing is written, and the config
  // is left to keep detecting — the same as a non-interactive run.
  const answer = ask ? await askLanguage(detected.lang) : undefined;
  const {
    lang,
    source: langSource,
    write,
  } = resolveInitLang({
    explicit,
    configLang,
    detected,
    answer,
  });
  cfg.lang = lang;
  if (legacy) console.log(t(lang, 'cli.init.legacy', { path: relative(cwd, existingPath) }));

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
    // Auto is the default: no `lang` line unless someone decided it.
    text = write
      ? text.replaceAll('{{lang}}', lang)
      : text.replace(/^[ \t]*"lang": "\{\{lang\}\}",\r?\n/m, '');
    await writeFile(configPath, text);
    written.push(rel(configPath, cwd));
  } else {
    // An existing project keeps its config; an explicit choice updates only what it names.
    const raw = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
    let changed = false;
    if (write && raw.lang !== lang) {
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

  // The project root: the one directory outside modelroom/ that init touches.
  // It owns the .gitignore line and, when the project has one, the package.json.
  // It comes first because the generated files below name the command that
  // actually runs here, and `init` may add the script just underneath.
  const projectRoot = dirname(cfg.stateDir);
  const gitignorePath = join(projectRoot, '.gitignore');
  const stateName = relative(projectRoot, cfg.stateDir) || basename(cfg.stateDir);
  const entry = `/${stateName.replaceAll('\\', '/')}/`;
  const gitignoreText = await readFile(gitignorePath, 'utf8').catch(() => '');
  if (!gitignoreText.includes(entry)) {
    await mkdir(projectRoot, { recursive: true });
    await writeFile(
      gitignorePath,
      (gitignoreText ? gitignoreText.replace(/\n?$/, '\n') : '') + entry + '\n',
    );
    written.push(t(lang, 'cli.init.gitignore', { path: entry }));
  }

  // The everyday command, `npm run modelroom`: one script in the consumer's own
  // package.json. The file is never created here, an existing key is kept,
  // and the dependency is installed rather than written by hand, so the
  // manifest and the lockfile cannot disagree.
  await addManifestScript({
    dir: projectRoot,
    base: cwd,
    version: pkg.version,
    lang,
    force,
    skipInstall: Boolean(opts['skip-install']),
    noScript: Boolean(opts['no-script']),
    written,
  });

  // What the layer's agent instructions tell the agent to run. The project's own
  // command, not a hardcoded `npx`: a project that pins its manager through
  // `devEngines` refuses every npm command, `npx` included.
  const { cli, cliLatest } = await projectCommands(cfg);

  const agentsDest = join(cfg.rootDir, 'AGENTS.md');
  if (!force && (await exists(agentsDest))) {
    console.log(t(lang, 'cli.init.skip', { label: rel(agentsDest, cwd) }));
  } else {
    const src = await readTemplate(templatesDir, lang, 'AGENTS.md');
    await writeFile(agentsDest, fillGenerated(src, { cli, cliLatest }));
    written.push(rel(agentsDest, cwd));
  }

  // DESIGN.md is the project's, not modelroom's: `init` seeds it once and
  // `update` leaves it alone, the way it leaves a room alone. The layer's shared
  // tokens, components and accessibility floor live here; a room references it.
  const designDest = join(cfg.rootDir, 'DESIGN.md');
  if (!force && (await exists(designDest))) {
    console.log(t(lang, 'cli.init.skip', { label: rel(designDest, cwd) }));
  } else {
    await writeFile(designDest, await readTemplate(templatesDir, lang, 'DESIGN.md'));
    written.push(rel(designDest, cwd));
  }

  // The skills, next to the agent that runs in this layer. `.agents/skills/` is
  // the portable location — OpenCode and Claude Code both read it. (OpenCode
  // also reads its own `.opencode/skills/`.) See docs/04-agents.md.
  for (const id of SKILLS) {
    const dest = join(cfg.rootDir, '.agents', 'skills', id, 'SKILL.md');
    if (!force && (await exists(dest))) {
      console.log(t(lang, 'cli.init.skip', { label: rel(dest, cwd) }));
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    const src = await readTemplate(templatesDir, lang, join('skills', id, 'SKILL.md'));
    await writeFile(dest, fillGenerated(src, { cli, cliLatest }));
    written.push(rel(dest, cwd));
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
  console.log(t(lang, 'cli.init.nextCmd', { cli }));
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

// ── render ──────────────────────────────────────────────────────────────────
// The png next to an artifact is the room's snapshot: what a reviewer reads and
// what GitHub diffs on a pull request. `render` brings it up to date and is
// idempotent — a render whose bytes do not change writes nothing, so the
// committed file only moves when the picture does. `--check` renders to a temp
// file and compares instead, so CI can hold the line.
else if (cmd === 'render') {
  const cfg = await loadConfig(cwd);
  const lang = isLang(opts.lang) ? opts.lang : cfg.lang;
  // No `--device`: each room uses its own (frontmatter), else the project's.
  const device = str(opts.device);
  if (device && !isDeviceName(cfg.devices, device)) {
    console.error(
      t(lang, 'cli.render.unknownDevice', {
        device,
        devices: listDevices(cfg.devices)
          .map((d) => d.name)
          .join(', '),
      }),
    );
    process.exit(1);
  }
  const scale = str(opts.scale) ? Number(opts.scale) : cfg.thumbnail.scale;
  const check = Boolean(opts.check);
  const force = Boolean(opts.force);
  const names = await listRoomNames(cfg);
  const named = positional[1];
  if (named && !names.includes(named)) {
    console.error(t(lang, 'cli.render.noRoom', { room: named }));
    process.exit(1);
  }
  // No argument renders every room; only the stale ones actually render.
  const targets = opts.all || !named ? names : [named];
  if (!targets.length) {
    console.error(t(lang, 'cli.render.needsTarget'));
    process.exit(1);
  }

  const { renderArtifact, checkArtifact } = await import('../server/artifact.ts');
  let written = 0;
  let same = 0;
  let failed = 0;
  for (const room of targets) {
    if (check) {
      const result = await checkArtifact({ cfg, room, device, scale });
      if (!result.ok) {
        failed++;
        console.log(t(lang, 'cli.render.error', { room, message: result.error }));
      } else if (result.same) {
        same++;
        console.log(t(lang, 'cli.render.same', { room, device: result.device }));
      } else {
        failed++;
        console.log(t(lang, 'cli.render.differs', { room, device: result.device }));
      }
      continue;
    }
    const result = await renderArtifact({ cfg, room, device, scale, force });
    if (!result.ok) {
      failed++;
      console.log(t(lang, 'cli.render.error', { room, message: result.error }));
    } else if (result.changed) {
      written++;
      console.log(
        t(lang, 'cli.render.updated', {
          room,
          file: rel(result.png, cwd),
          device: result.device,
        }),
      );
    } else {
      same++;
      console.log(t(lang, 'cli.render.unchanged', { room, device: result.device }));
    }
  }
  if (check) {
    console.log(
      `\n${t(lang, failed ? 'cli.render.checkSummary' : 'cli.render.upToDate', { count: failed })}`,
    );
  } else {
    console.log(`\n${t(lang, 'cli.render.summary', { rooms: targets.length, written, same })}`);
  }
  process.exit(failed ? 1 : 0);
}

// ── pr-body ─────────────────────────────────────────────────────────────────
// The material a reviewer needs, in one place: what the room is, where the
// snapshot is, and what it promises. The agent fills in the diff context and
// opens the PR; modelroom does not touch git or gh.
else if (cmd === 'pr-body') {
  const cfg = await loadConfig(cwd);
  const lang = isLang(opts.lang) ? opts.lang : cfg.lang;
  const named = positional[1];
  const names = await listRoomNames(cfg);
  if (!named || !names.includes(named)) {
    console.error(t(lang, 'cli.render.noRoom', { room: named ?? '' }));
    process.exit(1);
  }
  const info = await roomInfo(cfg, named);
  const png = snapshotName(cfg.artifact);
  const strip = (text: string): string =>
    text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const behaviour = await readFile(join(cfg.roomsDir, named, 'BEHAVIOUR.md'), 'utf8').catch(
    () => null,
  );
  const imageUrl = str(opts['image-url']);
  const lines: string[] = [`## ${info.title || named}`, ''];
  if (info.summary) lines.push(info.summary, '');
  lines.push(
    imageUrl
      ? `![${info.title || named}](${imageUrl})`
      : t(lang, 'cli.pr.snapshot', { path: `${cfg.rooms}/${named}/${png}` }),
    '',
  );
  if (behaviour && strip(behaviour).trim()) {
    lines.push(t(lang, 'cli.pr.behaviour'), '', strip(behaviour).trim(), '');
  }
  console.log(lines.join('\n').trimEnd());
}

// ── add ─────────────────────────────────────────────────────────────────────
// A room is `rooms/<name>/` with the required docs. The directory name is the
// record, so it has to be unique and it has to carry every doc the config names.
// Creating is additive: an existing directory is never overwritten. `new` is a
// hidden alias, for the muscle memory `cargo new` and the like.
else if (cmd === 'add' || cmd === 'new') {
  const cfg = await loadConfig(cwd);
  const lang = isLang(opts.lang) ? opts.lang : cfg.lang;
  const { cli } = await projectCommands(cfg);
  const room = positional[1] ?? str(opts.room) ?? '';
  if (!(await findConfigPath(cwd))) {
    console.error(t(lang, 'cli.room.noConfig', { cli }));
    process.exit(1);
  }
  if (!room) {
    console.error(t(lang, 'cli.room.needsName', { cli, verb: 'add' }));
    process.exit(1);
  }
  if (!isNewRoomName(room)) {
    console.error(t(lang, 'cli.room.invalidName', { room }));
    process.exit(1);
  }
  const names = await listRoomNames(cfg);
  const collide = collidingRoom(names, room);
  if (collide) {
    console.error(
      t(lang, collide === room ? 'cli.room.exists' : 'cli.room.caseExists', {
        room,
        name: collide,
      }),
    );
    process.exit(1);
  }
  const written = await createRoom(cfg, templatesDir, lang, room, str(opts.title));
  console.log(t(lang, 'cli.room.created', { room }));
  for (const w of written) console.log(`  ${rel(w, cwd)}`);
  console.log(`\n${t(lang, 'cli.room.next', { cli, port: cfg.port, room })}`);
}

// ── rename ──────────────────────────────────────────────────────────────────
// Move the directory and the references to it. The script rewrites what is a
// path — `superseded_by`, `/rooms/<name>`, `/files/<rooms>/<name>`, relative
// links — and lists the places that merely mention the old name, which are for
// a person to read. See docs/03-cli.md.
else if (cmd === 'rename' || cmd === 'mv') {
  const cfg = await loadConfig(cwd);
  const lang = isLang(opts.lang) ? opts.lang : cfg.lang;
  const { cli } = await projectCommands(cfg);
  if (!(await findConfigPath(cwd))) {
    console.error(t(lang, 'cli.room.noConfig', { cli }));
    process.exit(1);
  }
  const from = positional[1] ?? '';
  const to = positional[2] ?? '';
  if (!from || !to) {
    console.error(t(lang, 'cli.room.needsRename', { cli }));
    process.exit(1);
  }
  if (!isNewRoomName(to)) {
    console.error(t(lang, 'cli.room.invalidName', { room: to }));
    process.exit(1);
  }
  if (from === to) {
    console.error(t(lang, 'cli.room.sameName', { room: from }));
    process.exit(1);
  }
  const names = await listRoomNames(cfg);
  if (!names.includes(from)) {
    console.error(t(lang, 'cli.render.noRoom', { room: from }));
    process.exit(1);
  }
  const collide = collidingRoom(names, to);
  if (collide) {
    console.error(
      t(lang, collide === to ? 'cli.room.exists' : 'cli.room.caseExists', {
        room: to,
        name: collide,
      }),
    );
    process.exit(1);
  }
  await refuseWhenServing(cfg, lang, Boolean(opts.force));

  const dry = Boolean(opts['dry-run']);
  const plans = await planRename(cfg, names, from, to);

  console.log(t(lang, 'cli.room.renamed', { from, to }));
  if (!dry) {
    await applyRename(cfg, from, to, plans);
    if (await moveSession(cfg, from, to))
      console.log(t(lang, 'cli.room.sessionMoved', { from, to }));
  } else {
    console.log(`  ${rel(join(cfg.roomsDir, from), cwd)} → ${rel(join(cfg.roomsDir, to), cwd)}`);
  }

  for (const p of plans) {
    const path = rel(p.file, cwd);
    console.log(t(lang, 'cli.room.rewrite', { count: p.count, file: path }));
    for (const m of p.mentions) console.log(`    ${path}:${m.line}  ${m.text}`);
  }
  if (dry) console.log(t(lang, 'cli.room.dryRun'));
  else console.log(`\n${t(lang, 'cli.room.next', { cli, port: cfg.port, room: to })}`);
}

// ── remove ──────────────────────────────────────────────────────────────────
// Deleting a room is a human decision, so it takes `--yes`. An agent retires a
// room with `deprecated: true` and `superseded_by` instead. A room another room
// still points at is refused unless `--force`.
else if (cmd === 'remove' || cmd === 'rm') {
  const cfg = await loadConfig(cwd);
  const lang = isLang(opts.lang) ? opts.lang : cfg.lang;
  const { cli } = await projectCommands(cfg);
  if (!(await findConfigPath(cwd))) {
    console.error(t(lang, 'cli.room.noConfig', { cli }));
    process.exit(1);
  }
  const room = positional[1] ?? '';
  if (!room) {
    console.error(t(lang, 'cli.room.needsName', { cli, verb: 'remove' }));
    process.exit(1);
  }
  const names = await listRoomNames(cfg);
  if (!names.includes(room)) {
    console.error(t(lang, 'cli.render.noRoom', { room }));
    process.exit(1);
  }
  await refuseWhenServing(cfg, lang, Boolean(opts.force));
  const refs = await referencingRooms(cfg, room, names);
  const force = Boolean(opts.force);
  // A dry run reports first: who still points here is exactly what the person
  // wants to see before deciding.
  if (opts['dry-run']) {
    console.log(t(lang, 'cli.room.wouldRemove', { room }));
    for (const r of refs) console.log(`    ${r}`);
    if (refs.length && !force) {
      console.log(t(lang, 'cli.room.referenced', { room, rooms: refs.join(', ') }));
    }
    console.log(t(lang, 'cli.room.dryRun'));
    process.exit(0);
  }
  if (refs.length && !force) {
    console.error(t(lang, 'cli.room.referenced', { room, rooms: refs.join(', ') }));
    process.exit(1);
  }
  if (!opts.yes) {
    console.error(t(lang, 'cli.room.confirm', { room }));
    process.exit(1);
  }
  await removeRoom(cfg, room);
  const state = await loadState(cfg);
  if (state.sessions[room]) {
    delete state.sessions[room];
    await saveState(cfg, state);
  }
  console.log(t(lang, 'cli.room.removed', { room }));
  if (refs.length) console.log(t(lang, 'cli.room.forcedRefs', { rooms: refs.join(', ') }));
}

// ── update ──────────────────────────────────────────────────────────────────
// The layer's generated files — the skills and AGENTS.md — change with the
// version of modelroom, so `update` refreshes them from the installed package.
// It never touches a room or modelroom.json: those belong to the project.
else if (cmd === 'update') {
  const cfg = await loadConfig(cwd);
  const lang = isLang(opts.lang) ? opts.lang : cfg.lang;
  const { cli } = await projectCommands(cfg);
  if (!(await findConfigPath(cwd))) {
    console.error(t(lang, 'cli.room.noConfig', { cli }));
    process.exit(1);
  }
  const dry = Boolean(opts['dry-run']);
  let changed = 0;
  let same = 0;
  for (const target of await generatedFiles(cfg, lang)) {
    const path = rel(target.path, cwd);
    const current = await readFile(target.path, 'utf8').catch(() => null);
    if (current === target.text) {
      same++;
      console.log(t(lang, 'cli.update.same', { file: path }));
      continue;
    }
    changed++;
    console.log(t(lang, dry ? 'cli.update.dry' : 'cli.update.changed', { file: path }));
    if (!dry) {
      await mkdir(dirname(target.path), { recursive: true });
      await writeFile(target.path, target.text);
    }
  }
  console.log(`\n${t(lang, 'cli.update.summary', { changed, same })}`);
  if (dry) console.log(t(lang, 'cli.room.dryRun'));
}

// ── doctor ──────────────────────────────────────────────────────────────────
else if (cmd === 'doctor') {
  const cfg = await loadConfig(cwd);
  const lang = isLang(opts.lang) ? opts.lang : cfg.lang;
  const commands = await projectCommands(cfg);
  const { cli } = commands;
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
  const uiBuilt = await exists(join(pkgDir, 'web', 'assets', 'app.js'));
  checks.push({
    ok: uiBuilt,
    label: t(lang, uiBuilt ? 'cli.doctor.ui' : 'cli.doctor.uiMissing'),
  });
  checks.push({ ok: true, label: t(lang, 'cli.doctor.lang', { lang }) });
  // The one outbound check, and only a note: a newer modelroom is never a
  // "problem" — installing it is a decision, and one `doctor` does not make.
  // A successful answer is cached in local state, the same place `serve` keeps it.
  const cached = await loadState(cfg);
  const { check: update, fetched } = await checkForUpdate({
    current: pkg.version,
    cached: cached.update,
  });
  if (fetched && update.latest) {
    cached.update = { latest: update.latest, checkedAt: update.checkedAt };
    await saveState(cfg, cached);
  }
  checks.push({
    ok: !update.available,
    optional: true,
    label: update.available
      ? t(lang, 'cli.doctor.update', {
          latest: update.latest ?? '',
          current: update.current,
          command: commands.update,
        })
      : updateCheckDisabled()
        ? t(lang, 'cli.doctor.updateOff', { env: NO_UPDATE_CHECK })
        : update.latest
          ? t(lang, 'cli.doctor.updateCurrent', { current: update.current })
          : t(lang, 'cli.doctor.updateUnknown'),
  });
  const agentsPath = join(cfg.rootDir, 'AGENTS.md');
  checks.push({
    ok: await exists(agentsPath),
    label: t(lang, (await exists(agentsPath)) ? 'cli.doctor.agents' : 'cli.doctor.agentsMissing', {
      path: rel(agentsPath, cwd),
    }),
    optional: true,
  });
  const designPath = join(cfg.rootDir, 'DESIGN.md');
  checks.push({
    ok: await exists(designPath),
    label: t(lang, (await exists(designPath)) ? 'cli.doctor.design' : 'cli.doctor.designMissing', {
      path: rel(designPath, cwd),
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

  const { playwrightAvailable } = await import('../server/artifact.ts');
  const pw = await playwrightAvailable();
  checks.push({
    ok: pw,
    label: t(lang, pw ? 'cli.doctor.playwright' : 'cli.doctor.playwrightMissing'),
    optional: !pw,
  });

  const png = snapshotName(cfg.artifact);
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
    if (!hasArtifact) continue;
    // A stale snapshot is a warning, not a failure: it is exactly what the next
    // render fixes, and a checkout without Playwright cannot fix it here.
    const source = await stat(join(cfg.roomsDir, room, cfg.artifact)).catch(() => null);
    const snapshot = await stat(join(cfg.roomsDir, room, png)).catch(() => null);
    const stale = !snapshot || (source?.mtimeMs ?? 0) > snapshot.mtimeMs;
    checks.push({
      ok: !stale,
      optional: true,
      label: t(lang, stale ? 'cli.doctor.snapshotStale' : 'cli.doctor.snapshot', {
        room,
        png,
        cli,
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
/** Fill the placeholders the generated files share (AGENTS.md and the skills). */
function fillGenerated(text: string, values: { cli: string; cliLatest: string }): string {
  return text.replaceAll('{{cli}}', values.cli).replaceAll('{{cliLatest}}', values.cliLatest);
}

/**
 * `npm run modelroom` in the consumer's project. The script is what people type,
 * so it is written whenever a package.json exists and lacks the key; the
 * dependency is what makes the script instant, so it is installed with the
 * project's own package manager instead of being written by hand — a manifest
 * and a lockfile that disagree would break `npm ci`.
 *
 * Returns true when the script was written.
 */
async function addManifestScript({
  dir,
  base,
  version,
  lang,
  force,
  skipInstall,
  noScript,
  written,
}: {
  dir: string;
  base: string;
  version: string;
  lang: Lang;
  force: boolean;
  skipInstall: boolean;
  noScript: boolean;
  written: string[];
}): Promise<boolean> {
  if (noScript) return false;

  const path = join(dir, 'package.json');
  const text = await readFile(path, 'utf8').catch(() => null);
  if (text === null) return false; // no manifest: npx stays the way in, and we stay out

  const manifest = parseManifest(text);
  if (!manifest) {
    console.log(t(lang, 'cli.init.scriptInvalid'));
    return false;
  }
  // The manager decides both how the dependency is installed and what the
  // fallback script says when there is no local install.
  const pm = detectPackageManager(await readdir(dir).catch(() => []));
  const label = `${rel(path, base)} scripts.${SCRIPT_NAME}`;
  if (hasScript(manifest, SCRIPT_NAME) && !force) {
    console.log(t(lang, 'cli.init.skip', { label }));
    return false;
  }

  const spec = `${SCRIPT_NAME}@^${version}`;
  // A dependency already there (or this repo *being* modelroom) needs no install.
  let local = hasDependency(manifest, SCRIPT_NAME) || isSelfPackage(manifest);
  if (!local && skipInstall) {
    console.log(t(lang, 'cli.init.depsSkipped'));
  } else if (!local) {
    const call = installCommand(pm, spec);
    const install = await runPackageManager(dir, call);
    local = install.ok;
    console.log(
      install.ok
        ? t(lang, 'cli.init.deps', { spec, pm })
        : t(lang, 'cli.init.depsFailed', {
            spec,
            pm,
            script: scriptCommand(pm, SCRIPT_NAME),
            command: `${call.command} ${call.args.join(' ')}`,
          }),
    );
    if (!install.ok && install.detail) console.log(`  ${install.detail}`);
  }

  // The package manager rewrote the manifest, so read it again: the script must
  // land next to the dependency entry it wrote, not on a stale copy.
  const after = local ? await readFile(path, 'utf8').catch(() => text) : text;
  const value = local ? LOCAL_COMMAND : scriptFallback(pm, SCRIPT_NAME);
  const edit = addScript(after, SCRIPT_NAME, value, { overwrite: force });
  if (!edit.ok) {
    console.log(
      t(lang, edit.reason === 'invalid' ? 'cli.init.scriptInvalid' : 'cli.init.scriptBadScripts'),
    );
    return false;
  }
  if (!edit.changed) {
    if (!force) console.log(t(lang, 'cli.init.skip', { label }));
    return false;
  }

  await writeFile(path, edit.text);
  written.push(t(lang, 'cli.init.script', { name: SCRIPT_NAME, value }));
  return true;
}

/** Run the project's package manager with stdin closed; a failure is ours to report. */
function runPackageManager(
  dir: string,
  call: { command: string; args: string[] },
): Promise<{ ok: boolean; detail?: string }> {
  return new Promise((settle) => {
    const child = spawn(call.command, call.args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const keep = (b: Buffer): void => {
      output += String(b);
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);
    child.on('error', () => settle({ ok: false })); // no such manager on PATH
    child.on('close', (code) =>
      settle(code === 0 ? { ok: true } : { ok: false, detail: lastLine(output) }),
    );
  });
}

/** The last thing the package manager said, for the one line we print on failure. */
function lastLine(output: string): string | undefined {
  let line: string | undefined;
  for (const raw of output.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed) line = trimmed;
  }
  return line ? line.slice(0, 200) : undefined;
}

// ── the language question ───────────────────────────────────────────────────

/** `init` asks only when a person is at the terminal to answer, and CI never is. */
function canPrompt(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true && !process.env.CI;
}

/**
 * The one question `init` asks. The cursor starts on the detected language, but
 * the question itself is shown in both languages: it is asked *because* the
 * detection may be wrong, so it cannot be the thing that words the question.
 */
function askLanguage(initial: Lang): Promise<Lang | undefined> {
  const both = (key: MessageKey): string => `${t('en', key)} / ${t('ja', key)}`;
  const choices = LANGS.map((value) => ({ value, label: LANG_LABELS[value] }));
  const question = both('cli.init.promptLang');
  return select(question, choices, {
    initial: Math.max(0, LANGS.indexOf(initial)),
    // Escape leaves the language auto, which is a real answer, not a mishap.
    cancelLine: keptLine(question, both('cli.init.promptKeep')),
  });
}

// ── room operations ─────────────────────────────────────────────────────────

/** The pid of a running `serve`, or null. `EPERM` means the process exists. */
async function servePid(cfg: Config): Promise<number | null> {
  const raw = await readFile(join(cfg.stateDir, 'serve.pid'), 'utf8').catch(() => null);
  const pid = raw ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM' ? pid : null;
  }
}

/**
 * A room moved under a running server loses the session it holds in memory, so
 * the room commands stop unless `--force` says the person meant it.
 */
async function refuseWhenServing(cfg: Config, lang: Lang, force: boolean): Promise<void> {
  if (force) return;
  const pid = await servePid(cfg);
  if (pid) {
    console.error(t(lang, 'cli.room.serveRunning', { pid }));
    process.exit(1);
  }
}

/** Carry the room's chat session across a rename, so the conversation stays. */
async function moveSession(cfg: Config, from: string, to: string): Promise<boolean> {
  const state = await loadState(cfg);
  const session = state.sessions[from];
  if (!session) return false;
  state.sessions[to] = session;
  delete state.sessions[from];
  await saveState(cfg, state);
  return true;
}

/** The generated files `update` refreshes: the skills and AGENTS.md. */
async function generatedFiles(
  cfg: Config,
  lang: Lang,
): Promise<Array<{ path: string; text: string }>> {
  const out: Array<{ path: string; text: string }> = [];
  const commands = await projectCommands(cfg);
  for (const id of SKILLS) {
    out.push({
      path: join(cfg.rootDir, '.agents', 'skills', id, 'SKILL.md'),
      text: fillGenerated(
        await readTemplate(templatesDir, lang, join('skills', id, 'SKILL.md')),
        commands,
      ),
    });
  }
  out.push({
    path: join(cfg.rootDir, 'AGENTS.md'),
    text: fillGenerated(await readTemplate(templatesDir, lang, 'AGENTS.md'), commands),
  });
  return out;
}

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
