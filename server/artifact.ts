// modelroom — artifact rendering (HTML → PNG)
//
// The png is a deliverable, not a cache: it sits next to the artifact, is
// overwritten in place under a fixed name, and is committed with the room. That
// is what lets GitHub diff the picture on a pull request — and what lets someone
// review the screen without ever running this.
//
// Rendering needs Playwright. Without it modelroom still works: the room keeps
// whatever snapshot is committed, and `make png` explains what is missing.

import { basename, dirname, join } from 'node:path';
import { stat, readFile, rename, unlink } from 'node:fs/promises';
import type { Config } from '../core/config.ts';
import { DEVICES } from '../core/config.ts';
import { snapshotName } from '../core/rooms.ts';
import { t } from '../i18n/catalog.ts';

export async function playwrightAvailable(): Promise<boolean> {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
}

export const INSTALL_HINT = t('en', 'server.installHint');

export type RenderResult =
  | { ok: true; png: string; width: number; height: number; changed: boolean }
  | { ok: false; error: string };

export type RenderConfig = Pick<Config, 'roomsDir' | 'artifact' | 'lang'> &
  Partial<Pick<Config, 'thumbnail'>>;

const WIDTHS: Record<string, number> = { ...DEVICES };

const widthOf = (device: string | undefined): number =>
  WIDTHS[device ?? ''] ?? WIDTHS.tablet ?? 1024;

// A temp name per run: two renders of the same room (the background pass and the
// button) must not fight over one path.
let tempSeq = 0;
const scratch = (out: string, tag: string): string =>
  join(dirname(out), `.${basename(out)}.${process.pid}.${(tempSeq += 1)}.${tag}`);

/** Where a room's snapshot lives. */
export function snapshotPath(cfg: Pick<Config, 'roomsDir' | 'artifact'>, room: string): string {
  return join(cfg.roomsDir, room, snapshotName(cfg.artifact));
}

// One browser for every render: launching chromium costs more than the render
// itself, and a room list would otherwise pay it once per room. It closes after
// a quiet period so a `serve` that is left running does not keep it alive.
type Browser = import('playwright').Browser;
let browserPromise: Promise<Browser> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_MS = 30_000;

async function browser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import('playwright');
      return chromium.launch();
    })();
  }
  return browserPromise;
}

function keepBorrowed(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void closeBrowser(), IDLE_MS);
  idleTimer.unref?.();
}

export async function closeBrowser(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    await (await pending).close();
  } catch {
    /* already gone */
  }
}

/** Render the artifact to `out` (or a temp path). Returns the written bytes. */
async function renderToFile({
  cfg,
  room,
  device,
  scale,
  out,
}: {
  cfg: RenderConfig;
  room: string;
  device?: string;
  scale?: number;
  out: string;
}): Promise<{ ok: true; width: number; height: number } | { ok: false; error: string }> {
  const src = join(cfg.roomsDir, room, cfg.artifact);
  try {
    await stat(src);
  } catch {
    return {
      ok: false,
      error: t(cfg.lang, 'server.artifactNotFound', {
        path: `${cfg.roomsDir}/${room}/${cfg.artifact}`,
      }),
    };
  }
  const width = widthOf(device);
  let instance: Browser;
  try {
    instance = await browser();
  } catch {
    return { ok: false, error: t(cfg.lang, 'server.installHint') };
  }
  keepBorrowed();
  let page: import('playwright').Page | null = null;
  try {
    page = await instance.newPage({
      viewport: { width, height: 800 },
      deviceScaleFactor: scale ?? 1,
    });
    await page.goto('file://' + src, { waitUntil: 'load' });
    // Fonts settle a frame after load; the artifact has no network, so this is
    // all the waiting the render needs — and it is the same wait every time.
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    const height = await page.evaluate(() =>
      Math.ceil(document.body.getBoundingClientRect().height),
    );
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: out, fullPage: true, type: 'png' });
    return { ok: true, width, height };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await page?.close().catch(() => {});
  }
}

/**
 * Produce a room's snapshot, next to the artifact. When the bytes are unchanged
 * the file is left untouched (`changed: false`), so a commit is only made when
 * the picture actually moved.
 */
export async function renderArtifact({
  cfg,
  room,
  device,
  scale,
  force = false,
}: {
  cfg: RenderConfig;
  room: string;
  device?: string;
  scale?: number;
  force?: boolean;
}): Promise<RenderResult> {
  const out = snapshotPath(cfg, room);
  const tmp = scratch(out, 'tmp');
  const done = await renderToFile({ cfg, room, device, scale, out: tmp });
  if (!done.ok) {
    await unlink(tmp).catch(() => {});
    return done;
  }
  const before = await readFile(out).catch(() => null);
  const after = await readFile(tmp).catch(() => null);
  if (!force && before && after && before.equals(after)) {
    await unlink(tmp).catch(() => {});
    return { ok: true, png: out, width: done.width, height: done.height, changed: false };
  }
  try {
    await rename(tmp, out);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, png: out, width: done.width, height: done.height, changed: true };
}

/**
 * Render to a temp file and compare with the committed snapshot, without
 * touching it. `same: false` means the committed png no longer matches the
 * artifact — the gate `render --check` reports for CI.
 */
export async function checkArtifact({
  cfg,
  room,
  device,
  scale,
}: {
  cfg: RenderConfig;
  room: string;
  device?: string;
  scale?: number;
}): Promise<{ ok: true; same: boolean } | { ok: false; error: string }> {
  const out = snapshotPath(cfg, room);
  const tmp = scratch(out, 'check');
  const done = await renderToFile({ cfg, room, device, scale, out: tmp });
  if (!done.ok) {
    await unlink(tmp).catch(() => {});
    return done;
  }
  const before = await readFile(out).catch(() => null);
  const after = await readFile(tmp).catch(() => null);
  await unlink(tmp).catch(() => {});
  if (!after) return { ok: false, error: t(cfg.lang, 'server.renderFailed') };
  return { ok: true, same: Boolean(before && before.equals(after)) };
}
