// modelroom — keeping every room's snapshot current.
//
// The rule is one line: a room needs rendering when its artifact is newer than
// its png (or the png is missing). Runs are serial, so a fresh `serve` does not
// spawn a browser per room at once, and a room that is already queued is not
// queued twice. Nothing here decides what to do with the file — it is rendered
// next to the artifact, where the room keeps it.

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '../core/config.ts';
import { snapshotName } from '../core/rooms.ts';
import { renderArtifact, type RenderResult } from './artifact.ts';

export interface Thumbnailer {
  /** Queue any of these rooms whose snapshot is missing or older than the artifact. */
  ensure(names?: string[]): Promise<void>;
  /** Stop taking new work. In-flight renders finish. */
  close(): Promise<void>;
}

export function createThumbnailer(
  cfg: Config,
  onRendered: (room: string, result: RenderResult) => void,
): Thumbnailer {
  const queue: string[] = [];
  const queued = new Set<string>();
  let running = false;
  let stopped = false;

  /** Does this room have an artifact whose snapshot is missing or older? */
  async function stale(room: string): Promise<boolean> {
    const dir = join(cfg.roomsDir, room);
    const artifact = await stat(join(dir, cfg.artifact)).catch(() => null);
    if (!artifact) return false; // no artifact: nothing to render
    const png = await stat(join(dir, snapshotName(cfg.artifact))).catch(() => null);
    return !png || artifact.mtimeMs > png.mtimeMs;
  }

  async function work(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      while (queue.length) {
        if (stopped) return;
        const room = queue.shift() as string;
        queued.delete(room);
        const result = await renderArtifact({
          cfg,
          room,
          device: cfg.thumbnail.device,
          scale: cfg.thumbnail.scale,
        });
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
        if (await stale(room)) next.push(room);
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
