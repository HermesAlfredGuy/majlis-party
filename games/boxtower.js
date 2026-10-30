/**
 * Box Tower (برج الصناديق) — a team relay. One swinging crate at a time: tap to drop it. Land it on the stack
 * and the tower grows; miss by too much and the whole tower comes down, so the next teammate starts again
 * from the floor. Tallest tower when the music stops.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 48000, SWING = 0.95, DROP_MS = 520, MISS = 0.85, MAXH = 8, AMP = 1.9;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 23);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng, teams: {}, parts: [], swing: 0 };
  const byTeam = {};
  for (const p of players) { (byTeam[p.team] || (byTeam[p.team] = [])).push(p); st.parts.push(p.id); }
  for (const k of Object.keys(byTeam)) {
    const rot = byTeam[k];
    st.teams[k] = { team: +k, rot, ri: 0, cur: rot[0].id, stack: [], drops: 0, falls: 0, dropping: 0, dropX: 0, lastResult: null, lastResultT: 0 };
  }
  return st;
}

const boxX = (st) => Math.sin(st.t / 1000 * SWING * Math.PI) * AMP;

function isAligned(st, T) {
  const topX = T.stack.length ? T.stack[T.stack.length - 1] : 0;
  return Math.abs(boxX(st) - topX) < MISS * 0.55;
}

function onInput(room, st, p, msg) {
  const T = st.teams[p.team]; if (!T || st.done || T.dropping || T.stack.length >= MAXH) return;
  if (msg.kind !== 'tap' || T.cur !== p.id) return;
  T.dropping = st.t; T.dropX = boxX(st);
}

function land(T) {
  const topX = T.stack.length ? T.stack[T.stack.length - 1] : 0;
  const off = Math.abs(T.dropX - topX);
  if (off <= MISS) {
    T.stack.push(T.dropX); T.lastResult = 'ok';
    if (T.stack.length >= MAXH) T.lastResult = 'max';
  } else {
    T.falls++; T.lastResult = 'fall'; T.stack = [];
  }
  T.drops++; T.lastResultT = 0;
  if (T.stack.length >= MAXH) T.maxed = true;
  T.ri = (T.ri + 1) % T.rot.length; T.cur = T.rot[T.ri].id;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  for (const k of Object.keys(st.teams)) {
    const T = st.teams[k];
    if (T.dropping) {
      if (st.t - T.dropping >= DROP_MS) { land(T); T.dropping = 0; }
    }
    if (T.lastResult) T.lastResultT += dt;
    if (T.lastResultT > 1100) T.lastResult = null;
  }
  if (st.t >= DURATION) st.done = true;
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const table = Object.values(st.teams).map(T => ({ team: T.team, value: T.stack.length, best: T.stack.length, falls: T.falls, drops: T.drops }))
    .sort((a, b) => b.value - a.value || a.falls - b.falls);
  const teamPoints = {}; table.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {}; for (const id of st.parts) playerPoints[id] = 6 + (table.find(r => r.team === room.players[id].team).value || 0) * 4;
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${S.ar(win.value)} صناديق` : 'انهار الجميع',
    teamPoints, playerPoints, crowns: [], table,
  };
}

function hostView(room, st) {
  const chars = st.parts.map(id => {
    const p = room.players[id]; const T = st.teams[p.team];
    return { id, team: p.team, x: (p.team - 3.5) * 2.8 + (T.cur === id ? 0.2 : 1.3), z: 1.1, out: false, jump: -1, current: T.cur === id };
  });
  return {
    chars,
    game: {
      id: 'boxtower', swing: boxX(st), dropT: 0,
      teams: Object.values(st.teams).map(T => ({ team: T.team, maxed: !!T.maxed, stack: T.stack, dropping: T.dropping ? Math.min(1, (st.t - T.dropping) / DROP_MS) : -1, dropX: T.dropX, result: T.lastResult, falls: T.falls, cur: T.cur })),
    },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), alive: st.parts.length },
  };
}

function padView(room, st, p) {
  const T = st.teams[p.team];
  const yours = T && T.cur === p.id && !st.done;
  return {
    head: st.done ? 'انتهى' : yours ? 'أنت الآن — أسقط الصندوق' : 'دور زميلك',
    sub: T ? `البرج ${S.ar(T.stack.length)} صندوق` : '',
    controls: { type: 'tap', label: yours ? 'أسقط' : 'انتظر', en: yours ? 'DROP' : '', disabled: !yours || !!T.dropping },
    stats: [{ k: 'برجكم', v: S.ar(T ? T.stack.length : 0) }, { k: 'السقطات', v: S.ar(T ? T.falls : 0) }],
    meters: [],
    feed: T && T.lastResult === 'fall' ? '💥 انهار البرج' : T && T.lastResult === 'ok' ? '✓ ثبت' : '',
    team: { i: (p.team || 1) - 1 },
    bot: p.bot && yours && !T.dropping && isAligned(st, T) ? { kind: 'tap' } : null,
  };
}

module.exports = {
  id: 'boxtower', name: { ar: 'برج الصناديق', en: 'Box Tower' }, emoji: '🧱',
  tagline: 'أسقط بدقّة وارفع البرج', how: 'صندوق يتأرجح فوق برجكم — اضغط في اللحظة المناسبة. الخطأ يُسقط البرج كاملاً ويبدأ زميلك من الأرض.',
  formats: ['team'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
