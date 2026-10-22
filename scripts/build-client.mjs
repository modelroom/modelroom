// modelroom — build the tool's UI bundle.
//
// The UI is React + markdown-it, but the *published package* has no build step
// and no runtime dependencies: this script bundles everything into one file,
// `web/assets/app.js`. That is the same deal as `web/modelroom.css` — source
// in `client/`, the built asset next to the shells. Neither is committed: `prepare`
// builds both on `npm install`, and the published tarball ships them prebuilt.
//
//   node scripts/build-client.mjs            one production bundle (minified)
//   node scripts/build-client.mjs --dev      readable, inline sourcemaps
//   node scripts/build-client.mjs --watch    rebuild on change (dev)
//
// One entry, one bundle: `client/main.tsx` picks the room app or the component
// workshop from the shell's `data-app`, so nothing is shipped twice.

import { build, context } from 'esbuild';

const dev = process.argv.includes('--dev');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: { app: 'client/main.tsx' },
  outdir: 'web/assets',
  entryNames: '[name]',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  // React reads NODE_ENV at build time; leaving it undefined in the browser throws.
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  banner: {
    js: '/* modelroom UI — built from client/ by scripts/build-client.mjs. Do not edit by hand; run `npm run build:client`. */',
  },
};

if (watch) {
  const ctx = await context({ ...options, minify: false, sourcemap: 'inline' });
  await ctx.watch();
  console.log('modelroom: watching client/ (bundle → web/assets/app.js)');
} else {
  await build(options);
  console.log(`modelroom: built web/assets/app.js (${dev ? 'dev' : 'production'})`);
}
