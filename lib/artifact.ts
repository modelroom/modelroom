// modelroom — optional artifact rendering (HTML → PNG)
//
// Rendering is optional: it needs Playwright with a browser installed. If it is not
// there, modelroom still works — the room just has no thumbnail.

import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import type { Config } from './config.ts';
import { t } from './i18n.ts';

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
  | { ok: true; png: string; width: number; height: number }
  | { ok: false; error: string };

const WIDTHS: Record<string, number> = { sp: 390, tablet: 1024, pc: 1280 };

/**
 * Render `rooms/<room>/<artifact>` to `<artifact>.png` next to it.
 */
export async function renderArtifact({
  cfg,
  room,
  device = 'tablet',
  scale = 2,
}: {
  cfg: Pick<Config, 'rooms' | 'roomsDir' | 'artifact' | 'lang'>;
  room: string;
  device?: string;
  scale?: number;
}): Promise<RenderResult> {
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    return { ok: false, error: t(cfg.lang, 'server.installHint') };
  }
  const width = WIDTHS[device] ?? 1024;
  const src = join(cfg.roomsDir, room, cfg.artifact);
  const out = src.replace(/\.html?$/i, '.png');
  try {
    await stat(src);
  } catch {
    return {
      ok: false,
      error: t(cfg.lang, 'server.artifactNotFound', {
        path: `${cfg.rooms}/${room}/${cfg.artifact}`,
      }),
    };
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      deviceScaleFactor: scale,
    });
    await page.goto('file://' + src, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(250);
    const height = await page.evaluate(() =>
      Math.ceil(document.body.getBoundingClientRect().height),
    );
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    await page.screenshot({ path: out, fullPage: true, type: 'png' });
    return { ok: true, png: out, width, height };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await browser.close().catch(() => {});
  }
}
