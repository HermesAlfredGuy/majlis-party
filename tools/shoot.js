#!/usr/bin/env node
/**
 * Review shots: open the real projector at 1920×1080, spawn 45 bots, and save one frame for every phase
 * boundary (lobby, wheel, play floor, board, results). This is the picture the design is judged on.
 *
 *   node tools/shoot.js --url http://127.0.0.1:9520 --bots 45 --key 9632 --secs 75 --out /tmp/shots
 */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const URL = String(arg('url', 'http://127.0.0.1:9520'));
const OUT = String(arg('out', '/opt/data/cache/scratch/mp-shots'));
const SECS = Number(arg('secs', 75));
const BOTS = Number(arg('bots', 45));
const KEY = String(arg('key', ''));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(URL + '/host', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, '00-lobby.png') });

  let bots = null;
  if (BOTS > 0) {
    bots = spawn(process.execPath, [path.join(__dirname, 'loadtest.js'), '--url', URL, '--bots', String(BOTS), '--start', '--key', KEY, '--max', '10'],
      { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  }
  const seen = new Set(['lobby']);
  const t0 = Date.now();
  let n = 1;
  while ((Date.now() - t0) / 1000 < SECS) {
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => ({
      phase: document.body.dataset.phase || '',
      mode: document.body.dataset.game || '',
      idx: document.body.dataset.idx || '',
      players: (document.querySelector('#playerschip') || {}).textContent || '',
    })).catch(() => null);
    if (!st) continue;
    const key = st.phase === 'playing' ? 'playing:' + (st.mode || 'x') : st.phase;
    if (seen.has(key)) continue;
    seen.add(key);
    await page.waitForTimeout(600);
    const f = path.join(OUT, String(n++).padStart(2, '0') + '-' + key.replace(/[^a-z0-9]/gi, '-') + '.png');
    await page.screenshot({ path: f });
    console.log('shot', f, 'players', st.players);
  }
  if (bots) bots.kill('SIGTERM');
  console.log(JSON.stringify({ shots: seen.size, errors: [...new Set(errs)].slice(0, 6) }, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
