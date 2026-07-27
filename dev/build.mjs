// #3 Precompile JSX -> dist/ ready to copy into Apps Script.
// Same filenames, same include() structure, same deploy-by-copy workflow — the ONLY change is you
// copy from dist/ instead of the repo root, and the served page no longer downloads/runs Babel.
import { mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, INCLUDE_ORDER, compileFileToPlain } from './lib.mjs';

const DIST = join(ROOT, 'dist');

// Files copied verbatim (no JSX): plain scripts / styles / server code / manifest if present.
const VERBATIM = ['utils.html', 'css.html', 'code.gs'];

async function buildIndex() {
  let idx = await readFile(join(ROOT, 'index.html'), 'utf8');
  // Drop the in-browser Babel compiler — JSX is precompiled now, so it's dead weight (~3MB, CPU on mobile).
  idx = idx
    .replace(/\s*<!-- 2\. Babel for JSX -->/, '')
    .replace(/\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@babel\/standalone[^>]*><\/script>/, '');
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

  for (const f of VERBATIM) {
    await copyFile(join(ROOT, f), join(DIST, f));
  }

  console.log('✅ dist/ built. Copy every file in dist/ to the Apps Script editor, then Deploy.');
  console.log('   Files: index.html, ' + [...INCLUDE_ORDER.filter(n => n !== 'utils').map(n => n + '.html'), ...VERBATIM].join(', '));
}

run().catch(e => { console.error('❌ build failed:', e); process.exit(1); });
