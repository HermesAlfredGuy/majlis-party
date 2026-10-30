#!/usr/bin/env node
/**
 * Live phone inspection: joins as a player and, once a second, reports the phase, the control type the
 * server sent, and the real on-screen boxes of every button. Catches the failures a screenshot hides
 * (a control that never renders, a 20 px tap target, a panel pushed under the fold).
 */
'use strict';
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const URL = String(arg('url', 'http://localhost:9520'));
const SECS = Number(arg('secs', 40));
const OUT = String(arg('out', '/opt/data/cache/scratch/phone'));
const NICK = String(arg('nick', 'فاحص'));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '/play', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const n = await page.locator('input').count();
  if (n) { await page.locator('input').first().fill(NICK); await page.locator('button.primary').first().click(); }
  const t0 = Date.now();
  let last = '';
  while ((Date.now() - t0) / 1000 < SECS) {
    const info = await page.evaluate(() => {
      const ctl = document.querySelector('#ctl');
      const btn = ctl ? [...ctl.querySelectorAll('button')] : [];
      const vp = { w: innerWidth, h: innerHeight };
      return {
        head: (document.querySelector('#screen h2') || {}).textContent || '',
        sub: (document.querySelector('.tiny') || {}).textContent || '',
        type: ctl ? (ctl.querySelector('.arrows') ? 'arrows' : ctl.querySelector('.tiles') ? 'colours' : ctl.querySelector('.stick') ? 'stick' : 'other') : 'none',
        buttons: btn.map(b => { const r = b.getBoundingClientRect(); return { t: (b.textContent || '').trim().slice(0, 12), w: Math.round(r.w || r.width), h: Math.round(r.height), y: Math.round(r.top), vis: r.width > 1 && r.height > 1 }; }).slice(0, 8),
        scroll: { body: document.body.scrollHeight, vp: vp.h },
      };
    }).catch(() => null);
    const line = info ? `${info.type} | ${info.head} | ${info.sub} | buttons=${info.buttons.filter(b => b.vis).length} h=${info.buttons.map(b => b.h).join('/')} | scroll ${info.scroll.body}/${info.scroll.vp}` : 'no page';
    if (line !== last) { console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ` + line); last = line; }
    await page.screenshot({ path: `${OUT}-${Math.round((Date.now() - t0) / 1000)}.png` }).catch(() => {});
    await page.waitForTimeout(1000);
  }
  if (errors.length) console.log('ERRORS', [...new Set(errors)].slice(0, 5));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
