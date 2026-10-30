/**
 * Quick Draw (سحب سريع) — 1v1 SPOTLIGHT, best of three. A random wait, then the signal: tap first. Tap before the
 * signal and you lose the round on the spot. Two taps inside 80 ms are a dead heat and the round is replayed,
 * because at that distance the network, not the hand, decided it.
 */
'use strict';
const S = require('../lib/sim');

const ROUNDS = 3, WIN = 2, GO_MS = 1600, DEAD_HEAT = 80;

function create(room, opts) {
  const ps = S.participants(room);
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 7);
  const st = {
    t: 0, done: false, rng, round: 0, phase: 'wait', phaseT: 0, waitMs: 1500 + rng() * 2600,
    score: {}, taps: [], parts: [], result: null, falseStart: {},
  };
  ps.slice(0, 2).forEach(p => { st.parts.push(p.id); st.score[p.id] = 0; });
  return st;
}

function onInput(room, st, p, msg) {
  if (st.done || !st.parts.includes(p.id)) return;
  if (msg.kind !== 'tap' && msg.kind !== 'draw') return;
  if (st.phase === 'wait') { st.falseStart[p.id] = true; st.taps.push({ id: p.id, at: st.t, early: true }); return; }
  if (st.phase === 'go' && !st.taps.some(x => x.id === p.id)) st.taps.push({ id: p.id, at: st.t, early: false });
}

function resolve(st, reason) {
  const [a, b] = st.parts;
  const early = st.taps.filter(x => x.early);
  let winner = null;
  if (early.length && early.length < st.parts.length) winner = st.parts.find(id => id !== early[0].id);
  else if (early.length === st.parts.length) winner = null;
  else {
    const taps = st.taps.filter(x => !x.early).sort((x, y) => x.at - y.at);
    if (taps.length >= 2 && taps[1].at - taps[0].at < DEAD_HEAT) { st.result = { dead: true }; st.phase = 'show'; st.phaseT = 0; return; }
    if (taps.length) winner = taps[0].id;
  }
  if (winner) st.score[winner]++;
  st.result = { winner, dead: false, reason };
  st.phase = 'show'; st.phaseT = 0;
  if (Math.max(st.score[a] || 0, st.score[b] || 0) >= WIN || st.round + 1 >= ROUNDS) st.done = true;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt; st.phaseT += dt;
  if (st.phase === 'wait' && st.phaseT >= st.waitMs) { st.phase = 'go'; st.phaseT = 0; }
  else if (st.phase === 'go' && st.phaseT >= GO_MS) resolve(st, 'timeout');
  else if (st.phase === 'show' && st.phaseT >= 1600) {
    if (st.done) return;
    st.round++; st.phase = 'wait'; st.phaseT = 0; st.taps = []; st.falseStart = {}; st.result = null;
    st.waitMs = 1200 + st.rng() * 2800;
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const [a, b] = st.parts;
  const sa = st.score[a] || 0, sb = st.score[b] || 0;
  const winner = sa === sb ? (st.result && st.result.winner) || a : sa > sb ? a : b;
  const loser = winner === a ? b : a;
  const tw = room.players[winner] ? room.players[winner].team : 1;
  const tl = room.players[loser] ? room.players[loser].team : 2;
  const teamPoints = {}; teamPoints[tw] = S.placePoints(0); if (tl !== tw) teamPoints[tl] = S.placePoints(1);
  const playerPoints = {}; playerPoints[winner] = 40; if (loser) playerPoints[loser] = 18;
  return {
    winnerTeam: tw,
    summary: `${(room.players[winner] || {}).nick || ''} ${Math.max(sa, sb)}–${Math.min(sa, sb)}`,
    teamPoints, playerPoints,
    crowns: [{ playerId: winner, label: 'أسرع يد', detail: `${Math.max(sa, sb)}–${Math.min(sa, sb)}` }],
    table: [{ team: tw, value: Math.max(sa, sb) }, { team: tl, value: Math.min(sa, sb) }],
  };
}

function hostView(room, st) {
  const chars = st.parts.map((id, i) => ({ id, team: room.players[id] ? room.players[id].team : i + 1, x: i === 0 ? -2.6 : 2.6, z: 1.0, out: false, jump: -1 }));
  return {
    chars,
    game: {
      id: 'quickdraw', phase: st.phase, round: st.round + 1, rounds: ROUNDS, result: st.result,
      score: st.parts.map(id => ({ id, nick: (room.players[id] || {}).nick || '', team: (room.players[id] || {}).team || 1, v: st.score[id] || 0 })),
      early: Object.keys(st.falseStart).length,
    },
    hud: { left: st.phase === 'wait' ? null : Math.max(0, Math.ceil((GO_MS - st.phaseT) / 100) / 10), alive: 2 },
  };
}

function padView(room, st, p) {
  const mine = st.parts.includes(p.id);
  if (!mine) {
    return {
      head: 'شاهد', sub: 'اسحب سريع — ١ ضد ١',
      controls: { type: 'pick', disabled: true, options: [{ id: 'a', label: 'الأول', hex: '#2f9a92' }, { id: 'b', label: 'الثاني', hex: '#e0b558' }] },
      stats: [], team: { i: (p.team || 1) - 1 },
    };
  }
  const other = st.parts.find(x => x !== p.id);
  let head = 'استعد…';
  if (st.phase === 'go') head = 'الآن! اسحب 🔫';
  else if (st.phase === 'show') head = st.result && st.result.dead ? 'تعادل — تُعاد' : st.result && st.result.winner === p.id ? 'فزت بالجولة' : 'خسرت الجولة';
  const botHint = p.bot && !st.taps.some(x => x.id === p.id)
    ? (st.phase === 'go' ? { kind: 'tap' } : (st.phase === 'wait' && Math.random() < 0.012 ? { kind: 'tap' } : null))
    : null;
  return {
    head,
    sub: `${(room.players[other] || {}).nick || ''} · ${st.score[p.id] || 0} — ${st.score[other] || 0}`,
    controls: { type: 'tap', label: st.phase === 'go' ? 'اسحب!' : 'انتظر الإشارة', en: st.phase === 'go' ? 'FIRE' : '', disabled: st.phase === 'show' },
    stats: [{ k: 'الجولة', v: `${S.ar(st.round + 1)}/${S.ar(ROUNDS)}` }],
    meters: [], feed: st.phase === 'go' ? '⚡' : '',
    team: { i: (p.team || 1) - 1 },
    bot: botHint,
  };
}

module.exports = {
  id: 'quickdraw', name: { ar: 'سحب سريع', en: 'Quick Draw' }, emoji: '🔫',
  tagline: 'لا تسحب قبل الإشارة', how: 'انتظر إشارة الشاشة ثم اضغط أولاً. من يسحب قبل الإشارة يخسر الجولة. أفضل من ثلاث.',
  formats: ['spotlight'], durationMs: 40000, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
