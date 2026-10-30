#!/usr/bin/env node
/**
 * Deterministic review shots: fill the room, shoot the lobby, start the party, then shoot every phase
 * (including the board turn) at 1920×1080. Bots are spawned detached and their output is discarded so a
 * full pipe can never stall them.
 *
 *   node tools/scene-shots.js --key 9632 --out /tmp/shots --secs 120
 */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const URL = String(arg('url', 'http://127.0.0.1:9520'));
const OUT = String(arg('out', '/opt/data/cache/scratch/mp'));
const SECS = Number(arg('secs', 120));
const BOTS = Number(arg('bots', 45));
const KEY = String(arg('key', ''));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  await page.goto(URL + '/host', { waitUntil: 'networkidle' });

  const bots = spawn(process.execPath, [path.join(__dirname, 'loadtest.js'), '--url', URL, '--bots', String(BOTS), '--key', KEY, '--max', String(SECS + 120)], { cwd: path.join(__dirname, '..'), stdio: 'ignore', detached: false });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: path.join(OUT, '00-lobby-full.png') });

  const { io } = require('socket.io-client');
  await new Promise((res) => {
    const s = io(URL, { transports: ['websocket'] });
    s.on('connect', () => { s.emit('admin', { action: 'party_start', key: KEY }, () => { s.close(); res(); }); });
    setTimeout(() => { try { s.close(); } catch (e) {} res(); }, 4000);
  });

  const seen = new Set(); let n = 1; const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < SECS) {
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => ({ ph: document.body.dataset.phase || '', gm: document.body.dataset.game || '' }));
    const key = st.ph === 'playing' ? 'playing:' + st.gm : st.ph;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, String(n++).padStart(2, '0') + '-' + key.replace(/[^a-z0-9]/gi, '-') + '.png') });
    console.log('shot', key);
  }
  try { bots.kill('SIGKILL'); } catch (e) {}
  console.log(JSON.stringify({ errors: [...new Set(errs)].slice(0, 5) }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
