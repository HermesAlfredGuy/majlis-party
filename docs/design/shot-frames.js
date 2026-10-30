#!/usr/bin/env node
/** Renders the three style frames to docs/design/*.png at 1920x1080. */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname);
const URL = process.env.BASE || 'http://127.0.0.1:9520';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(URL + '/design/frames.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  for (const id of ['f1', 'f2', 'f3']) {
    const el = await page.$('#' + id);
    await el.screenshot({ path: path.join(OUT, id + '.png') });
    console.log('wrote', id + '.png');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
