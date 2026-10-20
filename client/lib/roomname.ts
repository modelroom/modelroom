// The room-name rule, in the browser.
//
// The server's copy is `core/roomrefs.ts` and it is the one that decides; this
// is the same rule written a second time so the dialog can show ✘ or ✓ while you
// type, without a round trip. When the two disagree, the server wins — a submit
// is refused with the server's own message. The duplication is deliberate: the
// client may not import `core/`.

export const NEW_ROOM_NAME = /^[a-z0-9][a-z0-9._-]*$/;

/** A name a room may be created or renamed to: lowercase, no trailing dot. */
export function isNewRoomName(value: string): boolean {
  return NEW_ROOM_NAME.test(value) && !value.endsWith('.');
}

/**
 * The existing name that collides with `target`, ignoring case — a
 * case-insensitive disk cannot hold `Sign-in` and `sign-in` side by side.
 */
export function collidingRoom(names: readonly string[], target: string): string | null {
  const lower = target.toLowerCase();
  return names.find((name) => name.toLowerCase() === lower) ?? null;
}

export type RoomNameIssue = 'empty' | 'invalid' | 'taken' | 'ok';

/** The one check a dialog needs: is this name usable, and against which room. */
export function roomNameState(
  value: string,
  names: readonly string[],
): { issue: RoomNameIssue; collide: string | null } {
  const name = value.trim();
  if (!name) return { issue: 'empty', collide: null };
  if (!isNewRoomName(name)) return { issue: 'invalid', collide: null };
  const collide = collidingRoom(names, name);
  return { issue: collide ? 'taken' : 'ok', collide };
}

/**
 * The check plus "is it different from the current name" — a rename to the same
 * name changes nothing, so it is not valid. Both the field and its submit button
 * read this, so they cannot disagree.
 */
export function roomNameCheck(
  value: string,
  names: readonly string[],
  current?: string,
): { issue: RoomNameIssue; collide: string | null; same: boolean; valid: boolean } {
  const state = roomNameState(value, names);
  const same = current !== undefined && value.trim() === current;
  return { ...state, same, valid: state.issue === 'ok' && !same };
}
