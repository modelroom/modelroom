// modelroom — room references
//
// Renaming a room moves a directory. Everything that pointed at the old name
// still points at it: the `superseded_by` frontmatter and the paths in the docs
// and in the artifacts. This module is the one place that knows what such a
// reference looks like, so the CLI can rewrite them deterministically and a
// removal can count them. It is pure text: no filesystem, no config.
//
// A reference is a *path-shaped* use of the name — preceded by `/`, `.`, `./`,
// `../` or a config rooms prefix, or followed by `/`. A mention in prose is not
// a reference, so it is left alone and reported instead.

export const NEW_ROOM_NAME = /^[a-z0-9][a-z0-9._-]*$/;

/** A name a room may be created or renamed to: lowercase, no trailing dot. */
export function isNewRoomName(value: unknown): value is string {
  return typeof value === 'string' && NEW_ROOM_NAME.test(value) && !value.endsWith('.');
}

/**
 * The existing name that collides with `target`, ignoring case. A macOS or
 * Windows checkout cannot hold `Sign-in` and `sign-in` as two directories, so
 * neither does the CLI.
 */
export function collidingRoom(names: readonly string[], target: string): string | null {
  const lower = target.toLowerCase();
  return names.find((n) => n.toLowerCase() === lower) ?? null;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What may sit just before a path-like token. */
const BEFORE = '(^|[\\s([{"\'`=,])';
/**
 * What may sit just after it, or the end of the string. A trailing period ends a
 * sentence but not a path: `checkout.` is a reference, `checkout.md` is not.
 */
const AFTER = '(?=[/?#)"\',;\\]\\s`]|\\.(?=\\s|$)|$)';

/** Stands in for a reference while the text is rewritten, then becomes the name. */
const SENTINEL = '\u0000modelroom-room\u0000';

export interface RewriteResult {
  /** The text with every reference to `oldName` now pointing at `newName`. */
  text: string;
  /** How many references were found (also counts when old and new are equal). */
  count: number;
}

/**
 * Rewrite every room reference in one text. `rooms` is `cfg.rooms` — the
 * directory the `/rooms/<name>` and `/files/<rooms>/<name>` paths are built
 * from. Passing the same name twice counts the references without changing
 * anything, which is how a removal asks "who still points here?".
 */
export function rewriteRoomRefs(
  text: string,
  oldName: string,
  newName: string,
  rooms = 'rooms',
): RewriteResult {
  if (!oldName) return { text, count: 0 };
  const name = escapeRegExp(oldName);
  const dir = escapeRegExp(rooms.replace(/\/+$/, ''));
  // A reference is replaced by a marker, not by the new name, so a later pattern
  // cannot match the same place twice — which it would when old and new are the
  // same, the way a removal counts references.
  const mark = SENTINEL;
  let count = 0;
  const bump = (): void => {
    count++;
  };

  // frontmatter: `superseded_by: <room>` (quoted or not, comment kept)
  const frontmatter = new RegExp(`^(\\s*superseded_by\\s*:\\s*)(["']?)${name}(["']?)(.*)$`, 'gm');
  text = text.replace(
    frontmatter,
    (_m, head: string, open: string, close: string, rest: string) => {
      bump();
      return `${head}${open}${mark}${close}${rest}`;
    },
  );

  // `/files/<rooms>/<room>` — the served path of a room's file
  const files = new RegExp(`${BEFORE}(\\/files\\/${dir}\\/)${name}${AFTER}`, 'gm');
  text = text.replace(files, (_m, before: string, path: string) => {
    bump();
    return `${before}${path}${mark}`;
  });

  // `/rooms/<room>` — the room's address, which is always literally `/rooms/`
  const address = new RegExp(`${BEFORE}(\\/rooms\\/)${name}${AFTER}`, 'gm');
  text = text.replace(address, (_m, before: string, path: string) => {
    bump();
    return `${before}${path}${mark}`;
  });

  // `<rooms>/<room>` — the directory, with or without a leading slash
  const directory = new RegExp(`${BEFORE}(\\/?${dir}\\/)${name}${AFTER}`, 'gm');
  text = text.replace(directory, (_m, before: string, path: string) => {
    bump();
    return `${before}${path}${mark}`;
  });

  // `../<room>` and `./<room>` — a link from one room to the next
  const relative = new RegExp(`${BEFORE}((?:\\.{1,2}\\/)+)${name}${AFTER}`, 'gm');
  text = text.replace(relative, (_m, before: string, path: string) => {
    bump();
    return `${before}${path}${mark}`;
  });

  // `<room>/...` at the start of a token — a bare relative path
  const bare = new RegExp(`${BEFORE}${name}(?=\\/)`, 'gm');
  text = text.replace(bare, (_m, before: string) => {
    bump();
    return `${before}${mark}`;
  });

  if (count) text = text.split(mark).join(newName);
  return { text, count };
}

export interface RoomMention {
  /** 1-based line number. */
  line: number;
  text: string;
}

/**
 * The places a name is used and is *not* a path — a `title`, an H1, a sentence.
 * They are what a rename leaves to the person (or the agent) to decide.
 */
export function roomMentions(text: string, name: string): RoomMention[] {
  if (!name) return [];
  const pattern = new RegExp(`(^|[^\\w-])${escapeRegExp(name)}([^\\w-]|$)`);
  const out: RoomMention[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (pattern.test(line)) out.push({ line: index + 1, text: line.trim() });
  });
  return out;
}
