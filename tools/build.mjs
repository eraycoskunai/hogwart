/**
 * @file Production bundle: `npm run build` (needs `npm i -D esbuild` once).
 *
 * The game runs straight from `src/` without any build during development.
 * For hosting, loading ~200 separate ES modules is slow (each import level
 * waits for the previous one), so this packs the game into dist/:
 *   dist/main.js            the whole game, minified (three / cannon-es stay on the CDN via the import map)
 *   dist/texture.worker.js  the texture generator worker (same relative path as in src/)
 *   dist/styles.css         the UI styles
 *   dist/index.html         index.html pointing at the files above
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  external: ['three', 'three/addons/*', 'cannon-es'],
  legalComments: 'none',
  logLevel: 'warning',
};
await build({ ...common, entryPoints: [new URL('src/main.js', root).pathname], outfile: new URL('main.js', out).pathname });
await build({ ...common, entryPoints: [new URL('src/procgen/textures/texture.worker.js', root).pathname], outfile: new URL('texture.worker.js', out).pathname });
copyFileSync(new URL('src/ui/styles.css', root), new URL('styles.css', out));

const html = readFileSync(new URL('index.html', root), 'utf8')
  .replace('href="src/ui/styles.css"', 'href="styles.css"')
  .replace('src="src/main.js"', 'src="main.js"');
if (!html.includes('src="main.js"') || !html.includes('href="styles.css"')) throw new Error('index.html paths not found');
writeFileSync(new URL('index.html', out), html);
console.log('dist/ hazır');
