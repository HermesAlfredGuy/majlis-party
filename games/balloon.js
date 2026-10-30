/**
 * Balloon Pump (نفخ البالون) — each team has a balloon with a hidden burst point. Players take turns on
 * the pump: hold to inflate, release to hand over to the next teammate. Default variant "lose": the team
 * that pops it drops to last. 45 people all get a go because the turn passes every release.
 */
'use strict';
const S = require('../lib/sim');
const R = require('./_relay');

const DURATION = 34000;

function create(room, opts) {
  const st = R.createRelay(room, Object.assign({ rate: 0.30 }, opts || {}));
  st.variant = (opts && opts.variant) || 'lose';
  st.burst = {};
  for (const k of Object.keys(st.teams)) st.burst[st.teams[k].team] = st.teams[k].burst;
  return st;
}

function onInput(room, st, p, msg) { R.relayInput(room, st, p, msg); }

function tick(room, st, dt) {
  R.relayTick(room, st, dt);
  if (!st.done && st.t >= DURATION) st.done = true;
}
const over = (room, st) => !!st.done;

function finish(room, st) {
  const rows = Object.keys(st.teams).map(k => {
    const T = st.teams[k];
    const frac = T.popped ? 1 : Math.min(1, T.value / (T.burst || 1));
    return { team: T.team, value: Math.round(T.value * 100) / 100, frac: Math.round(frac * 100) / 100, popped: T.popped, poppedAt: T.poppedAt, turns: Math.round(T.turns * 10) / 10, members: T.rot.length };
  });
  rows.sort((a, b) => {
    if (st.variant === 'win') {
      if (a.popped !== b.popped) return a.popped ? -1 : 1;             // first to pop wins
      if (a.popped && b.popped) return a.poppedAt - b.poppedAt;
      return b.frac - a.frac;
    }
    if (a.popped !== b.popped) return a.popped ? 1 : -1;               // popper loses
    return b.frac - a.frac;                                            // closest without popping wins
  });
  const teamPoints = S.teamTablePoints(rows);
  const playerPoints = {};
  for (const id of st.parts) { const p = room.players[id]; if (p) playerPoints[id] = 8 + Math.round((st.teams[p.team].turns || 0) * 4); }
  const win = rows[0];
  const popper = rows.find(r => r.popped);
  const crowns = [];
  if (popper && popper.team !== (win && win.team)) crowns.push({ playerId: popper.current, label: 'فرقعة', detail: 'من أفقد فريقه الجولة' });
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${Math.round(win.frac * 100)}٪ دون انفجار` : 'انتهى الوقت',
    teamPoints, playerPoints, crowns: crowns.filter(c => c.playerId), table: rows,
  };
}

const durationMs = DURATION;

module.exports = {
  id: 'balloon', name: { ar: 'نفخ البالون', en: 'Balloon Pump' }, emoji: '🎈',
  tagline: 'انفخ بحذر — الانفجار يخسرك',
  how: 'بالون لكل فريق ونقطة انفجار مخفية. دورك: اضغط باستمرار للنفخ ثم اترك لتمرير الدور لزميلك.',
  formats: ['team', 'spotlight'], durationMs, create, onStart: () => {}, onInput, tick, over, finish,
  hostView: (room, st) => R.relayHostView(room, st, 'balloon'),
  padView: (room, st, p) => R.relayPadView(room, st, p, 'balloon'),
};
