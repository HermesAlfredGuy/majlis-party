/**
 * Sword Clash (مبارزة السيوف) — 1v1 SPOTLIGHT, best of five. Both fighters choose a guard in the same window
 * and the blades resolve at once: high beats mid, mid beats low, low beats high, same guard is a clash.
 * Simultaneous picks mean the round is decided by the choice, never by who has the better ping.
 */
'use strict';
const S = require('../lib/sim');

const PICK_MS = 2600, SHOW_MS = 1500, ROUNDS = 5;

const BEATS = { high: 'mid', mid: 'low', low: 'high' };
const AR = { high: 'عالٍ', mid: 'وسط', low: 'منخفض' };

function create(room, opts) {
  const ps = S.participants(room);
  const st = { t: 0, done: false, round: 0, phase: 'pick', phaseT: 0, picks: {}, score: {}, parts: [], log: [], rng: S.mulberry32(opts && opts.seed ? opts.seed : 3), result: null };
  ps.slice(0, 2).forEach(p => { st.parts.push(p.id); st.score[p.id] = 0; });
  return st;
}

function onInput(room, st, p, msg) {
  if (st.done || !st.parts.includes(p.id) || st.phase !== 'pick') return;
  const g = msg.guard || msg.id || msg.dir;
  if (!['high', 'mid', 'low'].includes(g)) return;
  st.picks[p.id] = g;
}

function resolve(st) {
  const [a, b] = st.parts;
  const pa = st.picks[a] || ['high', 'mid', 'low'][Math.floor(st.rng() * 3)];
  const pb = st.picks[b] || ['high', 'mid', 'low'][Math.floor(st.rng() * 3)];
  let winner = null;
  if (pa !== pb) winner = BEATS[pa] === pb ? a : b;
  if (winner) st.score[winner]++;
  st.result = { a: pa, b: pb, winner };
  st.log.push(st.result);
  st.phase = 'show'; st.phaseT = 0;
  const best = Math.max(st.score[a], st.score[b]);
  if (best >= 3 || st.round + 1 >= ROUNDS) st.done = true;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt; st.phaseT += dt;
  if (st.phase === 'pick' && st.phaseT >= PICK_MS) resolve(st);
  else if (st.phase === 'show' && st.phaseT >= SHOW_MS) {
    if (st.done) return;
    st.round++; st.phase = 'pick'; st.phaseT = 0; st.picks = {}; st.result = null;
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const [a, b] = st.parts;
  const sa = st.score[a] || 0, sb = st.score[b] || 0;
  const winner = sa === sb ? (st.result && st.result.winner) || a : sa > sb ? a : b;
  const loser = winner === a ? b : a;
  const teamPoints = {};
  const tw = room.players[winner] ? room.players[winner].team : 1;
  const tl = room.players[loser] ? room.players[loser].team : 2;
  teamPoints[tw] = S.placePoints(0);
  if (tl !== tw) teamPoints[tl] = S.placePoints(1);
  const playerPoints = {}; playerPoints[winner] = 40; if (loser) playerPoints[loser] = 18;
  return {
    winnerTeam: tw,
    summary: `${room.players[winner] ? room.players[winner].nick : ''} ${Math.max(sa, sb)}–${Math.min(sa, sb)}`,
    teamPoints, playerPoints,
    crowns: [{ playerId: winner, label: 'سيف المجلس', detail: `${Math.max(sa, sb)}–${Math.min(sa, sb)}` }],
    table: [{ team: tw, value: Math.max(sa, sb) }, { team: tl, value: Math.min(sa, sb) }],
  };
}

function hostView(room, st) {
  const chars = st.parts.map((id, i) => ({ id, team: room.players[id] ? room.players[id].team : i + 1, x: i === 0 ? -3.4 : 3.4, z: 1.2, out: false, jump: -1, vx: i === 0 ? 0.6 : -0.6 }));
  return {
    chars,
    game: {
      id: 'swordclash', phase: st.phase, round: st.round + 1, rounds: ROUNDS, pickMs: PICK_MS,
      score: st.parts.map(id => ({ id, nick: room.players[id] ? room.players[id].nick : '', team: room.players[id] ? room.players[id].team : 1, v: st.score[id] || 0 })),
      picks: st.phase === 'show' && st.result ? { a: st.result.a, b: st.result.b, winner: st.result.winner } : (st.phase === 'pick' ? { locked: Object.keys(st.picks).length } : null),
      ar: AR,
    },
    hud: { left: Math.max(0, Math.ceil((PICK_MS - st.phaseT) / 1000)), alive: 2 },
  };
}

function padView(room, st, p) {
  const mine = st.parts.includes(p.id);
  if (!mine) {
    return {
      head: 'شاهد المبارزة', sub: 'مبارزة ١ ضد ١ — توقّع الفائز', controls: { type: 'pick', disabled: true, options: [{ id: 'a', label: 'الأول', hex: '#2f9a92' }, { id: 'b', label: 'الثاني', hex: '#e0b558' }] },
      stats: [], team: { i: (p.team || 1) - 1 },
    };
  }
  const other = st.parts.find(x => x !== p.id);
  const locked = !!st.picks[p.id];
  return {
    head: st.phase === 'pick' ? (locked ? 'اخترت — انتظر الخصم' : 'اختر حارسك') : 'النتيجة',
    sub: `${room.players[other] ? room.players[other].nick : ''} · ${st.score[p.id] || 0} — ${st.score[other] || 0}`,
    controls: { type: 'pick', disabled: st.phase !== 'pick' || locked, options: [{ id: 'high', label: 'عالٍ', en: 'HIGH', hex: '#e0b558' }, { id: 'mid', label: 'وسط', en: 'MID', hex: '#2f9a92' }, { id: 'low', label: 'منخفض', en: 'LOW', hex: '#d2573f' }] },
    stats: [{ k: 'الجولة', v: `${S.ar(st.round + 1)}/${S.ar(ROUNDS)}` }, { k: 'نتيجتك', v: S.ar(st.score[p.id] || 0) }],
    meters: st.phase === 'pick' ? [{ label: 'الوقت', pct: Math.round(Math.max(0, 1 - st.phaseT / PICK_MS) * 100) }] : [],
    feed: st.phase === 'show' && st.result ? (st.result.winner === p.id ? '⚔️ أصبت' : st.result.winner ? '💥 أصابك' : 'تعادل') : '',
    team: { i: (p.team || 1) - 1 },
    bot: p.bot && st.phase === 'pick' && !locked ? { kind: 'pick', id: ['high', 'mid', 'low'][Math.floor(st.rng() * 3)] } : null,
  };
}

module.exports = {
  id: 'swordclash', name: { ar: 'مبارزة السيوف', en: 'Sword Clash' }, emoji: '⚔️',
  tagline: 'حارس… ضربة… فوز', how: 'أفضل من خمس. كل جولة تختار حراساً في نفس اللحظة: عالٍ يهزم وسط، وسط يهزم منخفض، منخفض يهزم عالٍ.',
  formats: ['spotlight'], durationMs: 40000, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
