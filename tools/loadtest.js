#!/usr/bin/env node
/**
 * 45-phone loadtest. Real socket.io clients, real join, real pad views, real inputs — the same code path a
 * phone takes, only the thumb is a bot. Also the rig that produces a live party for the projector capture.
 *
 *   node loadtest.js --bots 45 --games 4 --start
 *   node loadtest.js --bots 20 --watch     (join a party a human started)
 */
'use strict';
const { io } = require('socket.io-client');

const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt; };
const URL = String(arg('url', 'http://localhost:9520'));
const BOTS = Number(arg('bots', 45));
const GAMES_N = Number(arg('games', 4));
const KEY = String(arg('key', '')).toUpperCase();
const START = !!arg('start', false);
const MAX_MS = Number(arg('max', 900)) * 1000;

const stats = { connects: 0, joins: 0, pads: 0, inputs: 0, bets: 0, errors: [], byGame: {}, phases: {} };
const bots = [];
let phase = '', mode = '', modeIdx = 0, startedAt = Date.now(), finalSeen = false;

function log(m) { process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${m}\n`); }
function botAct(bot, s) {
  if (!s || s.paused) return;
  phase = s.phase; stats.phases[s.phase] = (stats.phases[s.phase] || 0) + 1;
  if (s.mode && s.mode !== mode) { mode = s.mode; modeIdx++; for (const b of bots) { b.stroked = false; } }
  const view = s.view;
  const now = Date.now();
  const gm = stats.byGame[s.mode] || (stats.byGame[s.mode] = { inputs: 0, pads: 0 });
  gm.pads++;
  /* bets: the watchers bet once per spotlight game */
  if (s.match && s.match.format === 'spotlight' && s.match.open && s.match.pair && !s.you.spotlight) {
    const key = 'bet' + s.mode + modeIdx;
    if (!bot.betKey || bot.betKey !== key) {
      bot.betKey = key;
      if (Math.random() < 0.85) { bot.socket.emit('bet', { side: Math.random() < 0.5 ? 'a' : 'b' }); stats.bets++; }
    }
  }
  if (!view || !view.bot) {
    /* hold: make sure a previous hold is released */
    if (bot.holding && (!view || !view.bot)) { bot.socket.emit('input', { kind: 'hold', on: false }); bot.holding = false; }
    return;
  }
  const h = view.bot;
  bot.lastAct = bot.lastAct || {};
  const since = now - (bot.lastAct[h.kind] || 0);
  const g = gm;
  const send = (msg) => { bot.socket.emit('input', msg); stats.inputs++; g.inputs++; bot.inputs = (bot.inputs || 0) + 1; };
  if (h.kind === 'tap' && since > 140) { send({ kind: 'tap' }); bot.lastAct[h.kind] = now; }
  else if (h.kind === 'arrow' && since > 420 + Math.random() * 420) {
        /* a thumb is slower than a hint, and sometimes slips — otherwise every bot finishes in 2 s */
        const wrong = Math.random() < 0.07;
        const dirs = ['up', 'down', 'left', 'right'];
        send({ kind: 'arrow', dir: wrong ? dirs[Math.floor(Math.random() * 4)] : h.dir });
        bot.lastAct[h.kind] = now;
      }
  else if (h.kind === 'zone' && since > 380) {
        const key = 'z' + s.mode + modeIdx + (view.stats && view.stats[0] ? view.stats[0].v : '');
        if (bot.zoneKey !== key) { bot.zoneKey = key; send({ kind: 'zone', zone: h.zone }); bot.lastAct[h.kind] = now; }
      }
  else if (h.kind === 'vote' && since > 130 + Math.random() * 120) { send({ kind: 'vote', dir: h.dir }); bot.lastAct[h.kind] = now; }
  else if (h.kind === 'side' && since > 280) { send({ kind: 'side', side: h.side }); bot.lastAct[h.kind] = now; }
  else if (h.kind === 'dart' && since > 1250) { send({ kind: 'dart', x: h.x, y: h.y, power: h.power }); bot.lastAct[h.kind] = now; }
  else if (h.kind === 'tilt' && since > 90) { send({ kind: 'tilt', gx: h.gx, gy: h.gy }); bot.lastAct[h.kind] = now; }
  else if (h.kind === 'move') { if (since > 190) { send({ kind: 'move', dx: h.dx, dz: h.dz }); bot.lastAct[h.kind] = now; } if (since > 700 && Math.random() < 0.3) send({ kind: 'dash' }); }
  else if (h.kind === 'dash' && since > 400) { send({ kind: 'dash' }); bot.lastAct[h.kind] = now; }
  else if (h.kind === 'pick' && since > 500) { send({ kind: 'pick', id: h.id, box: Number(h.id) }); bot.lastAct[h.kind] = now; }
  else if (h.kind === 'stroke' && !bot.stroked) { send({ kind: 'stroke', pts: h.pts }); bot.stroked = true; }
  else if (h.kind === 'word' && since > 900) { send({ kind: 'word', text: h.text }); bot.lastAct[h.kind] = now; }
  else if (h.kind === 'aim') {
    if (!bot.aiming) { send({ kind: 'aim', angle: h.angle }); }
    if (h.hold && !bot.aiming) { send({ kind: 'hold', on: true }); bot.aiming = true; }
    else if (h.fire && bot.aiming) { send({ kind: 'hold', on: false }); bot.aiming = false; }
  }
  else if (h.kind === 'hold') {
    const frac = view.frac != null ? view.frac : 0;
    const shouldHold = h.on != null ? !!h.on : frac < (h.until || 0.5) - 0.04;
    if (shouldHold && !bot.holding) { send({ kind: 'hold', on: true }); bot.holding = true; }
    else if (!shouldHold && bot.holding) { send({ kind: 'hold', on: false }); bot.holding = false; }
  }
}

function spawn(i) {
  const socket = io(URL, { transports: ['websocket'], reconnection: true, reconnectionDelay: 400 });
  /* simulated players carry the kind of names a real majlis full of guests would type, so a capture
     never puts "bot 23" on the projector */
  const NAMES = ['سارة', 'محمد', 'نورة', 'عبدالله', 'لمى', 'فهد', 'هيا', 'تركي', 'شهد', 'ماجد',
    'رنا', 'سلطان', 'دانة', 'بدر', 'أمل', 'ناصر', 'غادة', 'خالد', 'مي', 'يوسف',
    'ريم', 'عمر', 'جواهر', 'زياد', 'لطيفة', 'حسن', 'عائشة', 'طارق', 'منى', 'سعود',
    'هند', 'مشعل', 'بشاير', 'راشد', 'لينا', 'قصي', 'أسماء', 'وليد', 'فرح', 'إبراهيم',
    'شوق', 'نايف', 'دلال', 'مهند', 'عبير'];
  const nickOf = (n) => NAMES[n % NAMES.length] + (n >= NAMES.length ? ' ' + (Math.floor(n / NAMES.length) + 1) : '');
  const bot = { i, socket, nick: nickOf(i), token: '', holding: false, inputs: 0, betKey: null };
  bots.push(bot);
  socket.on('connect', () => {
    stats.connects++;
    socket.emit('join', { nick: bot.nick, bot: true, token: bot.token }, (r) => {
      if (r && r.ok) { stats.joins++; bot.token = r.token; bot.team = r.team; }
      else if (r) stats.errors.push('join: ' + (r.error || '?'));
    });
  });
  socket.on('pad', (s) => { stats.pads++; try { botAct(bot, s); } catch (e) { stats.errors.push('act: ' + e.message); } });
  socket.on('kicked', () => { bot.token = ''; stats.errors.push('kicked'); });
  socket.on('connect_error', (e) => stats.errors.push('connect: ' + e.message));
  return bot;
}

async function main() {
  log(`loadtest → ${URL}  ${BOTS} bots, ${GAMES_N} games${START ? ', starting the party' : ''}`);
  for (let i = 0; i < BOTS; i++) { spawn(i); await new Promise(r => setTimeout(r, 45)); }
  await new Promise(r => setTimeout(r, 2600));
  log(`joined ${stats.joins}/${BOTS} (connects ${stats.connects})`);
  if (START) {
    const admin = io(URL, { transports: ['websocket'] });
    await new Promise(r => admin.on('connect', r));
    const PL = arg('playlist', null);
    /* --team-only: every round TEAM vs TEAM, which is what a 40-phone hall actually gets */
    if (arg('team-only', false)) {
      await new Promise(r => admin.emit('admin', { key: KEY, action: 'formats', on: false }, r));
      log('formats off → every round is TEAM vs TEAM');
    }
    const payload = { key: KEY, action: 'party_start', length: GAMES_N };
    if (PL) payload.playlist = String(PL).split(',').map(s => s.trim()).filter(Boolean);
    admin.emit('admin', payload, (r) => log('party_start → ' + JSON.stringify(r)));
    admin.on('host', (s) => {
      if (s && s.phase === 'final') { finalSeen = true; log('FINAL reached'); }
    });
  }
  /* the party's own state is the only honest end signal */
  const poll = setInterval(async () => {
    try {
      const r = await fetch(URL + '/api/state').then(r => r.json());
      if (r && r.phase === 'final' && !finalSeen) { finalSeen = true; log('FINAL reached'); }
    } catch (e) {}
  }, 3000);
  poll.unref && poll.unref();
  const t0 = Date.now();
  const ticker = setInterval(() => {
    const s = `${Math.round((Date.now() - t0) / 1000)}s  phase=${phase}${mode ? ' game=' + mode : ''}  inputs=${stats.inputs}  pads=${stats.pads}  bets=${stats.bets}`;
    if (process.stdout.isTTY) process.stdout.write('\r' + s.padEnd(110));
    else if ((Date.now() - t0) % 10000 < 1000) log(s);
  }, 1000);
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (finalSeen || Date.now() - startedAt > MAX_MS) { clearInterval(check); resolve(); }
    }, 500);
  });
  clearInterval(ticker);
  const secs = Math.round((Date.now() - startedAt) / 1000);
  log(`\n— done in ${secs}s —`);
  log(`connects ${stats.connects} · joins ${stats.joins} · pad frames ${stats.pads} (${(stats.pads / Math.max(1, secs)).toFixed(0)}/s) · inputs ${stats.inputs} · bets ${stats.bets}`);
  for (const [g, v] of Object.entries(stats.byGame)) log(`  ${g.padEnd(10)} inputs ${String(v.inputs).padStart(6)}   pad frames ${v.pads}`);
  const uniq = [...new Set(stats.errors)];
  if (uniq.length) log(`errors (${stats.errors.length}): ${uniq.slice(0, 8).join(' | ')}`);
  else log('errors: none');
  for (const b of bots) b.socket.disconnect();
  process.exit(stats.joins >= Math.min(BOTS, BOTS * 0.95) && finalSeen ? 0 : (finalSeen ? 0 : 2));
}
main().catch(e => { console.error(e); process.exit(1); });
