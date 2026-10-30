#!/usr/bin/env node
/**
 * Projector + phone capture. Opens the real host page and a real phone page against a running party and
 * writes frames (and optionally a video) to a directory. Used for the review gate and the party video.
 *
 *   node capture.js --url http://localhost:9520 --out /tmp/shots --secs 60 --every 2
 *   node capture.js --video /tmp/party.mp4 --secs 70
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const URL = String(arg('url', 'http://localhost:9520'));
const OUT = String(arg('out', '/opt/data/cache/scratch/party-shots'));
const SECS = Number(arg('secs', 40));
const EVERY = Number(arg('every', 2));
const VIDEO = arg('video', null);
const PHONE_ONLY = !!arg('phone', false);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const vdir = VIDEO ? path.join(OUT, 'video') : null;
  if (vdir) fs.mkdirSync(vdir, { recursive: true });
  const hostCtx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, recordVideo: VIDEO && !PHONE_ONLY ? { dir: vdir, size: { width: 1600, height: 900 } } : undefined });
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, recordVideo: VIDEO ? { dir: path.join(vdir, 'phone'), size: { width: 390, height: 844 } } : undefined });
  const errors = [];
  const host = await hostCtx.newPage();
  host.on('console', (m) => { if (m.type() === 'error') errors.push('host: ' + m.text()); });
  host.on('pageerror', (e) => errors.push('host pageerror: ' + e.message));
  if (!PHONE_ONLY) { await host.goto(URL + '/host', { waitUntil: 'load' }); }
  const phone = await phoneCtx.newPage();
  phone.on('console', (m) => { if (m.type() === 'error') errors.push('phone: ' + m.text()); });
  phone.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message));
  await phone.goto(URL + '/play', { waitUntil: 'load' });
  await phone.waitForTimeout(700);
  const hasInput = await phone.locator('input').count();
  if (hasInput) {
    await phone.locator('input').first().fill('محمد');
    await phone.locator('button.primary').first().click();
    await phone.waitForTimeout(900);
  }
  const t0 = Date.now();
  let i = 0;
  const shots = [];
  while ((Date.now() - t0) / 1000 < SECS) {
    const stamp = String(i).padStart(2, '0');
    if (!PHONE_ONLY) {
      const p = path.join(OUT, `host-${stamp}.png`);
      await host.screenshot({ path: p });
      shots.push(p);
    }
    if (i % 2 === 0) {
      const pp = path.join(OUT, `phone-${stamp}.png`);
      await phone.screenshot({ path: pp });
      shots.push(pp);
    }
    i++;
    await new Promise(r => setTimeout(r, EVERY * 1000));
  }
  const state = await host.evaluate(() => (window.MJ && MJ.state) ? { phase: MJ.state.phase, mode: MJ.state.mode, players: MJ.state.players, scores: MJ.state.teams.map(t => t.score) } : null).catch(() => null);
  if (VIDEO) {
    await host.close(); await phone.close();
    await hostCtx.close(); await phoneCtx.close();
    const vids = [];
    for (const d of [vdir, path.join(vdir, 'phone')]) {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) if (f.endsWith('.webm')) vids.push(path.join(d, f));
    }
    fs.writeFileSync(path.join(OUT, 'videos.json'), JSON.stringify(vids, null, 1));
    console.log('VIDEOS', JSON.stringify(vids));
    if (vids.length >= 2) {
      const [hostVid, phoneVid] = vids.sort((a, b) => (a.includes('phone') ? 1 : 0) - (b.includes('phone') ? 1 : 0));
      const r = spawnSync('ffmpeg', ['-y', '-i', hostVid, '-i', phoneVid, '-filter_complex',
        '[1:v]scale=-2:900[p];[0:v][p]hstack=inputs=2[v]', '-map', '[v]', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', VIDEO],
        { encoding: 'utf8' });
      if (r.status !== 0) console.error('ffmpeg failed', r.stderr && r.stderr.slice(-400));
      else console.log('MP4', VIDEO);
    }
  }
  console.log(JSON.stringify({ shots: shots.length, state, errors: [...new Set(errors)].slice(0, 8) }, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
