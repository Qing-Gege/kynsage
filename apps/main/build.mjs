import * as esbuild from 'esbuild';

// Bundle the Electron main process into a single self-contained file.
//
// Why bundle: the main process is ESM and imports workspace packages by bare
// specifier (`@marshal/ipc-contract`). Inside a packaged app.asar there is no
// `node_modules/@marshal/*` for Node's ESM resolver to find, so the unbundled
// build crashes with ERR_MODULE_NOT_FOUND at startup. Inlining every pure-JS
// dependency removes the resolution problem entirely.
//
// Externals: only things that genuinely cannot be bundled.
//   - electron     : provided by the runtime, never bundled.
//   - node-pty     : native addon (.node); shipped as a real unpacked module.
const external = ['electron', 'node-pty'];

const dev = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  external,
  logLevel: 'info',
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
};

const builds = [
  // Main entry — ESM (apps/main/package.json has "type": "module").
  esbuild.context({
    ...shared,
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
    format: 'esm',
  }),
  // Preload — CommonJS, loaded by Electron as preload.cjs in dev and prod.
  esbuild.context({
    ...shared,
    entryPoints: ['src/preload.ts'],
    outfile: 'dist/preload.cjs',
    format: 'cjs',
  }),
];

const contexts = await Promise.all(builds);

if (dev) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('[build] watching main + preload…');
} else {
  await Promise.all(
    contexts.map(async (c) => {
      await c.rebuild();
      await c.dispose();
    }),
  );
}
