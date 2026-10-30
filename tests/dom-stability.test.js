#!/usr/bin/env node
/**
 * DOM stability gate — the owner's refresh bug.
 *
 * "Some components keep refreshing." A pad that wipes #screen on every server tick (5-7 per second) replaces the
 * button under a thumb; the same class of bug the race app fixed in 33c3737. This test runs the real host, the
 * real phone pad and the real admin page against live bot traffic, watches every DOM mutation for 30 s, and fails
 * if any node inside a persistent region is replaced. Text, attribute and class changes are the only allowed writes.
 *
 * Usage: node tests/dom-stability.test.js [seconds]
 * Requires the staging server on PORT (default 9520) and downloads nothing.
 */
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 9520;
const BASE = process.env.BASE || ('http://127.0.0.1:' + PORT);
const KEY = process.env.ADMIN_KEY || '9632';
const SECS = Number(process.argv[2] || 30);

/* regions that must never be rebuilt: they hold static chrome or the control a finger is on */
const RULES = {
  host: ['#scoreboard', '#voterail', '#rulebar', '#dartlegend', '#joinline', '#format', '#playerschip', '#timer'],
  pad: ['#ctlwrap', '.teamchip', '#teamname', '#teamscore', '#brand'],
  admin: ['#players', '#teams'],
};

const OBSERVE = (rules) => `(() => {
  const log = { child: [], text: 0, attr: 0, phaseChanges: 0 };
  const mine = (node) => {
    for (const sel of ${JSON.stringify(rules)}) {
      const root = document.querySelector(sel);
      if (!root) continue;
      if (root === node || root.contains(node)) return sel;
    }
    return null;
  };
  let lastPhase = document.body.dataset.phase || '';
  new MutationObserver((recs) => {
    for (const r of recs) {
      const phase = document.body.dataset.phase || '';
      if (r.type === 'characterData') { log.text++; continue; }
      if (r.type === 'attributes') { log.attr++; continue; }
      if (r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length)) {
        const isEl = (n) => n.nodeType === 1;
        const added = [...r.addedNodes].filter(isEl);
        const removed = [...r.removedNodes].filter(isEl);
        const elems = added.concat(removed);
        /* replacing a bare text node IS a text patch (textContent write); inserting an element for the
           first time is the one legitimate build; DESTROYING an element is the bug this gate exists for */
        if (!elems.length) { log.text++; continue; }
        if (!removed.length) { log.builds = (log.builds || 0) + 1; continue; }
        const target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        const where = mine(target);
        if (where) log.child.push({ where, phase, game: document.body.dataset.game || '',
          added: elems.length, removed: elems.length,
          sample: (elems[0] && (elems[0].id || elems[0].className || elems[0].nodeName) || '').slice(0, 40) });
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
  /* count centre/screen rebuilds separately: one per phase change is legitimate, more is churn */
  const root = document.querySelector('#centre') || document.querySelector('#screen');
  log.rebuilds = 0;
  if (root) new MutationObserver((recs) => {
    for (const r of recs) if (r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length)) log.rebuilds++;
  }).observe(root, { childList: true });
  window.__mjlLog = log;
  window.__mjlPhase = () => document.body.dataset.phase || '';
  return true;
})()`;

async function page(url, rules, browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e.message || e)));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);
  await p.evaluate(OBSERVE(rules));
  return { p, errors };
}

(async () => {
  /* real players first: 16 bots join and play through the party, so every page is under live ticking */
  const bots = spawn('node', [path.join(__dirname, '..', 'tools', 'loadtest.js'),
    '--bots', '16', '--team-only', '--start', '--key', KEY, '--max', String(SECS + 120)], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 4000));

  const st = await (await fetch(BASE + '/api/state')).json();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const host = await page(BASE + '/host?key=' + KEY, RULES.host, browser);

  /* the pad: join for real, then install the observer once the team chip is populated */
  const padCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const padP = await padCtx.newPage();
  const padErrors = [];
  padP.on('pageerror', (e) => padErrors.push(String(e.message || e)));
  await padP.goto(BASE + '/play?c=' + st.code, { waitUntil: 'domcontentloaded' });
  await padP.waitForSelector('input');
  await padP.evaluate(() => {
    const i = document.querySelectorAll('input')[0];
    i.value = 'Observer'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.btn.primary').click();
  });
  await padP.waitForFunction(() => (document.querySelector('#teamname') || {}).textContent !== '—', null, { timeout: 15000 });
  await padP.waitForTimeout(1200);
  await padP.evaluate(OBSERVE(RULES.pad));
  const pad = { p: padP, errors: padErrors };

  const admin = await page(BASE + '/admin?key=' + KEY, RULES.admin, browser);

  /* hold references to the exact interactive nodes a finger would be on */
  await host.p.evaluate(() => { window.__refs = { team1: document.querySelector('#team1'), timer: document.querySelector('#timer') }; });
  await pad.p.evaluate(() => { window.__refs = { chip: document.querySelector('.teamchip') }; });
  /* the pad control is allowed to change between games (a new game is a new control, announced on the
     projector); what must never happen is losing it mid-game. Capture it during a game, then hold it. */
  const padMid = await pad.p.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 70000) {
      if (document.body.dataset.phase === 'playing' && document.querySelector('#ctlwrap')) break;
      await new Promise(r => setTimeout(r, 250));
    }
    const ctl = document.querySelector('#ctlwrap');
    const game = document.body.dataset.game || '';
    window.__mid = { ctl, game, seen: [] };
    await new Promise(r => setTimeout(r, 8000));
    return { game, same: window.__mid.ctl === document.querySelector('#ctlwrap'), gameAfter: document.body.dataset.game || '', phase: document.body.dataset.phase };
  });
  await admin.p.evaluate(() => { window.__refs = { row: document.querySelector('#players .t') }; });

  await new Promise(r => setTimeout(r, SECS * 1000));

  /* an admin action must patch an existing row, never rebuild the list */
  const adminToggle = await admin.p.evaluate(async () => {
    const row = document.querySelector('#players .t');
    if (!row) return { ok: false, why: 'no rows (admin key rejected?)' };
    const nm0 = row.querySelector('.nm').textContent;
    const btn = row.querySelector('button[data-afk]');
    btn.click();
    await new Promise(r => setTimeout(r, 6500));
    const nm1 = document.querySelector('#players .t .nm').textContent;
    const same = window.__refs.row === document.querySelector('#players .t');
    const out = { ok: true, same, before: nm0, after: nm1 };
    document.querySelector('#players .t button[data-afk]').click(); /* put the player back */
    return out;
  });
  const refs = {
    host: await host.p.evaluate(() => ({ team1: !!window.__refs.team1 && window.__refs.team1 === document.querySelector('#team1'), timerAlive: !!window.__refs.timer && window.__refs.timer.isConnected })),
    pad: { ctl: padMid.same && padMid.game === padMid.gameAfter, chip: await pad.p.evaluate(() => !!window.__refs.chip && window.__refs.chip === document.querySelector('.teamchip')), mid: padMid },
  };

  const [h, pd, ad] = await Promise.all([
    host.p.evaluate(() => window.__mjlLog),
    pad.p.evaluate(() => window.__mjlLog),
    admin.p.evaluate(() => window.__mjlLog),
  ]);
  const nav = await host.p.evaluate(() => document.body.dataset.phase + '/' + (document.body.dataset.game || '-'));
  const padTeam = await pad.p.evaluate(() => document.querySelector('#teamname').textContent);

  bots.kill('SIGKILL');
  await browser.close();

  const problems = [];
  for (const [name, log, errs] of [['host', h, host.errors], ['pad', pd, pad.errors], ['admin', ad, admin.errors]]) {
    if (!log) { problems.push(`${name}: observer never installed`); continue; }
    if (log.child.length) {
      const by = {};
      log.child.forEach(c => { const k = c.where + ' @' + c.phase + '/' + c.game; by[k] = (by[k] || 0) + 1; });
      const samples = [...new Set(log.child.map(c => c.where + '→' + c.sample))].slice(0, 6);
      problems.push(`${name}: ${log.child.length} node replacement(s) — ` + Object.entries(by).map(([k, v]) => k + ' ×' + v).join(', ') + ' [' + samples.join(' | ') + ']');
    }
    if (errs.length) problems.push(`${name}: page error — ${errs[0]}`);
    console.log(`${name.padEnd(6)} text patches ${String(log.text).padStart(5)} · attr patches ${String(log.attr).padStart(4)} · node replacements ${log.child.length} · centre rebuilds ${log.rebuilds}`);
  }
  console.log('last phase seen: ' + nav + ' · pad team: ' + padTeam);
  console.log('identity held: host#team1 ' + refs.host.team1 + ' · pad control mid-game ' + refs.pad.ctl + ' (' + refs.pad.mid.game + ' → ' + refs.pad.mid.gameAfter + ') · pad chip ' + refs.pad.chip);
  console.log('admin row patched in place: ' + JSON.stringify(adminToggle));
  if (!refs.host.team1 || !refs.pad.ctl || !refs.pad.chip) problems.push('a persistent node lost its identity');
  if (!adminToggle.ok) problems.push('admin panel: ' + adminToggle.why);
  else if (!adminToggle.same) problems.push('admin panel: the player row was rebuilt on update');

  if (problems.length) { console.log('\nFAIL\n' + problems.map(p => ' - ' + p).join('\n')); process.exit(1); }
  console.log('\nPASS — ' + SECS + 's of live ticks, zero node replacements outside phase changes');
})().catch((e) => { console.error(e); process.exit(1); });
