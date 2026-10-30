/**
 * Qahwa Pour (صبّ القهوة) — the WarioWare "POUR!" idea as a full, calm round. Three attempts per player: tilt the
 * phone forward to pour, level it to stop at the line. The cup fills at a steady rate that never accelerates, so
 * the skill is knowing when to stop, not reacting fast. Over the brim is a spill and the attempt scores nothing.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 40000, ATTEMPTS = 3, TARGET = 0.62, PERFECT = 0.06, SPILL = 0.985;
const POUR_RATE = 0.34, MAX_ATTEMPT = 6200, RESET_MS = 1000, DROP_MS = 320;

function create(room, opts) {
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng: S.mulberry32((opts && opts.seed) || 41), parts: players.map(p => p.id), players: {}, team: {}, pours: 0, spills: 0 };
  for (const p of players) {
    st.players[p.id] = { id: p.id, team: p.team, attempt: 0, fill: 0, pour: 0, dropT: 0, resetT: 0, startedAt: 0, scores: [], total: 0, best: 0, state: 'pour', flash: '', flashUntil: 0 };
  }
  for (const t of S.TEAM_IDS) st.team[t] = { team: t, best: 0, sum: 0, n: 0, spills: 0, perfect: 0, fill: 0 };
  return st;
}

function onInput(room, st, p, msg) {
  const q = st.players[p.id]; if (!q || st.done) return;
  if (msg.kind === 'tilt') {
    const gy = Number(msg.gy);
    q.pour = isFinite(gy) ? S.clamp((gy - 0.12) / 0.45, 0, 1) : 0;
  } else if (msg.kind === 'hold') {
    q.pour = msg.on ? 1 : 0;
  }
}

function closeAttempt(q, st, why) {
  const d = Math.abs(q.fill - TARGET);
  let score = d <= PERFECT ? 100 : Math.max(0, Math.round(100 - d * 300));
  if (why === 'spill') { score = 0; q.flash = 'فاضت!'; st.spills++; const T = st.team[q.team]; if (T) T.spills++; }
  else if (score >= 100) { q.flash = 'على الخط! ✨'; const T = st.team[q.team]; if (T) T.perfect++; }
  else q.flash = score > 0 ? Math.round(score) + ' نقطة' : 'بعيد';
  q.flashUntil = st.t + 900;
  q.scores.push(score); q.total += score; q.best = Math.max(q.best, score);
  const T = st.team[q.team];
  if (T) { T.sum += score; T.n++; T.best = Math.max(T.best, score); }
  st.pours++;
  q.attempt++;
  q.state = q.attempt >= ATTEMPTS ? 'done' : 'reset';
  q.resetT = st.t;
  q.fill = 0; q.pour = 0; q.dropT = 0;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  const s = dt / 1000;
  for (const id of st.parts) {
    const q = st.players[id]; if (!q) continue;
    if (q.state === 'reset') {
      if (st.t - q.resetT >= RESET_MS && st.t < DURATION - 1200) { q.state = 'pour'; q.startedAt = st.t; }
      continue;
    }
    if (q.state !== 'pour') continue;
    /* a bot tilts by holding: it lets go once the cup is near the line */
    if (q.pour > 0.05) { q.fill = Math.min(SPILL + 0.02, q.fill + q.pour * POUR_RATE * s); q.dropT = 0; }
    else if (q.fill > 0.02) { q.dropT += dt; }
    if (q.fill >= SPILL) { closeAttempt(q, st, 'spill'); continue; }
    const over = st.t - q.startedAt > MAX_ATTEMPT;
    if ((q.dropT >= DROP_MS && q.fill > 0.02) || over) closeAttempt(q, st, over ? 'time' : 'stop');
  }
  if (st.t >= DURATION) {
    for (const id of st.parts) { const q = st.players[id]; if (q && q.state === 'pour' && q.fill > 0.02) closeAttempt(q, st, 'stop'); }
    st.done = true;
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const rows = S.TEAM_IDS.map(t => {
    const T = st.team[t];
    return { team: t, value: T.n ? Math.round(T.sum / T.n) : 0, best: T.best, perfect: T.perfect, spills: T.spills, pours: T.n };
  }).filter(r => r.pours > 0);
  rows.sort((a, b) => b.value - a.value || b.best - a.best);
  const teamPoints = {}; rows.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const id of st.parts) { const q = st.players[id]; if (q) playerPoints[id] = 8 + q.total; }
  const top = st.parts.slice().sort((a, b) => st.players[b].total - st.players[a].total)[0];
  const win = rows[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${win.value} نقطة متوسط` : 'جفّت الدلّة',
    teamPoints, playerPoints,
    crowns: top ? [{ playerId: top, label: 'صانع القهوة', detail: `${st.players[top].total} من ${ATTEMPTS * 100}` }] : [],
    table: rows.map(r => ({ team: r.team, value: r.value, detail: r.perfect + ' على الخط' })),
  };
}

function hostView(room, st) {
  const teams = S.TEAM_IDS.map(t => {
    const T = st.team[t];
    /* the projector shows each team's best finjan of the round, plus who is pouring right now */
    let cur = null, curBest = -1;
    for (const id of st.parts) { const q = st.players[id]; if (!q || q.team !== t) continue; const v = q.state === 'pour' ? q.fill : 0; if (v > curBest) { curBest = v; cur = q.fill; } }
    return { team: t, best: Math.round(T.best), n: T.n, fill: cur || 0, perfect: T.perfect, spills: T.spills, pouring: curBest > 0.02 };
  });
  return {
    game: { id: 'qahwa', target: TARGET, perfect: PERFECT, teams, pours: st.pours, spills: st.spills, phase: 'pour' },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)) },
  };
}

function padView(room, st, p) {
  const q = st.players[p.id];
  if (!q) return { head: 'الجولة القادمة', controls: { type: 'none' }, watching: true, stats: [], team: { i: (p.team || 1) - 1 } };
  let hint = null;
  if (p.bot && q.state === 'pour') {
    /* a bot pours while it is short of the line and lets go just above it — the same decision a person makes */
    const seed = (parseInt(String(p.id).replace(/\D/g, ''), 10) || 3) * 37 % 100;
    const aim = TARGET + (seed < 25 ? 0.12 : seed < 55 ? 0.04 : seed < 85 ? 0.012 : -0.02); /* clumsy, decent, sharp */
    hint = { kind: 'hold', on: q.fill < aim };
  }
  const pct = Math.round(q.fill * 100), tgt = Math.round(TARGET * 100);
  return {
    head: q.state === 'done' ? 'انتهت محاولاتك' : q.state === 'reset' ? 'فنجان جديد…' : 'صبّ حتى الخط',
    sub: q.state === 'done' ? 'شاهد الفريق' : `المحاولة ${S.ar(Math.min(ATTEMPTS, q.attempt + 1))} من ${S.ar(ATTEMPTS)} — الخط عند ${S.ar(tgt)}٪`,
    controls: { type: 'tilt', axis: 'pour', disabled: q.state !== 'pour' || st.done, invert: false, label: 'أمِل الجوال للصبّ' },
    stats: [{ k: 'الآن', v: q.state === 'pour' ? S.ar(pct) + '٪' : '—' }, { k: 'أفضل', v: S.ar(q.best) }, { k: 'المجموع', v: S.ar(q.total) }],
    meters: [{ k: 'الفنجان', pct: Math.min(100, pct), target: tgt }],
    feed: st.t < q.flashUntil ? q.flash : '',
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'qahwa', name: { ar: 'صبّ القهوة', en: 'Qahwa Pour' }, emoji: '☕',
  tagline: 'قف عند الخط', how: 'أمِل جوالك لتصبّ القهوة، وأعِده ليتوقف السكب على الخط. ثلاث محاولات — الفائض يُسقط المحاولة.',
  formats: ['team', 'ffa', 'spotlight'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
