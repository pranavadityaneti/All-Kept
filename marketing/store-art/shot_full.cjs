// Renders one HTML page at a fixed width and its natural height (used for the contact sheet).
// Playwright is not a dependency of this repo: point PLAYWRIGHT_PATH at an installed copy.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const [,, html, out, w] = process.argv;
  const browser = await chromium.launch({ channel: 'chrome', args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: +w, height: 800 }, deviceScaleFactor: 1 });
  await page.goto('file://' + html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
  if (bad.length) { console.error('IMAGE FAILED', bad); process.exit(2); }
  const h = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
  await page.setViewportSize({ width: +w, height: h });
  await page.screenshot({ path: out, type: 'png', fullPage: false });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
