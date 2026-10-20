// modelroom — room operations
//
// A room is `rooms/<name>/` with the docs the config names and an artifact. The
// directory name is the record: it has to be unique, and every reference to it
// has to move with it. These are the filesystem operations behind `add`,
// `rename` and `remove`; the CLI and the server call the same ones, so a room
// made from the UI is byte-identical to one made from the command line.
//
// What counts as a reference is `core/roomrefs.ts`, and the name rules live
// there too. This module only moves files.

import {
  readFile,
  writeFile,
  mkdir,
  access,
  readdir,
  rename as fsRename,
  rm as fsRm,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { type Config, type Lang } from './config.ts';
import { readTemplate } from './templates.ts';
import { roomMentions, rewriteRoomRefs, type RoomMention } from './roomrefs.ts';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a room: the directory, every doc the config names, and the artifact.
 * Creating is additive — an existing directory is never overwritten — and the
 * call is refused (by the caller) before it gets here when the name is taken.
 * Returns the absolute paths written, so a caller can report them.
 */
export async function createRoom(
  cfg: Config,
  templatesDir: string,
  lang: Lang,
  room: string,
  title?: string,
): Promise<string[]> {
  const roomDir = join(cfg.roomsDir, room);
  await mkdir(roomDir, { recursive: true });
  const written: string[] = [];
  const targets = [...cfg.docs];
  if (!targets.includes(cfg.artifact)) targets.push(cfg.artifact);
  for (const name of targets) {
    const dest = join(roomDir, name);
    await writeFile(dest, await roomFile(cfg, templatesDir, lang, name, room, title));
    written.push(dest);
  }
  // The docs are the record: a room that cannot carry all of them is not a room.
  for (const name of cfg.docs) {
    if (!(await exists(join(roomDir, name)))) throw new Error(`could not write ${name}`);
  }
  return written;
}

/**
 * A doc or artifact from the shipped templates, or a minimal skeleton when the
 * project names something the templates do not have. `{{room}}` is the room's
 * directory name; `title` replaces the human title on the first doc only.
 */
async function roomFile(
  cfg: Config,
  templatesDir: string,
  lang: Lang,
  name: string,
  room: string,
  title?: string,
): Promise<string> {
  let text: string;
  try {
    text = await readTemplate(templatesDir, lang, join('room', name));
  } catch {
    text = /\.html?$/i.test(name) ? htmlSkeleton(room, lang) : docSkeleton(room);
  }
  text = text.replaceAll('{{room}}', room);
  if (title && name === cfg.docs[0]) text = applyTitle(text, title);
  return text;
}

function applyTitle(text: string, title: string): string {
  return text
    .replace(/^title:.*$/m, () => `title: ${title}`)
    .replace(/^#\s+.*$/m, () => `# ${title}`);
}

function docSkeleton(room: string): string {
  return `---\ntitle: ${room}\n---\n# ${room}\n`;
}

function htmlSkeleton(room: string, lang: Lang): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${room}</title>
</head>
<body>
<h1>${room}</h1>
</body>
</html>
`;
}

/** The docs plus every html file in a room: what a rename or a removal must read. */
export async function roomTextFiles(cfg: Config, room: string): Promise<string[]> {
  const dir = join(cfg.roomsDir, room);
  const out: string[] = cfg.docs.map((d) => join(dir, d));
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isFile() && /\.html?$/i.test(entry.name)) out.push(join(dir, entry.name));
  }
  return [...new Set(out)];
}

/** Which other rooms point at `room` — frontmatter or a path in a doc/artifact. */
export async function referencingRooms(
  cfg: Config,
  room: string,
  names: readonly string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const other of names) {
    if (other === room) continue;
    for (const file of await roomTextFiles(cfg, other)) {
      const text = await readFile(file, 'utf8').catch(() => null);
      if (text === null) continue;
      if (rewriteRoomRefs(text, room, room, cfg.rooms).count) {
        out.push(other);
        break;
      }
    }
  }
  return out;
}

/** One file's rewrite: the new text, how many references, and what is left as prose. */
export interface RewritePlan {
  /** Absolute path. */
  file: string;
  count: number;
  next: string;
  mentions: RoomMention[];
}

/**
 * Read every room's text and rewrite the references to `from` so they point at
 * `to`. Pure with respect to the disk until `applyRename` is called, so a dry
 * run can print the plan without writing.
 */
export async function planRename(
  cfg: Config,
  names: readonly string[],
  from: string,
  to: string,
): Promise<RewritePlan[]> {
  const plans: RewritePlan[] = [];
  for (const name of names) {
    for (const file of await roomTextFiles(cfg, name)) {
      const text = await readFile(file, 'utf8').catch(() => null);
      if (text === null) continue;
      const { text: next, count } = rewriteRoomRefs(text, from, to, cfg.rooms);
      if (!count) continue;
      plans.push({ file, count, next, mentions: roomMentions(next, from) });
    }
  }
  return plans;
}

/** Write the rewritten texts and move the directory (a case-only rename goes via a temp). */
export async function applyRename(
  cfg: Config,
  from: string,
  to: string,
  plans: readonly RewritePlan[],
): Promise<void> {
  for (const plan of plans) await writeFile(plan.file, plan.next);
  const fromDir = join(cfg.roomsDir, from);
  const toDir = join(cfg.roomsDir, to);
  if (from.toLowerCase() === to.toLowerCase()) {
    // A case-only rename is the same directory to a case-insensitive disk:
    // go through a name that differs by more than case.
    const tmp = join(cfg.roomsDir, `${from}.__modelroom_tmp__${Date.now()}`);
    await fsRename(fromDir, tmp);
    await fsRename(tmp, toDir);
  } else {
    await fsRename(fromDir, toDir);
  }
}

/** Delete a room's directory. Who still points at it is the caller's decision. */
export async function removeRoom(cfg: Config, room: string): Promise<void> {
  await fsRm(join(cfg.roomsDir, room), { recursive: true, force: true });
}
