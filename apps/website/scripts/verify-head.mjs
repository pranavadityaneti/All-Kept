// Proves the exported site carries what the outside world reads before a person does: the share
// preview, the canonical address, the App Store banner, the measurement tags, the sitemap and the
// robots file. Runs against out/ after `next build`; any missing piece fails the build check.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../out');
const read = (f) => readFileSync(path.join(out, f), 'utf8');
const fail = (m) => { console.error('✗', m); process.exitCode = 1; };
const ok = (m) => console.log('✓', m);
const must = (haystack, needle, label) => (haystack.includes(needle) ? ok(label) : fail(`${label} — missing: ${needle}`));

const home = read('index.html');
must(home, '1608009750873679', 'Meta Pixel id on the home page');
must(home, 'fbevents.js', 'Meta Pixel loader');
must(home, 'property="og:image"', 'share image');
must(home, 'property="og:url" content="https://www.allkept.app"', 'canonical share address');
must(home, 'name="twitter:card" content="summary_large_image"', 'twitter card');
must(home, 'rel="canonical" href="https://www.allkept.app"', 'canonical link');
must(home, 'name="apple-itunes-app" content="app-id=6809901300"', 'App Store banner');
{
  // The Vercel components render nothing into the HTML; their loaders ship in a chunk and attach after load.
  const chunks = readdirSync(path.join(out, '_next/static/chunks')).filter((f) => f.endsWith('.js')).map((f) => read(`_next/static/chunks/${f}`)).join('\n');
  must(chunks, '/_vercel/insights/script.js', 'Vercel analytics loader shipped');
  must(chunks, '/_vercel/speed-insights/script.js', 'Vercel speed insights loader shipped');
}
must(home, 'googletagmanager.com/gtag/js?id=G-WZDX3LHXGB', 'GA4 tag');
must(home, "gtag('config','G-WZDX3LHXGB')", 'GA4 config');
for (const page of ['privacy', 'terms', 'support', 'delete']) {
  const html = read(`${page}.html`);
  must(html, `rel="canonical" href="https://www.allkept.app/${page}"`, `canonical on /${page}`);
  must(html, 'property="og:image"', `share image on /${page}`);
  must(html, 'property="og:site_name"', `site name on /${page}`);
  must(html, `property="og:url" content="https://www.allkept.app/${page}"`, `share address on /${page}`);
}
existsSync(path.join(out, 'sitemap.xml')) ? must(read('sitemap.xml'), 'https://www.allkept.app/privacy', 'sitemap lists the pages') : fail('sitemap.xml missing');
existsSync(path.join(out, 'robots.txt')) ? must(read('robots.txt'), 'Sitemap: https://www.allkept.app/sitemap.xml', 'robots points at the sitemap') : fail('robots.txt missing');
{
  const img = path.join(out, 'opengraph-image.jpg');
  if (!existsSync(img)) fail('opengraph-image.jpg missing from export');
  else { const kb = Math.round(statSync(img).size / 1024); kb < 300 ? ok(`share image exported, ${kb} KB (WhatsApp previews need < 300 KB)`) : fail(`share image is ${kb} KB — WhatsApp will not show a preview above 300 KB`); }
}
process.exitCode ? console.error('head check failed') : console.log('head check passed');
