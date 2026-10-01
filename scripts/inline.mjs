/* Produces a single self-contained HTML file from the production build, so the
   app can be opened from disk or served as one static document.
   Usage: node scripts/inline.mjs                                   */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assetsDir = join(dist, 'assets');
const assets = readdirSync(assetsDir);

// Take the entry script straight from index.html — the build may also emit
// other chunks (e.g. the dynamic WebLLM bundle) that must NOT be inlined.
const entryMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!entryMatch) throw new Error('no module entry script found in dist/index.html');
const jsFile = entryMatch[1].split('/').pop();
if (!jsFile || !assets.includes(jsFile)) throw new Error(`entry asset ${jsFile} missing from dist/assets`);
const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
const cssFile = cssMatch ? cssMatch[1].split('/').pop() : undefined;

const js = readFileSync(join(assetsDir, jsFile), 'utf8');
const css = cssFile ? readFileSync(join(assetsDir, cssFile), 'utf8') : '';

// Base64 keeps every markup character out of the document, so the HTML parser
// cannot truncate the payload on a stray "<" or "</script".
const jsB64 = Buffer.from(js, 'utf8').toString('base64');

const loader = `
(function () {
  function boot() {
    try {
      var bin = atob(document.getElementById('reach-bundle').textContent.trim());
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var code = new TextDecoder('utf-8').decode(bytes);
      var url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      import(url).catch(show);
    } catch (err) { show(err); }
  }
  function show(err) {
    document.body.innerHTML =
      '<pre style="color:#ff3b47;font:12px ui-monospace,monospace;padding:24px;white-space:pre-wrap">' +
      'REACH could not start in this preview shell.\\n\\n' + err + '</pre>';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
`;

let out = html
  .replace(/<script type="module"[^>]*><\/script>/g, '')
  .replace(/<link rel="stylesheet"[^>]*>/g, '');

out = out.replace('</head>', `<style>${css}</style></head>`);
out = out.replace(
  '</body>',
  `<script type="application/octet-stream" id="reach-bundle">${jsB64}</script>\n<script>${loader}</script>\n</body>`,
);

const target = join(dist, 'reach-preview.html');
writeFileSync(target, out);
console.log(
  `inlined preview written to ${target} (${(out.length / 1024).toFixed(0)} kB) — css ${cssFile ?? 'none'}, js ${jsFile}`,
);
