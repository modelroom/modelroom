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

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { createModelroom } from '../server/http.ts';

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
// The update check is off: this pass is about the pixels and the console, and it
// must not depend on the registry being reachable.
const app = await createModelroom({
  cwd: pkgDir,
  port,
  host: '127.0.0.1',
  checkForUpdates: false,
});
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
  { name: 'room', path: '/rooms/sign-in' },
  { name: 'settings', path: '/settings' },
  { name: 'kit', path: '/web/kit.html' },
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

  // ── the artifact panel: maximise, and Escape to leave ─────────────────────
  const artifactPage = await context.newPage();
  const artifactErrors = [];
  artifactPage.on('console', (message) => {
    if (message.type() === 'error') artifactErrors.push(message.text());
  });
  artifactPage.on('pageerror', (error) => artifactErrors.push(String(error)));
  await artifactPage.goto(`${url}/rooms/sign-in`, { waitUntil: 'networkidle' });
  await artifactPage.waitForTimeout(600);

  const stagePosition = () =>
    artifactPage.evaluate(() =>
      [...document.querySelectorAll('.mr-scroll')].some(
        (el) => getComputedStyle(el).position === 'fixed',
      ),
    );

  check(!(await stagePosition()), 'artifact: the stage starts in the layout');
  await artifactPage.getByRole('button', { name: 'Maximize' }).click();
  await artifactPage.waitForTimeout(300);
  check(await stagePosition(), 'artifact: maximise fills the view');
  await artifactPage.screenshot({ path: join(outDir, 'artifact-maximized.png') });

  await artifactPage.keyboard.press('Escape');
  await artifactPage.waitForTimeout(300);
  check(!(await stagePosition()), 'artifact: Escape leaves the maximised view');
  check(
    artifactErrors.length === 0,
    'artifact panel: console is clean',
    artifactErrors.join(' | '),
  );
  await artifactPage.close();

  // ── the filter, on the workshop's 1000 candidates ─────────────────────────
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  await page.goto(`${url}/web/kit.html`, { waitUntil: 'networkidle' });
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

  // ── the app tabs, the flow view, sort, and a filter that survives a trip ───
  // A throwaway project with several apps and a `next` chain: the repo's own
  // example is a single room, so this is where the derived views get exercised.
  const fixture = await mkdtemp(join(tmpdir(), 'mr-verify-'));
  let flowApp = null;
  try {
    await writeFile(
      join(fixture, 'modelroom.json'),
      JSON.stringify(
        {
          root: '.',
          rooms: 'rooms',
          artifact: 'index.html',
          docs: ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md'],
        },
        null,
        2,
      ) + '\n',
    );
    const writeRoom = async (name, fields) => {
      const dir = join(fixture, 'rooms', name);
      await mkdir(dir, { recursive: true });
      const fm = Object.entries(fields)
        .map(([key, value]) =>
          Array.isArray(value) ? `${key}: [${value.join(', ')}]` : `${key}: ${value}`,
        )
        .join('\n');
      await writeFile(join(dir, 'BRIEF.md'), `---\n${fm}\n---\n# ${name}\n`);
    };
    await writeRoom('login', { title: 'Login', app: 'user', next: 'top', tags: ['auth'] });
    await writeRoom('top', { title: 'Top', app: 'user', next: 'detail', tags: ['auth', 'form'] });
    await writeRoom('detail', { title: 'Detail', app: 'user' });
    await writeRoom('admin-home', { title: 'Admin home', app: 'admin', next: 'reports' });
    await writeRoom('reports', { title: 'Reports', app: 'admin' });
    await writeRoom('legacy', { title: 'Legacy', app: 'user-legacy', updated_at: '2030-01-01' });
    await writeRoom('orphan', { title: 'Orphan' });

    flowApp = await createModelroom({
      cwd: fixture,
      port: await freePort(),
      host: '127.0.0.1',
      checkForUpdates: false,
    });
    const flowUrl = (await flowApp.listen()).url;

    const flowPage = await context.newPage();
    const flowErrors = [];
    flowPage.on('console', (message) => {
      if (message.type() === 'error') flowErrors.push(message.text());
    });
    flowPage.on('pageerror', (error) => flowErrors.push(String(error)));
    await flowPage.goto(`${flowUrl}/`, { waitUntil: 'networkidle' });
    await flowPage.waitForTimeout(500);
    await flowPage.screenshot({ path: join(outDir, 'flow-dashboard.png') });

    // The app tabs: name order, with All first.
    check(
      (await flowPage.getByRole('tab', { name: 'user', exact: true }).count()) === 1,
      'app tabs: the user tab is present',
    );
    check(
      (await flowPage.getByRole('tab', { name: 'admin', exact: true }).count()) === 1,
      'app tabs: the admin tab is present',
    );
    check(
      (await flowPage.getByRole('tab', { name: 'user-legacy', exact: true }).count()) === 1,
      'app tabs: the user-legacy tab is present',
    );

    await flowPage.getByRole('tab', { name: 'user', exact: true }).click();
    await flowPage.waitForTimeout(300);
    check(
      (await flowPage.getByText('rooms/login', { exact: true }).count()) >= 1,
      'app tabs: the user tab shows its rooms',
    );
    check(
      (await flowPage.getByText('rooms/reports', { exact: true }).count()) === 0,
      'app tabs: another app’s room is hidden',
    );
    check(
      flowPage.url().includes('app=user'),
      'app tabs: the choice lands in the URL',
      flowPage.url(),
    );

    // The flow view: React Flow draws the user app's three screens and two edges.
    await flowPage.getByText('Flow', { exact: true }).click();
    await flowPage.waitForTimeout(500);
    check((await flowPage.locator('.react-flow').count()) >= 1, 'flow: the canvas is rendered');
    const userNodes = await flowPage.locator('.react-flow__node').count();
    const userEdges = await flowPage.locator('.react-flow__edge').count();
    check(userNodes === 3, `flow: the user app draws its 3 screens (${userNodes})`);
    check(userEdges === 2, `flow: the user app draws its 2 transitions (${userEdges})`);
    await flowPage.screenshot({ path: join(outDir, 'flow-user.png') });

    // A flow node is a way in: clicking it opens the room.
    await flowPage.locator('.react-flow__node', { hasText: 'Login' }).first().click();
    await flowPage.waitForURL(/\/rooms\/login$/, { timeout: 5000 }).catch(() => undefined);
    check(
      new URL(flowPage.url()).pathname === '/rooms/login',
      'flow: clicking a node opens the room',
      flowPage.url(),
    );
    await flowPage.goBack({ waitUntil: 'networkidle' });
    await flowPage.waitForTimeout(600);

    // "All" stacks every app: 7 screens, 3 transitions.
    await flowPage.getByRole('tab', { name: 'All' }).click();
    await flowPage.waitForTimeout(500);
    const allNodes = await flowPage.locator('.react-flow__node').count();
    const allEdges = await flowPage.locator('.react-flow__edge').count();
    check(allNodes === 7, `flow: "all" draws every app’s screens (${allNodes})`);
    check(allEdges === 3, `flow: "all" draws every transition (${allEdges})`);

    // Back to the grid; the sort choice lands in the URL and orders the cards.
    await flowPage.getByText('Grid', { exact: true }).click();
    await flowPage.waitForTimeout(300);
    const firstCard = () =>
      flowPage.locator('main a[href^="/rooms/"]').first().getAttribute('href');

    await flowPage.getByText('Name', { exact: true }).click();
    await flowPage.waitForTimeout(300);
    check(
      flowPage.url().includes('sort=name'),
      'sort: the choice lands in the URL',
      flowPage.url(),
    );
    const nameFirst = await firstCard();
    check(nameFirst === '/rooms/admin-home', 'sort: name orders the cards', String(nameFirst));

    await flowPage.getByText('Updated', { exact: true }).click();
    await flowPage.waitForTimeout(300);
    const updatedFirst = await firstCard();
    check(
      updatedFirst === '/rooms/legacy',
      'sort: updated puts the newest first (updated_at)',
      String(updatedFirst),
    );

    // The app tab and a tag filter both survive a room → back trip.
    await flowPage.getByRole('tab', { name: 'user', exact: true }).click();
    await flowPage.waitForTimeout(300);
    check(
      flowPage.url().includes('app=user'),
      'persist: the app tab is in the URL',
      flowPage.url(),
    );

    await flowPage.getByLabel('tags').click();
    await flowPage.waitForTimeout(200);
    await flowPage.getByRole('option', { name: /^auth/ }).click();
    await flowPage.waitForTimeout(250);
    check(
      flowPage.url().includes('f.tags=auth'),
      'persist: the tag filter is in the URL',
      flowPage.url(),
    );

    await flowPage.getByText('rooms/login', { exact: true }).click();
    await flowPage.waitForURL(/\/rooms\/login/);
    await flowPage.waitForTimeout(400);
    await flowPage.getByRole('link', { name: 'Rooms' }).click();
    await flowPage.waitForURL((u) => new URL(u).pathname === '/');
    await flowPage.waitForTimeout(500);
    check(
      (await flowPage.getByText('tags: auth').count()) >= 1,
      'persist: the tag filter survives room → back',
    );
    check(
      flowPage.url().includes('app=user'),
      'persist: the app tab survives room → back',
      flowPage.url(),
    );
    check(
      (await flowPage
        .getByRole('tab', { name: 'user', exact: true })
        .getAttribute('aria-selected')) === 'true',
      'persist: the user tab is still selected',
    );

    // The artifact's own link walks to the next room's screen, in the preview.
    // Written after the dashboard checks so no thumbnail render disturbs them.
    await writeFile(
      join(fixture, 'rooms', 'login', 'index.html'),
      '<a href="../top/index.html">Go to top</a>\n',
    );
    await writeFile(join(fixture, 'rooms', 'top', 'index.html'), '<h1>Top</h1>\n');
    await flowPage.goto(`${flowUrl}/rooms/login`, { waitUntil: 'networkidle' });
    await flowPage.waitForTimeout(700);
    await flowPage.frameLocator('iframe').getByText('Go to top').click();
    await flowPage.waitForTimeout(700);
    check(
      (await flowPage.getByRole('button', { name: 'Back to this room' }).count()) >= 1,
      'artifact: a link inside the preview walks to the next room',
    );
    const frame = flowPage.frames().find((f) => f !== flowPage.mainFrame());
    check(
      String(frame?.url()).includes('/files/rooms/top/index.html'),
      'artifact: the frame moved to the next room’s screen',
      String(frame?.url()),
    );
    await flowPage.getByRole('button', { name: 'Back to this room' }).click();
    await flowPage.waitForTimeout(700);
    check(
      (await flowPage.getByRole('button', { name: 'Back to this room' }).count()) === 0,
      'artifact: back returns to this room’s own screen',
    );

    check(flowErrors.length === 0, 'flow dashboard: console is clean', flowErrors.join(' | '));
    await flowPage.close();
  } finally {
    if (flowApp) await flowApp.close();
    await rm(fixture, { recursive: true, force: true });
  }
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
