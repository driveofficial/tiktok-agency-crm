// #3 Precompile JSX -> dist/ ready to copy into Apps Script.
// Same filenames, same include() structure, same deploy-by-copy workflow — the ONLY change is you
// copy from dist/ instead of the repo root, and the served page no longer downloads/runs Babel.
import { mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, INCLUDE_ORDER, compileFileToPlain, buildTailwindCss } from './lib.mjs';

const DIST = join(ROOT, 'dist');

// Files copied verbatim (no JSX): plain scripts / server code / manifest if present.
// css.html is NOT here — it's regenerated below with precompiled Tailwind prepended.
const VERBATIM = ['utils.html', 'code.gs'];

async function buildIndex() {
  let idx = await readFile(join(ROOT, 'index.html'), 'utf8');
  // Drop the in-browser Babel compiler — JSX is precompiled now, so it's dead weight (~3MB, CPU on mobile).
  idx = idx
    .replace(/\s*<!-- 2\. Babel for JSX -->/, '')
    .replace(/\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@babel\/standalone[^>]*><\/script>/, '');
  // Drop the Tailwind Play CDN engine — CSS is precompiled into css.html now (~407KB JS + runtime
  // compile removed). Strip the CDN <script>, its inline tailwind.config, and the CDN preconnect.
  idx = idx
    .replace(/\s*<link rel="preconnect" href="https:\/\/cdn\.tailwindcss\.com"[^>]*>/, '')
    .replace(/\s*<!-- 1\. Tailwind CSS -->/, '')
    .replace(/\s*<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/, '')
    .replace(/\s*<script>\s*tailwind\.config[\s\S]*?<\/script>/, '');
  return idx;
}

async function run() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await writeFile(join(DIST, 'index.html'), await buildIndex());

  // Precompiled component files (JSX -> React.createElement, tag becomes plain <script>).
  for (const name of INCLUDE_ORDER) {
    if (name === 'utils') continue; // verbatim below
    await writeFile(join(DIST, `${name}.html`), await compileFileToPlain(name));
  }

  // css.html = precompiled Tailwind (<style>) + the original hand-written css.html below it.
  const twCss = await buildTailwindCss();
  const customCss = await readFile(join(ROOT, 'css.html'), 'utf8');
  await writeFile(join(DIST, 'css.html'), `<style>\n${twCss}\n</style>\n${customCss}`);

  for (const f of VERBATIM) {
    await copyFile(join(ROOT, f), join(DIST, f));
  }

  console.log('✅ dist/ built. Copy every file in dist/ to the Apps Script editor, then Deploy.');
  console.log('   Files: index.html, ' + [...INCLUDE_ORDER.filter(n => n !== 'utils').map(n => n + '.html'), ...VERBATIM].join(', '));
}

run().catch(e => { console.error('❌ build failed:', e); process.exit(1); });
