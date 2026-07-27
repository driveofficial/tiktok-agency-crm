// Loads the REAL source (code.gs + utils.html) into a sandbox and hands back its pure functions.
// No copies of the logic live here — tests run against the exact code that ships, so they can't drift.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT, extractScript } from '../lib.mjs';

// --- code.gs (server) : parseDate / normYear / formatDateISO / getStartOfWeek ---
export async function loadServer() {
  const code = await readFile(join(ROOT, 'code.gs'), 'utf8');
  // code.gs calls CacheService.getScriptCache() at top level — stub the Apps Script globals it
  // touches on load so the file evaluates. The pure date fns below don't use any of them.
  const noop = () => {};
  const ctx = {
    CacheService: { getScriptCache: () => ({ get: noop, put: noop, remove: noop }) },
    LockService: { getScriptLock: () => ({}), getUserLock: () => ({}) },
    SpreadsheetApp: {}, HtmlService: {}, Logger: { log: noop }, console,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'code.gs' });
  return ctx; // parseDate, normYear, formatDateISO, getStartOfWeek are now context globals
}

// --- utils.html (client window.* helpers) ---
export async function loadClient() {
  const html = await readFile(join(ROOT, 'utils.html'), 'utf8');
  const src = extractScript(html);
  const ctx = { window: {}, google: undefined, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'utils.html' });
  return ctx.window; // getColumnConfig, extractTiktokUsername, getPipelineStage, ...
}
