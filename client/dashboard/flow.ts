// The dashboard's flow model, kept pure so it can be tested without a DOM.
//
// A room's `app` groups it (user-app, admin-app, …); its `next` is the one edge
// the wireframe draws. The graph is therefore a handful of small, mostly-linear
// groups rather than one tangle, and a group never mixes apps: a `next` that
// crosses an app is dropped here — `modelroom check` is where it is reported.

export interface FlowRoom {
  name: string;
  fields?: Record<string, unknown> | null;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface FlowGroup {
  /** The `app` value, or null for rooms that name none. */
  app: string | null;
  /** Room names, in name order. */
  nodes: string[];
  /** Edges whose two ends are both in this group. */
  edges: FlowEdge[];
}

/** A room's `app`, or null. Free text; only its presence matters here. */
export function appOf(room: { fields?: Record<string, unknown> | null }): string | null {
  const value = room.fields?.app;
  return typeof value === 'string' && value.trim() ? value : null;
}

/** A room's `next`, but only when it names a room that exists. */
export function nextOf(
  room: { fields?: Record<string, unknown> | null },
  known: Set<string>,
): string | null {
  const value = room.fields?.next;
  return typeof value === 'string' && value && known.has(value) ? value : null;
}

/**
 * Group rooms by `app` and connect them by `next`.
 *
 * Groups come back with named apps first (in name order) and the unassigned
 * group last. Rooms with no edges are still a group of one — the view shows
 * them, so "not wired yet" is visible rather than silent.
 */
export function buildFlows(rooms: readonly FlowRoom[], known: Set<string>): FlowGroup[] {
  const groups = new Map<string, FlowGroup>();
  const groupFor = (app: string | null): FlowGroup => {
    const key = app ?? '';
    let group = groups.get(key);
    if (!group) {
      group = { app, nodes: [], edges: [] };
      groups.set(key, group);
    }
    return group;
  };

  const appByName = new Map<string, string | null>();
  for (const room of rooms) {
    const app = appOf(room);
    appByName.set(room.name, app);
    groupFor(app).nodes.push(room.name);
  }

  for (const room of rooms) {
    const to = nextOf(room, known);
    if (!to) continue;
    const fromApp = appByName.get(room.name) ?? null;
    const toApp = appByName.get(to) ?? null;
    if ((fromApp ?? '') !== (toApp ?? '')) continue;
    groupFor(fromApp).edges.push({ from: room.name, to });
  }

  const out = [...groups.values()];
  for (const group of out) group.nodes.sort((a, b) => a.localeCompare(b, 'ja'));
  out.sort((a, b) => {
    if (a.app === null) return 1;
    if (b.app === null) return -1;
    return a.app.localeCompare(b.app, 'ja');
  });
  return out;
}
