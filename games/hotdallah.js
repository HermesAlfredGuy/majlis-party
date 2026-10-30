/**
 * Hot Dallah (الدلّة الساخنة) — the majlis hot potato. One player holds the dallah; the fuse is hidden and
 * nobody knows how close it is. Tap to hand it to the next player in the circle. Whoever is holding it when
 * it goes off is out, and the dallah restarts in someone else's hand.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 52000, PASS_CD = 320;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 11);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng, ring: players.map(p => p.id), live: {}, holder: null, fuse: 0, lastPass: -999, bangs: 0, outAt: {}, flash: 0 };
  players.forEach(p => { st.live[p.id] = true; });
  st.holder = st.ring[Math.floor(rng() * st.ring.length)];
  st.fuse = 5200 + rng() * 5200;
  return st;
}

const alive = (st) => st.ring.filter(id => st.live[id]);

function onInput(room, st, p, msg) {
  if (st.done || !st.live[p.id]) return;
  if (msg.kind !== 'tap' && msg.kind !== 'pass') return;
  if (st.holder !== p.id) return;
  if (st.t - st.lastPass < PASS_CD) return;
  const ring = alive(st);
  if (ring.length < 2) return;
  const i = ring.indexOf(p.id);
  st.holder = ring[(i + 1) % ring.length];
  st.lastPass = st.t;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  if (st.flash > 0) st.flash = Math.max(0, st.flash - dt);
  st.fuse -= dt;
  if (st.fuse <= 0) {
    st.live[st.holder] = false; st.outAt[st.holder] = st.t; st.bangs++; st.flash = 900;
    const ring = alive(st);
    if (ring.length <= 1) { st.done = true; return; }
    st.holder = ring[Math.floor(st.rng() * ring.length)];
    st.fuse = Math.max(2600, 5200 - st.bangs * 700) + st.rng() * 3800;
  }
  if (st.t >= DURATION || alive(st).length <= 1) st.done = true;
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const rank = st.ring.slice().sort((a, b) => {
    const la = st.live[a] ? 1e9 : st.outAt[a], lb = st.live[b] ? 1e9 : st.outAt[b];
    return lb - la;
  });
  const byTeam = {};
  rank.forEach((id, i) => {
    const p = room.players[id]; if (!p) return;
    const T = byTeam[p.team] || (byTeam[p.team] = { team: p.team, score: 0, n: 0, best: 1e9 });
    T.n++; T.score += rank.length - i; T.best = Math.min(T.best, i);
  });
  const table = Object.values(byTeam).sort((a, b) => b.score - a.score || a.best - b.best);
  const teamPoints = {}; table.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  rank.forEach((id, i) => { playerPoints[id] = 6 + (rank.length - i) * 2; });
  const win = table[0];
  const crowns = rank[0] ? [{ playerId: rank[0], label: 'حامل الدلّة', detail: 'آخر من نجا' }] : [];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar} — نجا ${win.n}` : 'انطفأت النار',
    teamPoints, playerPoints, crowns,
    table: table.map(r => ({ team: r.team, value: r.score })),
  };
}

function hostView(room, st) {
  const n = st.ring.length;
  const chars = st.ring.map((id, i) => {
    const a = (i / n) * Math.PI * 2;
    return { id, team: room.players[id].team, x: Math.sin(a) * 6.4, z: Math.cos(a) * 6.4 - 1, out: !st.live[id], hold: st.holder === id, jump: -1 };
  });
  return {
    chars,
    game: {
      id: 'hotdallah', holder: st.holder, holderNick: (room.players[st.holder] || {}).nick || '', holderPos: (() => { const i = st.ring.indexOf(st.holder), n = st.ring.length; const a = (i / Math.max(1, n)) * Math.PI * 2; return { x: Math.sin(a) * 6.4, z: Math.cos(a) * 6.4 - 1 }; })(), fusePct: Math.max(0, Math.min(1, 1 - st.fuse / 9000)), flash: st.flash > 0, bangs: st.bangs,
      alive: alive(st).length, total: st.ring.length,
    },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), alive: alive(st).length },
  };
}

function padView(room, st, p) {
  if (!st.live[p.id]) return { head: 'انفجرت في يدك', sub: 'شاهد البقية', controls: { type: 'none' }, stats: [{ k: 'المتبقّون', v: S.ar(alive(st).length) }], team: { i: (p.team || 1) - 1 } };
  const holding = st.holder === p.id;
  return {
    head: holding ? 'الدلّة عندك! 🔥' : 'انتظر دورك',
    sub: holding ? 'اضغط بسرعة ومرّرها' : 'الدلّة عند لاعب آخر',
    controls: { type: 'tap', label: holding ? 'مرّر الدلّة' : 'ليست عندك', en: holding ? 'PASS' : '', disabled: !holding },
    stats: [{ k: 'المتبقّون', v: S.ar(alive(st).length) }, { k: 'الانفجارات', v: S.ar(st.bangs) }],
    meters: holding ? [{ label: 'الحرارة', pct: Math.round(Math.max(0, Math.min(1, 1 - st.fuse / 9000)) * 100) }] : [],
    feed: holding ? '🔥 مرّرها الآن' : '',
    team: { i: (p.team || 1) - 1 },
    bot: p.bot && holding ? { kind: 'tap' } : null,
  };
}

module.exports = {
  id: 'hotdallah', name: { ar: 'الدلّة الساخنة', en: 'Hot Dallah' }, emoji: '🫖',
  tagline: 'مرّرها قبل الانفجار', how: 'الدلّة مع لاعب واحد فقط والفتيل مخفي. اضغط لتمريرها للجار — من تنفجر في يده يخرج.',
  formats: ['ffa', 'team'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
