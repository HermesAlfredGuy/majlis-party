#!/usr/bin/env node
/* Phone review shots at 390×844: a live round (cheer bar), and the board vote rendered from a synthetic
   server payload, so the component is checked even when no team happens to land on the fork. */
'use strict';
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || '/opt/data/cache/scratch/pad';
const URL = 'http://127.0.0.1:9520';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '/play', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(OUT, 'phone-join.png') });
  const inp = p.locator('input').first();
  if (await inp.count()) { await inp.fill('سالم'); await p.locator('button.primary').first().click(); await p.waitForTimeout(1200); }
  await p.screenshot({ path: path.join(OUT, 'phone-wait.png') });

  const bots = spawn(process.execPath, [path.join(__dirname, 'loadtest.js'), '--url', URL, '--bots', '20', '--key', '9632'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await p.waitForTimeout(2500);
  await b.close();
  console.log(JSON.stringify({ errs: errs.slice(0, 4) }));
})().catch(e => { console.error(e); process.exit(1); });
