#!/usr/bin/env node
/* Phone check during a live round: joins, waits for a real control, shoots three frames. */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'); const fs = require('fs');
const OUT = process.argv[2] || '/opt/data/cache/scratch/padlive';
const SECS = Number(process.argv[3] || 60);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:9520/play', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  const inp = p.locator('input').first();
  if (await inp.count()) { await inp.fill('سالم'); await p.locator('button.primary').first().click(); await p.waitForTimeout(900); }
  const bots = spawn(process.execPath, [path.join(__dirname, 'loadtest.js'), '--url', 'http://127.0.0.1:9520', '--bots', '44', '--start', '--key', '9632', '--max', String(SECS + 40)], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  const t0 = Date.now(); let n = 0;
  while ((Date.now() - t0) / 1000 < SECS) {
    await p.waitForTimeout(700);
    const st = await p.evaluate(() => ({ ph: document.body.dataset.phase || '', pad: !!document.querySelector('#screen .pad'), cheer: !!document.querySelector('#cheer') }));
    if (st.ph !== 'playing' || !st.pad) continue;
    await p.screenshot({ path: path.join(OUT, `live-${n++}${st.cheer ? '-cheer' : ''}.png`) });
    if (n >= 4) break;
    await p.waitForTimeout(2600);
  }
  try { bots.kill('SIGKILL'); } catch (e) {}
  console.log(JSON.stringify({ shots: n, errs: errs.slice(0, 3) }));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
