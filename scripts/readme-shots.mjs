// modelroom — the pictures the README shows.
//
// The dashboard and the flow only say anything with several rooms in them, and
// this repository ships exactly one example room. So this builds a small
// throwaway project (a shop and its admin console), serves it the way a person
// would, and photographs the surfaces the README names. The images land in
// `docs/images/` and are committed; the project itself lives under
// `.modelroom/` (git-ignored) and is thrown away.
//
// The UI pass (`scripts/verify-ui.mjs`, `npm run verify:ui`) calls
// `captureReadmeShots` with the browser it has already launched, so the pictures
// are produced by the test and follow the tool as it changes. It can also be run
// on its own:
//
//   node scripts/readme-shots.mjs            # write docs/images/
//   node scripts/readme-shots.mjs --headed   # watch it happen
//
// A picture is only as fresh as the last person who committed it, so re-run this
// (or the UI pass) when the tool's UI moves, and commit the new images.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createModelroom } from '../server/http.ts';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(pkgDir, '.modelroom', 'readme-shots');
const defaultOutDir = join(pkgDir, 'docs', 'images');

const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// ── the demo project ────────────────────────────────────────────────────────
//
// One stylesheet at the layer root, linked by relative path, so every artifact
// renders offline — the same shape the convention asks of a real project.

const CSS = `
:root {
  --bg: #f5f5f3; --surface: #fff; --text: #1b1a18; --muted: #74716b;
  --line: #e7e5e1; --primary: #1b1a18; --primary-text: #fafaf9; --accent: #2f6f4f;
  --radius: 12px;
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); line-height: 1.6;
  font-family: ui-sans-serif, system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
}
.topbar {
  display: flex; align-items: center; gap: 20px; padding: 14px 24px;
  background: var(--surface); border-bottom: 1px solid var(--line);
}
.brand { font-weight: 700; letter-spacing: .01em; }
nav { display: flex; gap: 18px; font-size: 14px; color: var(--muted); }
nav .on { color: var(--text); font-weight: 600; }
.topbar .right { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--muted); }
.avatar { width: 28px; height: 28px; border-radius: 999px; background: linear-gradient(135deg, #cbd5c3, #9fb39a); }
.wrap { max-width: 980px; margin: 0 auto; padding: 28px 24px 48px; }
h1 { font-size: 24px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 0 0 12px; }
.lead { color: var(--muted); margin: 0 0 24px; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.tile .shot { aspect-ratio: 4 / 3; background: linear-gradient(135deg, #ecebe7, #f8f8f6); }
.tile .meta { padding: 12px 14px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.pill { display: inline-block; font-size: 12px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
.pill.ok { color: var(--accent); border-color: #cfe0d4; background: #f0f7f2; }
.price { font-variant-numeric: tabular-nums; font-weight: 600; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: 0; }
.stack { display: flex; flex-direction: column; gap: 8px; }
.cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; align-items: start; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
label { font-size: 13px; color: var(--muted); }
input, select {
  font: inherit; padding: 11px 13px; border: 1px solid var(--line); border-radius: 10px;
  background: var(--surface); color: var(--text); width: 100%;
}
button {
  font: inherit; font-weight: 600; padding: 12px 18px; border-radius: 10px; border: 1px solid var(--primary);
  background: var(--primary); color: var(--primary-text); cursor: pointer; min-height: 44px;
}
button.ghost { background: var(--surface); color: var(--text); border-color: var(--line); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 11px 8px; border-bottom: 1px solid var(--line); }
th { color: var(--muted); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.center { max-width: 420px; margin: 8vh auto 0; }
.total { display: flex; justify-content: space-between; font-size: 18px; font-weight: 700; padding-top: 14px; }
.hero { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 28px; margin-bottom: 24px; }
.hero h1 { font-size: 28px; }
`;

const htmlPage = (title, nav, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="../../design.css">
</head>
<body>
<header class="topbar">
  <span class="brand">Northwind</span>
  <nav>${nav}</nav>
  <div class="right"><span>Mia</span><span class="avatar"></span></div>
</header>
${body}
</body>
</html>
`;

const nav = (active) =>
  ['Home', 'Products', 'Cart', 'Orders']
    .map((item) => `<span class="${item === active ? 'on' : ''}">${item}</span>`)
    .join('');

const tile = (name, price, note) => `<div class="tile">
  <div class="shot"></div>
  <div class="meta"><span>${name}</span><span class="price">${price}</span></div>
  <div class="meta muted small" style="padding-top:0">${note}</div>
</div>`;

const ROOMS = [
  {
    name: 'sign-in',
    fields: {
      title: 'Sign in',
      status: 'adopted',
      version: 2,
      app: 'shop',
      next: 'home',
      platform: 'web',
      tags: ['auth', 'form'],
      summary: 'A boring front door — signed in, or told plainly why not.',
    },
    body: `<main class="center card">
  <h1>Sign in</h1>
  <p class="lead">Welcome back to Northwind.</p>
  <div class="field"><label>Email</label><input value="mia@northwind.test"></div>
  <div class="field"><label>Password</label><input type="password" value="hunter2hunter2"></div>
  <button style="width:100%">Sign in</button>
  <p class="small muted" style="margin:14px 0 0">This is a model room — nothing here is connected to anything.</p>
</main>`,
  },
  {
    name: 'home',
    fields: {
      title: 'Home',
      status: 'review',
      version: 3,
      app: 'shop',
      next: 'product',
      platform: 'web',
      tags: ['browse'],
      summary: 'The shelf: a few products worth clicking, and a way into the catalog.',
    },
    body: `<div class="wrap">
  <div class="hero"><h1>Coffee, shipped fresh</h1><p class="lead" style="margin:6px 0 16px">Roasted this week. Ground or whole bean.</p><button>Shop the roasts</button></div>
  <div class="grid">${tile('Morning Blend', '$18', 'Nutty · medium')}${tile('Dark Roast', '$19', 'Bold · dark')}${tile('Single Origin', '$24', 'Ethiopia · light')}</div>
</div>`,
  },
  {
    name: 'product',
    fields: {
      title: 'Product',
      status: 'draft',
      version: 1,
      app: 'shop',
      next: 'cart',
      platform: 'web',
      tags: ['browse', 'detail'],
      summary: 'One product, in full: what it is, what it costs, and how to buy it.',
    },
    body: `<div class="wrap"><div class="cols">
  <div class="tile"><div class="shot" style="aspect-ratio:1/1"></div></div>
  <div class="card stack">
    <span class="pill ok">In stock</span>
    <h1>Morning Blend</h1>
    <p class="lead" style="margin:0">A nutty, medium roast for the everyday pot. 340g, whole bean.</p>
    <div class="price" style="font-size:22px">$18.00</div>
    <button>Add to cart</button>
    <button class="ghost">Save for later</button>
  </div>
</div></div>`,
  },
  {
    name: 'cart',
    fields: {
      title: 'Cart',
      status: 'draft',
      version: 1,
      app: 'shop',
      next: 'checkout',
      platform: 'web',
      tags: ['checkout'],
      summary: 'What is in the bag, what it costs, and one way forward.',
    },
    body: `<div class="wrap"><h1>Your cart</h1><p class="lead">2 items</p>
  <div class="cols">
    <div class="card">
      <div class="row"><span>Morning Blend · 340g</span><span class="price">$18.00</span></div>
      <div class="row"><span>Dark Roast · 340g</span><span class="price">$19.00</span></div>
      <div class="row"><span>Shipping</span><span class="price">$5.00</span></div>
      <div class="total"><span>Total</span><span>$42.00</span></div>
    </div>
    <div class="card stack"><h2>Ready?</h2><p class="small muted" style="margin:0">You can still change the bag until you pay.</p><button>Checkout</button></div>
  </div>
</div>`,
  },
  {
    name: 'checkout',
    fields: {
      title: 'Checkout',
      status: 'draft',
      version: 4,
      app: 'shop',
      next: 'order-placed',
      platform: 'web',
      tags: ['checkout', 'form'],
      summary: 'Address, payment, one button — and nothing else to decide.',
    },
    body: `<div class="wrap"><h1>Checkout</h1><p class="lead">One page, one decision.</p>
  <div class="cols">
    <div class="card">
      <h2>Delivery</h2>
      <div class="field"><label>Name</label><input value="Mia Novak"></div>
      <div class="field"><label>Address</label><input value="12 Mill Lane"></div>
      <div class="cols" style="gap:14px; grid-template-columns:1fr 1fr">
        <div class="field"><label>City</label><input value="Bristol"></div>
        <div class="field"><label>Postcode</label><input value="BS1 4ST"></div>
      </div>
      <h2 style="margin-top:20px">Payment</h2>
      <div class="field"><label>Card</label><input value="•••• •••• •••• 4242"></div>
    </div>
    <div class="card stack">
      <h2>Order</h2>
      <div class="row"><span>2 items</span><span class="price">$37.00</span></div>
      <div class="row"><span>Shipping</span><span class="price">$5.00</span></div>
      <div class="total"><span>Total</span><span>$42.00</span></div>
      <button>Pay $42.00</button>
      <p class="small muted" style="margin:0">You will get a receipt by email.</p>
    </div>
  </div>
</div>`,
  },
  {
    name: 'order-placed',
    fields: {
      title: 'Order placed',
      status: 'draft',
      version: 1,
      app: 'shop',
      platform: 'web',
      tags: ['checkout'],
      summary: 'Done, and what happens next.',
    },
    body: `<main class="center card">
  <span class="pill ok">Order #1042</span>
  <h1 style="margin-top:12px">Thank you, Mia</h1>
  <p class="lead">Your coffee ships tomorrow. We will email a tracking link.</p>
  <div class="row"><span>Morning Blend · 340g</span><span class="price">$18.00</span></div>
  <div class="row"><span>Dark Roast · 340g</span><span class="price">$19.00</span></div>
  <button class="ghost" style="width:100%">Back to the shop</button>
</main>`,
  },
  {
    name: 'orders',
    fields: {
      title: 'Orders',
      status: 'review',
      version: 2,
      app: 'admin',
      next: 'order-detail',
      platform: 'web',
      tags: ['list'],
      summary: 'Every order, newest first, with the one number that matters.',
    },
    body: `<div class="wrap"><h1>Orders</h1><p class="lead">Today</p>
  <div class="card"><table>
    <tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr>
    <tr><td>#1042</td><td>Mia Novak</td><td><span class="pill ok">Paid</span></td><td class="price">$42.00</td></tr>
    <tr><td>#1041</td><td>Sam Okafor</td><td><span class="pill ok">Shipped</span></td><td class="price">$24.00</td></tr>
    <tr><td>#1040</td><td>Lena Fischer</td><td><span class="pill">Refunded</span></td><td class="price">$18.00</td></tr>
  </table></div>
</div>`,
  },
  {
    name: 'order-detail',
    fields: {
      title: 'Order detail',
      status: 'draft',
      version: 1,
      app: 'admin',
      platform: 'web',
      tags: ['detail'],
      summary: 'One order: what was bought, where it went, and what happened to it.',
    },
    body: `<div class="wrap"><h1>Order #1042</h1><p class="lead">Placed today, 09:14</p>
  <div class="cols">
    <div class="card">
      <h2>Items</h2>
      <div class="row"><span>Morning Blend · 340g</span><span class="price">$18.00</span></div>
      <div class="row"><span>Dark Roast · 340g</span><span class="price">$19.00</span></div>
      <div class="total"><span>Total</span><span>$42.00</span></div>
    </div>
    <div class="card stack">
      <h2>Timeline</h2>
      <p class="small"><span class="pill ok">Paid</span> 09:14</p>
      <p class="small"><span class="pill">Packed</span> 11:02</p>
      <p class="small muted">Ships tomorrow</p>
    </div>
  </div>
</div>`,
  },
  {
    name: 'legacy-cart',
    fields: {
      title: 'Cart (old)',
      status: 'deprecated',
      version: 1,
      app: 'shop',
      platform: 'mobile',
      tags: ['checkout'],
      deprecated: true,
      superseded_by: 'cart',
      summary: 'The single-column cart the mobile app shipped with.',
    },
    body: `<div class="wrap"><h1>Cart</h1><p class="lead">The old mobile cart.</p>
  <div class="card stack">
    <div class="row"><span>Morning Blend</span><span class="price">$18.00</span></div>
    <div class="total"><span>Total</span><span>$18.00</span></div>
  </div>
</div>`,
  },
];

const brief = (room) => {
  const { fields } = room;
  const fm = Object.entries(fields)
    .filter(([key]) => !['summary', 'tags', 'app', 'next', 'platform'].includes(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const extra = [
    `app: ${fields.app}`,
    fields.next ? `next: ${fields.next}` : null,
    `platform: ${fields.platform}`,
    `tags: [${fields.tags.join(', ')}]`,
  ]
    .filter(Boolean)
    .join('\n');
  return `---
${fm}
${extra}
---
# ${fields.title}

${fields.summary}

- **For:** someone using the ${fields.app} screens
- **Because:** it is the next thing they need, and nothing more
- **Matters most:** they can finish, or are told plainly why not
- **Not doing:** what the rooms around it already do
`;
};

const spec = (room) => `# ${room.name} — spec

Only what the artifact cannot show.

- **Where it is used:** ${room.fields.platform === 'mobile' ? 'the mobile app' : 'desktop and tablet browsers'}; keyboard and touch
- **States:** default — \`index.html\`
- **Constraints:** one purpose per screen; the primary action is reachable without scrolling
- **Uses:** tokens \`--surface\`, \`--primary\`, \`--radius\`
`;

const behaviour = (room) => `# ${room.name} — behaviour

What this room promises.

\`\`\`gherkin
Feature: ${room.name}

  @${room.name}-1
  Scenario: the happy path
    Given the ${room.name} screen is open
    When the person does the one thing it is for
    Then the screen reports what happened, in one sentence

  @${room.name}-2
  Scenario: it cannot be done
    Given the ${room.name} screen is open
    When the person cannot finish
    Then the screen stays, and says why without blame
\`\`\`
`;

async function buildFixture() {
  await rm(fixture, { recursive: true, force: true });
  await mkdir(fixture, { recursive: true });
  await writeFile(
    join(fixture, 'modelroom.json'),
    JSON.stringify(
      {
        root: '.',
        rooms: 'rooms',
        artifact: 'index.html',
        docs: ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md'],
        lang: 'en',
        // 16:10, the shape a dashboard card is: the whole screen, uncropped.
        thumbnail: { device: 'pc' },
        agent: {
          adapter: 'opencode',
          command: 'opencode',
          agent: 'build',
          model: 'openrouter/anthropic/claude-sonnet-4',
          standalone: true,
        },
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(join(fixture, 'design.css'), CSS);
  for (const room of ROOMS) {
    const dir = join(fixture, 'rooms', room.name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'BRIEF.md'), brief(room));
    await writeFile(join(dir, 'SPEC.md'), spec(room));
    await writeFile(join(dir, 'BEHAVIOUR.md'), behaviour(room));
    await writeFile(
      join(dir, 'index.html'),
      htmlPage(room.fields.title, nav(room.fields.title), room.body),
    );
  }
}

/** Every room's snapshot is drawn; the cards are empty until they land. */
async function snapshotsReady(url) {
  const rooms = await fetch(`${url}/api/rooms`).then((r) => r.json());
  return (
    Array.isArray(rooms.rooms) && rooms.rooms.length > 0 && rooms.rooms.every((r) => r.hasThumb)
  );
}

async function serve() {
  const app = await createModelroom({
    cwd: fixture,
    port: await freePort(),
    host: '127.0.0.1',
    checkForUpdates: false,
  });
  app.startWatching();
  return { app, url: (await app.listen()).url };
}

/**
 * Build the demo project, photograph the README's surfaces into `outDir`, and
 * throw the project away. `browser` is a Playwright browser the caller already
 * has — the UI pass passes its own, so the pictures cost one context, not one
 * browser.
 */
export async function captureReadmeShots(browser, { outDir = defaultOutDir } = {}) {
  await buildFixture();

  // Two runs of the same project. The first draws every snapshot, which the
  // server reports in its status line ("sign-in: index.png updated…"); the
  // record it leaves in local state means the second run has nothing to draw and
  // sits at "Ready", which is what a picture of the tool should say.
  const first = await serve();
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await snapshotsReady(first.url)) break;
    await wait(500);
  }
  await wait(500);
  await first.app.close();

  const second = await serve();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });
  await mkdir(outDir, { recursive: true });

  const shot = async (name, path, prepare) => {
    const page = await context.newPage();
    await page.goto(`${second.url}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    if (prepare) await prepare(page);
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    await page.close();
    console.log(`  README  docs/images/${name}.png`);
  };

  try {
    // The dashboard: every room, with its snapshot, and the facets built from the records.
    await shot('dashboard', '/');
    // The flow: the apps' screens, wired by `next`.
    await shot('flow', '/', async (page) => {
      await page.getByText('Flow', { exact: true }).click();
      await page.waitForTimeout(700);
    });
    // The dashboard's preview: a room from the right, without leaving the list.
    await shot('preview', '/', async (page) => {
      await page.locator('main a[href="/rooms/checkout"]').first().click();
      await page.waitForTimeout(800);
    });
    // A room: chat beside the artifact.
    await shot('room', '/rooms/checkout');
    // The docs tab: the rendered brief, beside the chat.
    await shot('room-docs', '/rooms/checkout', async (page) => {
      await page.getByRole('tab', { name: 'BRIEF' }).click();
      await page.waitForTimeout(500);
    });
    // Settings: which agent to run, and with which model.
    await shot('settings', '/settings');
    // The same dashboard, the other scheme.
    await shot('dashboard-dark', '/', async (page) => {
      await page.getByRole('button', { name: 'Dark theme' }).click();
      // Park the pointer: a tooltip left hanging over the toggle is not a feature.
      await page.mouse.move(8, 400);
      await page.waitForTimeout(500);
    });
  } finally {
    await context.close();
    await second.app.close();
    await rm(fixture, { recursive: true, force: true });
  }
}

// Run on its own when invoked directly; the UI pass imports the function instead.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  try {
    await captureReadmeShots(browser);
    console.log(`\nREADME screenshots written to ${defaultOutDir}`);
  } finally {
    await browser.close();
  }
}
