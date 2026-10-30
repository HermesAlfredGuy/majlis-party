/**
 * Gyro Darts (سهام المجلس) — the phone IS the dart. Tilt it and the projector's reticle follows; flick it forward and
 * the phone decides where that dart landed and sends ONE message. Nothing in the throw depends on the network: a bad
 * connection can delay the message, not bend the dart.
 *
 * Board: a falcon-eye set of rings (50 · 25 · 20 · 15 · 10 · 5). Three darts per round, three rounds. A stronger flick
 * means less drop, so the control is aim + commit, not twitch speed.
 */
'use strict';
const S = require('../lib/sim');

const ROUNDS = 3, ROUND_MS = 11000, OPEN_LEAD = 1400, DARTS = 3, MIN_GAP = 950;
const DURATION = ROUNDS * ROUND_MS + 600;
const RINGS = [[0.06, 50], [0.13, 25], [0.3, 20], [0.48, 15], [0.68, 10], [0.9, 5]];

function ringOf(x, y) {
  const r = Math.hypot(x, y);
  for (const [lim, pts] of RINGS) if (r <= lim) return pts;
  return 0;
}

function create(room, opts) {
  const rng = S.mulberry32((opts && opts.seed) || 83);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng, parts: players.map(p => p.id), players: {}, team: {}, round: 0, darts: [] };
  for (const p of players) st.players[p.id] = { id: p.id, team: p.team, total: 0, thrown: [], n: 0, best: 0, lastAt: -9999 };
  for (const t of S.TEAM_IDS) st.team[t] = { team: t, sum: 0, n: 0, best: 0, darts: 0 };
  return st;
}

const roundOpen = (st) => {
  const start = st.round * ROUND_MS + OPEN_LEAD;
  return st.round < ROUNDS && st.t >= start && st.t < (st.round + 1) * ROUND_MS;
};

function onInput(room, st, p, msg) {
  const q = st.players[p.id]; if (!q || st.done || !roundOpen(st)) return;
  if (msg.kind !== 'dart' && msg.kind !== 'throw') return;
  /* three darts per round, not three for the whole game */
  if (q.thrown.filter(d => d.round === st.round).length >= DARTS) return;
  if (st.t - q.lastAt < MIN_GAP) return;
  let x = Number(msg.x), y = Number(msg.y);
  if (!isFinite(x) || !isFinite(y)) return;
  x = S.clamp(x, -1.35, 1.35); y = S.clamp(y, -1.35, 1.35);
  /* a weak flick drops the dart low; the spread is small and never enough to hide a bad aim */
  const power = S.clamp(isFinite(Number(msg.power)) ? Number(msg.power) : 0.6, 0, 1);
  const wob = (1 - power) * 0.05 + 0.012;
  x = S.clamp(x + (st.rng() - 0.5) * wob, -1.4, 1.4);
  y = S.clamp(y - (1 - power) * 0.16 + (st.rng() - 0.5) * wob, -1.4, 1.4);
  const pts = ringOf(x, y);
  q.lastAt = st.t; q.n++; q.total += pts; q.best = Math.max(q.best, pts);
  q.thrown.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, pts, at: st.t, round: st.round });
  st.darts.push({ id: p.id, team: p.team, nick: p.nick, x, y, pts, at: st.t, round: st.round });
  if (st.darts.length > 60) st.darts.shift();
  const T = st.team[q.team];
  if (T) { T.sum += pts; T.darts++; T.best = Math.max(T.best, q.total); }
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  const r = Math.floor(st.t / ROUND_MS);
  if (r !== st.round) st.round = Math.min(r, ROUNDS);
  if (st.t >= ROUNDS * ROUND_MS) {
    for (const t of S.TEAM_IDS) {
      const T = st.team[t];
      T.n = st.parts.filter(id => st.players[id] && st.players[id].team === t).length;
    }
    st.done = true;
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const rows = S.TEAM_IDS.map(t => {
    const T = st.team[t];
    return { team: t, value: T.n ? Math.round((T.sum / T.n) * 10) / 10 : 0, darts: T.darts, best: T.best };
  }).filter(r => r.darts > 0 || r.value > 0);
  rows.sort((a, b) => b.value - a.value || b.best - a.best);
  const teamPoints = {}; rows.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const id of st.parts) { const q = st.players[id]; if (q) playerPoints[id] = 8 + q.total; }
  const top = st.parts.slice().sort((a, b) => st.players[b].total - st.players[a].total)[0];
  const win = rows[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${win.value} نقطة للاعب` : 'انتهت السهام',
    teamPoints, playerPoints,
    crowns: top ? [{ playerId: top, label: 'عين الصقر', detail: `${st.players[top].total} نقطة بـ ${st.players[top].n} سهم` }] : [],
    table: rows.map(r => ({ team: r.team, value: r.value, detail: r.best + ' أفضل لاعب' })),
  };
}

function hostView(room, st) {
  const teams = S.TEAM_IDS.map(t => {
    const T = st.team[t];
    let best = 0, n = 0;
    for (const id of st.parts) { const q = st.players[id]; if (!q || q.team !== t) continue; best = Math.max(best, q.total); n++; }
    return { team: t, sum: T.sum, best, n };
  });
  const recent = st.darts.slice(-16).map(d => ({ team: d.team, x: Math.round(d.x * 100) / 100, y: Math.round(d.y * 100) / 100, pts: d.pts, nick: d.nick }));
  return {
    game: {
      id: 'darts', phase: roundOpen(st) ? 'throw' : 'settle',
      round: Math.min(ROUNDS, st.round + 1), rounds: ROUNDS, dartsPerRound: DARTS,
      recent, teams,
    },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), round: Math.min(ROUNDS, st.round + 1) + '/' + ROUNDS },
  };
}

function padView(room, st, p) {
  const q = st.players[p.id];
  if (!q) return { head: 'الجولة القادمة', controls: { type: 'none' }, stats: [], team: { i: (p.team || 1) - 1 } };
  const open = roundOpen(st);
  const used = q.thrown.filter(d => d.round === st.round).length;
  const left = Math.max(0, DARTS - used);
  let hint = null;
  if (p.bot && open && left > 0 && st.t - q.lastAt > MIN_GAP + 120) {
    /* bots aim near the centre with a skill spread; a weak one drifts off the bull */
    const n = (parseInt(String(p.id).replace(/\D/g, ''), 10) || 7);
    const spread = 0.03 + ((n * 37) % 9) / 9 * 0.16;
    const a = ((n * 53) % 360) * Math.PI / 180;
    hint = { kind: 'dart', x: Math.cos(a) * spread, y: Math.sin(a) * spread, power: 0.55 + ((n * 17) % 5) / 5 * 0.45 };
  }
  return {
    head: open ? (left > 0 ? 'صوّب وأفلت' : 'سهامك خلصت') : 'استعد…',
    sub: open ? `سهم ${S.ar(DARTS - left + 1)} من ${S.ar(DARTS)} — الجولة ${S.ar(Math.min(ROUNDS, st.round + 1))}` : 'اسحب لتصويب، وأفلت بسرعة للرمي',
    controls: { type: 'dart', disabled: !open || left === 0 || st.done, darts: left, label: 'أمِل للتصويب · أفلت للرمي' },
    stats: [{ k: 'المجموع', v: S.ar(q.total) }, { k: 'أفضل سهم', v: S.ar(q.best) }, { k: 'السهام المتبقية', v: S.ar(Math.max(0, DARTS - used)) + ' من ' + S.ar(DARTS) }],
    meters: [],
    feed: q.thrown.length ? (q.thrown[q.thrown.length - 1].pts ? '+' + S.ar(q.thrown[q.thrown.length - 1].pts) : 'خارج اللوح') : '',
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'darts', name: { ar: 'سهام المجلس', en: 'Gyro Darts' }, emoji: '🎯',
  tagline: 'الجوال هو السهم', how: 'أمِل جوالك للتصويب وأفلته بسرعة لترمي. ثلاث سهام في الجولة، ثلاث جولات — الفلّة خمسون.',
  formats: ['team', 'spotlight', 'ffa'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
