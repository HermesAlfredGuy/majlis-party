/**
 * Lucky Pick (اختيار الحظ) — five chests, one trap, every player picks in the same short window. Whoever
 * opens the trapped chest is out; everyone else goes again with a fresh chest board. Last player standing.
 */
'use strict';
const S = require('../lib/sim');

const ROUND_MS = 4200, BOXES = 5, MAX_ROUNDS = 8;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 41);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng, round: 0, phase: 'pick', phaseT: 0, trap: 0, picks: {}, live: {}, outAt: {}, parts: players.map(p => p.id), revealed: null };
  players.forEach(p => { st.live[p.id] = true; });
  st.trap = Math.floor(rng() * BOXES);
  return st;
}

const alive = (st) => st.parts.filter(id => st.live[id]);

function onInput(room, st, p, msg) {
  if (st.done || !st.live[p.id] || st.phase !== 'pick') return;
  if (msg.kind !== 'pick' && msg.kind !== 'zone' && msg.kind !== 'tap') return;
  const b = Number(msg.box != null ? msg.box : msg.zone != null ? msg.zone : msg.id);
  if (!isFinite(b) || b < 0 || b >= BOXES) return;
  st.picks[p.id] = Math.floor(b);
}

function resolve(st) {
  const hit = [];
  for (const id of alive(st)) {
    const b = st.picks[id] != null ? st.picks[id] : Math.floor(st.rng() * BOXES);
    if (b === st.trap) { st.live[id] = false; st.outAt[id] = st.t; hit.push(id); }
  }
  st.revealed = { trap: st.trap, hit: hit.length };
  st.phase = 'show'; st.phaseT = 0;
  if (alive(st).length <= 1 || st.round + 1 >= MAX_ROUNDS) st.done = true;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt; st.phaseT += dt;
  if (st.phase === 'pick' && st.phaseT >= ROUND_MS) resolve(st);
  else if (st.phase === 'show' && st.phaseT >= 1500) {
    if (st.done) return;
    st.round++; st.phase = 'pick'; st.phaseT = 0; st.picks = {}; st.trap = Math.floor(st.rng() * BOXES); st.revealed = null;
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const rank = st.parts.slice().sort((a, b) => (st.live[b] ? 1e9 : st.outAt[b] || 0) - (st.live[a] ? 1e9 : st.outAt[a] || 0));
  const byTeam = {};
  rank.forEach((id, i) => {
    const p = room.players[id]; if (!p) return;
    const T = byTeam[p.team] || (byTeam[p.team] = { team: p.team, score: 0, best: 1e9, n: 0 });
    T.n++; T.score += rank.length - i; T.best = Math.min(T.best, i);
  });
  const table = Object.values(byTeam).sort((a, b) => b.score - a.score || a.best - b.best);
  const teamPoints = S.teamTablePoints(table);
  const playerPoints = {}; rank.forEach((id, i) => { playerPoints[id] = 5 + (rank.length - i) * 2; });
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar} — ${S.ar(win.n)} ناجين` : 'انتهت الصناديق',
    teamPoints, playerPoints,
    crowns: rank[0] ? [{ playerId: rank[0], label: 'صندوق الحظ', detail: 'آخر الناجين' }] : [],
    table: table.map(r => ({ team: r.team, value: r.score })),
  };
}

function hostView(room, st) {
  const n = st.parts.length;
  const chars = st.parts.map((id, i) => {
    const a = (i / n) * Math.PI * 2;
    return { id, team: room.players[id].team, x: Math.sin(a) * 6.2, z: Math.cos(a) * 5.4 - 1.2, out: !st.live[id], jump: -1 };
  });
  return {
    chars,
    game: { id: 'luckypick', boxes: BOXES, phase: st.phase, round: st.round + 1, rounds: MAX_ROUNDS, revealed: st.revealed, picks: Object.keys(st.picks).length, alive: alive(st).length, total: st.parts.length },
    hud: { left: Math.max(0, Math.ceil((ROUND_MS - st.phaseT) / 1000)), alive: alive(st).length },
  };
}

function padView(room, st, p) {
  if (!st.live[p.id]) return { head: 'خرجت', sub: 'شاهد الجولة القادمة', controls: { type: 'none' }, watching: true, stats: [{ k: 'المتبقّون', v: S.ar(alive(st).length) }], team: { i: (p.team || 1) - 1 } };
  const locked = st.picks[p.id] != null;
  const opts = [];
  for (let i = 0; i < BOXES; i++) opts.push({ id: String(i), label: '🎁', en: String(i + 1), hex: locked && st.picks[p.id] === i ? '#e0b558' : '#2a4a3c' });
  return {
    head: st.phase === 'pick' ? (locked ? 'اخترت — انتظر' : 'افتح صندوقاً') : 'النتيجة',
    sub: 'واحد فقط فيه فخّ',
    controls: { type: 'pick', disabled: st.phase !== 'pick' || locked, options: opts },
    stats: [{ k: 'المتبقّون', v: S.ar(alive(st).length) }, { k: 'الجولة', v: S.ar(st.round + 1) }],
    meters: st.phase === 'pick' ? [{ label: 'الوقت', pct: Math.round(Math.max(0, 1 - st.phaseT / ROUND_MS) * 100) }] : [],
    feed: st.phase === 'show' && st.revealed ? (st.revealed.hit ? `💥 ${st.revealed.hit} خرجوا` : 'نجا الجميع') : '',
    team: { i: (p.team || 1) - 1 },
    bot: p.bot && st.phase === 'pick' && !locked ? { kind: 'pick', id: String(Math.floor(st.rng() * BOXES)) } : null,
  };
}

module.exports = {
  id: 'luckypick', name: { ar: 'اختيار الحظ', en: 'Lucky Pick' }, emoji: '🎁',
  tagline: 'صندوق واحد فيه فخّ', how: 'خمسة صناديق وواحد مفخّخ. كل اللاعبين يختارون في نفس النافذة — من يفتح الفخّ يخرج.',
  formats: ['ffa', 'team', 'spotlight'], durationMs: 60000, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
