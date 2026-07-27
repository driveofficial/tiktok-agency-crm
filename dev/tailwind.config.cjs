// Precompile config — scans the ORIGINAL source HTML at repo root for class names,
// then emits a static stylesheet so the deployed app no longer downloads/runs the
// Tailwind Play CDN engine (~407KB JS, compiles CSS in the browser on every load).
// Mirrors the in-page `tailwind.config` in index.html (preflight on, empty extend).
const { join } = require('node:path');
const ROOT = join(__dirname, '..');

module.exports = {
  content: [
    join(ROOT, '*.html'), // App, Views, Dashboard, Modals, UI_Lib, Icons, utils, css, index
  ],
  theme: { extend: {} },
  corePlugins: { preflight: true },
};
