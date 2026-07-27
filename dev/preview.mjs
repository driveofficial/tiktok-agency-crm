// #1 Local preview — one self-contained preview.html you open in a browser, no deploy needed.
// google.script.run is never defined, so utils.html's window.isGAS is false and every fetch*/write*
// falls through to the mock branch already baked into utils.html (generateMockRow, mock dashboard...).
// JSX is precompiled the same way build.mjs does it, so the preview also smoke-tests the transform.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, INCLUDE_ORDER, read, extractScript, compileJSX, JSX_FILES } from './lib.mjs';

async function scriptFor(name) {
  const html = await read(name);
  const src = extractScript(html);
  const js = JSX_FILES.includes(name) ? await compileJSX(src, `${name}.html`) : src;
  return `<!-- ${name}.html -->\n<script>\n${js}\n</script>`;
}

async function run() {
  const css = await read('css'); // already a <style>…</style> block
  const scripts = [];
  for (const name of INCLUDE_ORDER) scripts.push(await scriptFor(name));

  const page = `<!DOCTYPE html>
<html lang="th" class="h-full w-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>TikTok Agency CRM — LOCAL PREVIEW (mock data)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwind.config = { theme: { extend: {} }, corePlugins: { preflight: true } }</script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Sarabun:wght@300;400;500;600&display=swap" rel="stylesheet">
  <script crossorigin src="https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js"></script>
  <script crossorigin src="https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.production.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prop-types@15.8.1/prop-types.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/recharts@2.12.0/umd/Recharts.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  ${css}
</head>
<body class="bg-[#FDF4F0] text-slate-800 overflow-hidden h-full w-full">
  <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#f59e0b;color:#000;font:600 12px/1.6 sans-serif;text-align:center;padding:2px">LOCAL PREVIEW · mock data · not connected to Google Sheets</div>
  <div id="root" class="h-full w-full"></div>
  ${scripts.join('\n')}
</body>
</html>`;

  const out = join(ROOT, 'dev', 'preview.html');
  await writeFile(out, page);
  console.log('✅ preview built:', out);
  console.log('   Open it in a browser (double-click) — hot data is mocked, no Apps Script needed.');
}

run().catch(e => { console.error('❌ preview failed:', e); process.exit(1); });
