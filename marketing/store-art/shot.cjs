// Renders a list of HTML pages to PNG with the system Chrome, one browser session.
// usage: node shot.cjs jobs.json   (jobs: [{html, out, w, h}])
// Playwright is not a dependency of this repo: point PLAYWRIGHT_PATH at an installed copy.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'],
  });
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    await page.goto('file://' + j.html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // every <img> must be decoded before the shot
    await page.evaluate(async () => {
      await Promise.all([...document.images].map(i => i.complete ? Promise.resolve() : new Promise(r => { i.onload = r; i.onerror = r; })));
    });
    const bad = await page.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
    if (bad.length) { console.error('IMAGE FAILED', j.html, bad); process.exitCode = 2; }
    const fontsOk = await page.evaluate(() => [...document.fonts].every(f => f.status === 'loaded' || f.status === 'unloaded'));
    const fontErr = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'error').map(f => f.family));
    if (fontErr.length) { console.error('FONT FAILED', j.html, fontErr); process.exitCode = 2; }
    await page.screenshot({ path: j.out, type: 'png', fullPage: false });
    await page.close();
    console.log('rendered', j.out);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
