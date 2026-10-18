// modelroom — browser verification for the tool UI.
//
// Starts the server against this repo's config, drives the four pages in
// Chromium, and answers the questions a build cannot:
//
//   · does every page load with an empty console (regression)
//   · does axe find any critical or serious violation (accessibility)
//   · does the filter narrow 1000 candidates promptly, and can it be driven
//     with the keyboard alone (the migration's acceptance criteria)
//
// Screenshots land in `.modelroom/verify/` (git-ignored, local only).
//
//   node scripts/verify-ui.mjs [--headed]

import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createModelroom } from '../lib/server.ts';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(pkgDir, '.modelroom', 'verify');
const axeSource = await readFile(join(pkgDir, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const report = { pages: [], filter: {}, failures: [] };
const results = [];
const check = (ok, label, extra = '') => {
  results.push({ ok: Boolean(ok), label, extra });
  if (!ok) report.failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
};

const port = await freePort();
const app = await createModelroom({ cwd: pkgDir, port, host: '127.0.0.1' });
app.startWatching();
const { url } = await app.listen();
await mkdir(outDir, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
});

const PAGES = [
  { name: 'dashboard', path: '/' },
  { name: 'room', path: '/room/sign-in' },
  { name: 'settings', path: '/settings' },
  { name: 'kit', path: '/ui/kit.html' },
];

try {
  for (const entry of PAGES) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    await page.goto(`${url}${entry.path}`, { waitUntil: 'networkidle' });
    // The shells render React on the client; wait for the app, not just the HTML.
    await page.waitForTimeout(400);

    await page.screenshot({ path: join(outDir, `${entry.name}.png`), fullPage: false });

    await page.addScriptTag({ content: axeSource });
    const axe = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        resultTypes: ['violations'],
      });
      return result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.length,
      }));
    });
    const serious = axe.filter((v) => v.impact === 'critical' || v.impact === 'serious');

    report.pages.push({
      name: entry.name,
      path: entry.path,
      consoleErrors,
      violations: axe,
      serious: serious.length,
    });

    check(consoleErrors.length === 0, `${entry.name}: console is clean`, consoleErrors.join(' | '));
    check(
      serious.length === 0,
      `${entry.name}: axe has no critical/serious violations`,
      serious.map((v) => `${v.id}(${v.impact}×${v.nodes})`).join(', ') ||
        `${axe.length} minor violation(s)`,
    );
    await page.close();
  }

  // ── the theme switch ──────────────────────────────────────────────────────
  const themePage = await context.newPage();
  const themeErrors = [];
  themePage.on('console', (message) => {
    if (message.type() === 'error') themeErrors.push(message.text());
  });
  themePage.on('pageerror', (error) => themeErrors.push(String(error)));
  await themePage.goto(`${url}/`, { waitUntil: 'networkidle' });
  await themePage.waitForTimeout(300);

  const scheme = () =>
    themePage.evaluate(() => document.documentElement.getAttribute('data-mantine-color-scheme'));

  const lightScheme = await scheme();
  await themePage.getByRole('button', { name: 'Dark theme' }).click();
  await themePage.waitForTimeout(250);
  const darkScheme = await scheme();
  await themePage.screenshot({ path: join(outDir, 'dashboard-dark.png') });
  check(
    lightScheme === 'light' && darkScheme === 'dark',
    `theme: the switch flips the colour scheme (${lightScheme} → ${darkScheme})`,
  );

  await themePage.reload({ waitUntil: 'networkidle' });
  const afterReload = await scheme();
  check(afterReload === 'dark', 'theme: the choice survives a reload', String(afterReload));
  check(
    themeErrors.length === 0,
    'theme: console is clean across the switch',
    themeErrors.join(' | '),
  );
  await themePage.close();

  // ── the filter, on the workshop's 1000 candidates ─────────────────────────
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  await page.goto(`${url}/ui/kit.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const input = page.locator('input[aria-label="component filter"]');
  check((await input.count()) === 1, 'filter: the virtualised control is on the page');

  check(
    (await input.getAttribute('role')) === 'combobox',
    'filter: the target is role=combobox',
    String(await input.getAttribute('role')),
  );

  await input.click();
  await page.waitForTimeout(150);
  check(
    (await input.getAttribute('aria-expanded')) === 'true',
    'filter: aria-expanded is true while open',
  );
  await page.screenshot({ path: join(outDir, 'filter-open.png') });

  // One character in, measured from the input event to the next paint — the
  // acceptance criterion is "reflected within 200ms".
  await page.evaluate(() => {
    const el = document.querySelector('input[aria-label="component filter"]');
    el.addEventListener(
      'input',
      () => {
        window.filterInputAt = performance.now();
      },
      { once: true, capture: true },
    );
  });

  await input.press('4');

  const narrowMs = await page.evaluate(async () => {
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return Math.round(performance.now() - window.filterInputAt);
  });
  report.filter.narrowMs = narrowMs;
  check(narrowMs < 200, `filter: 1 character narrows 1000 candidates in ${narrowMs}ms`, '< 200ms');

  // Narrow to a single candidate, the same way a person would finish typing.
  await input.fill('0042');
  await page.waitForTimeout(120);

  const optionCount = await input.evaluate((field) => {
    const listId = field.getAttribute('aria-controls');
    const list = listId ? document.getElementById(listId) : null;
    return list ? list.querySelectorAll('[role="option"]').length : -1;
  });
  check(optionCount === 1, `filter: only matching options are rendered (${optionCount})`);

  // Keyboard: ↓ moves, Enter selects, and the chip list follows.
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(50);
  const active = await input.getAttribute('aria-activedescendant');
  check(Boolean(active), 'filter: ArrowDown sets aria-activedescendant', String(active));

  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const chip = page.getByText('component-0042', { exact: true });
  check((await chip.count()) >= 1, 'filter: Enter selects the option and a chip appears');
  await page.screenshot({ path: join(outDir, 'filter-selected.png') });

  // Backspace on an empty search removes the last chip.
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(120);
  check(
    (await page.getByText('component-0042', { exact: true }).count()) === 0,
    'filter: Backspace on an empty search removes the chip',
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  check(
    (await input.getAttribute('aria-expanded')) === 'false',
    'filter: Escape closes the dropdown',
  );

  check(consoleErrors.length === 0, 'filter: console is clean', consoleErrors.join(' | '));

  await page.screenshot({ path: join(outDir, 'filter-closed.png') });
  await page.close();
  // ── a filter survives a reload ────────────────────────────────────────────
  const urlPage = await context.newPage();
  const urlErrors = [];
  urlPage.on('console', (message) => {
    if (message.type() === 'error') urlErrors.push(message.text());
  });
  urlPage.on('pageerror', (error) => urlErrors.push(String(error)));
  await urlPage.goto(`${url}/`, { waitUntil: 'networkidle' });
  await urlPage.waitForTimeout(400);

  // Pick a value through the facet control, then look at the address bar.
  await urlPage.getByLabel('tags').click();
  await urlPage.waitForTimeout(200);
  await urlPage.getByRole('option', { name: /^auth/ }).click();
  await urlPage.waitForTimeout(250);

  const query = urlPage.url().replace(url, '');
  check(query.includes('f.tags=auth'), `filter: the choice lands in the URL`, query);

  await urlPage.reload({ waitUntil: 'networkidle' });
  await urlPage.waitForTimeout(400);
  check(
    (await urlPage.getByText('tags: auth').count()) >= 1,
    'filter: the choice is re-applied after a reload',
  );
  check(urlErrors.length === 0, 'filter on the dashboard: console is clean', urlErrors.join(' | '));
  await urlPage.close();
} finally {
  await browser.close();
  await app.close();
}

report.checks = results;
await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nscreenshots → ${outDir}`);
console.log(
  `\n${results.filter((r) => r.ok).length}/${results.length} checks passed` +
    (report.failures.length ? `\nfailed: ${report.failures.join(', ')}` : ''),
);
process.exit(report.failures.length ? 1 : 0);
