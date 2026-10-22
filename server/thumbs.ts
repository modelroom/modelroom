// modelroom — keeping every room's snapshot current.
//
// The rule is one line: a room needs rendering when its artifact moved after the
// last render, or a doc named its device after it — `needsRender` in
// `core/rooms.ts` is that line. Runs are serial, so a fresh `serve` does not
// spawn a browser per room at once, and a room that is already queued is not
// queued twice. Nothing here decides what to do with the file — it is rendered
// next to the artifact, where the room keeps it.
//
// A render that produces the same bytes writes nothing (that is the promise that
// keeps a commit honest), so what it drew from is recorded in local state
// instead. Without that record the room would still look stale afterwards, the
// dashboard would ask again, and `serve` would render the same picture forever.

import { saveState, type Config, type State } from '../core/config.ts';
import { needsRender, recordRender, sourceStamp } from '../core/rooms.ts';
import { renderArtifact, type RenderResult } from './artifact.ts';

export interface Thumbnailer {
  /** Queue any of these rooms whose snapshot is missing or older than the artifact. */
  ensure(names?: string[]): Promise<void>;
  /** Stop taking new work. In-flight renders finish. */
  close(): Promise<void>;
}

export function createThumbnailer(
  cfg: Config,
  state: State,
  onRendered: (room: string, result: RenderResult) => void,
): Thumbnailer {
  const queue: string[] = [];
  const queued = new Set<string>();
  let running = false;
  let stopped = false;

  async function work(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      while (queue.length) {
        if (stopped) return;
        const room = queue.shift() as string;
        queued.delete(room);
        // What this render is drawn from is read before it starts: sources that
        // move while it runs have to look stale afterwards, or the record would
        // claim a picture that was never taken.
        const stamp = await sourceStamp(cfg, room);
        // The device is the room's own (else the project's); `renderArtifact`
        // resolves it, so the background pass cannot overwrite a per-room choice.
        const result = await renderArtifact({
          cfg,
          room,
          scale: cfg.thumbnail.scale,
        });
        if (result.ok && recordRender(state.renders, room, stamp)) void saveState(cfg, state);
        onRendered(room, result);
      }
    } finally {
      running = false;
    }
  }

  return {
    async ensure(names) {
      if (stopped) return;
      const next: string[] = [];
      for (const room of names ?? []) {
        if (queued.has(room)) continue;
        if (await needsRender(cfg, room)) next.push(room);
      }
      if (!next.length) return;
      for (const room of next) {
        queued.add(room);
        queue.push(room);
      }
      void work();
    },
    async close() {
      stopped = true;
      queue.length = 0;
      queued.clear();
    },
  };
}
