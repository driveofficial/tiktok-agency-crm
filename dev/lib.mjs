// Shared helpers for build.mjs (dist for Apps Script) and preview.mjs (local browser).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transform } from 'esbuild';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Files that contain a single <script type="text/babel"> block with JSX.
export const JSX_FILES = ['Icons', 'UI_Lib', 'Modals', 'Views', 'Dashboard', 'App'];
// Load order = same order index.html includes them. utils first (defines window.* helpers).
export const INCLUDE_ORDER = ['utils', 'Icons', 'UI_Lib', 'Modals', 'Views', 'Dashboard', 'App'];

const BABEL_BLOCK = /<script\s+type="text\/babel">([\s\S]*?)<\/script>/;

export async function read(name, ext = 'html') {
  return readFile(join(ROOT, `${name}.${ext}`), 'utf8');
}

// Pull the JS source out of a file's script block. Plain <script> or babel block both work.
export function extractScript(html) {
  const m = html.match(BABEL_BLOCK) || html.match(/<script>([\s\S]*?)<\/script>/);
  return m ? m[1] : '';
}

// JSX -> React.createElement, matching the React 18 UMD global already on the page.
export async function compileJSX(code, sourcefile) {
  const out = await transform(code, {
    loader: 'jsx',
    jsx: 'transform',        // classic runtime: React.createElement (React is a global)
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    // No `format` on purpose: transform statements in place so the output is the ORIGINAL script
    // minus JSX. Files keep their own top-level scope / IIFE and their window.* global assignments.
    sourcefile,
  });
  return out.code;
}

// Turn a babel component file into a plain-<script> file (JSX precompiled). Non-JSX files unchanged.
export async function compileFileToPlain(name) {
  const html = await read(name);
  if (!JSX_FILES.includes(name)) return html; // utils/css: copy verbatim
  const inner = extractScript(html);
  const js = await compileJSX(inner, `${name}.html`);
  return html.replace(BABEL_BLOCK, `<script>\n${js}\n</script>`);
}
