/**
 * Glass Fill (املأ الكأس) — the calm one. Every team shares one glass; players take turns holding to pour,
 * releasing to pass. Spill and your team is out of the round; the fullest glass that never spilled wins.
 */
'use strict';
const S = require('../lib/sim');
const R = require('./_relay');

const DURATION = 32000;

function create(room, opts) {
  const st = R.createRelay(room, Object.assign({ rate: 0.26 }, opts || {}));
  /* the glass is a known size: the hidden number is gone, the risk is your own nerve */
  for (const k of Object.keys(st.teams)) st.teams[k].burst = 1.0;
  return st;
}
function onInput(room, st, p, msg) { R.relayInput(room, st, p, msg); }
function tick(room, st, dt) { R.relayTick(room, st, dt); if (!st.done && st.t >= DURATION) st.done = true; }
const over = (room, st) => !!st.done;

function finish(room, st) {
  const rows = Object.keys(st.teams).map(k => {
    const T = st.teams[k];
    return { team: T.team, value: Math.round(T.value * 100) / 100, frac: Math.round(Math.min(1, T.value) * 100) / 100, popped: T.popped, poppedAt: T.poppedAt, turns: Math.round(T.turns * 10) / 10, members: T.rot.length };
  });
  rows.sort((a, b) => (a.popped !== b.popped ? (a.popped ? 1 : -1) : b.frac - a.frac));
  const teamPoints = {}; rows.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const id of st.parts) { const p = room.players[id]; if (p) playerPoints[id] = 8 + Math.round((st.teams[p.team].turns || 0) * 4); }
  const win = rows[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${Math.round(win.frac * 100)}٪ بلا فوضى` : 'انتهى الوقت',
    teamPoints, playerPoints, crowns: [], table: rows,
  };
}

module.exports = {
  id: 'glassfill', name: { ar: 'املأ الكأس', en: 'Glass Fill' }, emoji: '🫖',
  tagline: 'املأ بلا فوضى', how: 'كأس كبير لكل فريق. دورك: اضغط باستمرار للسكب ثم اترك لزميلك. الفائض يخسر الفريق.',
  formats: ['team', 'spotlight'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish,
  hostView: (room, st) => R.relayHostView(room, st, 'glassfill'),
  padView: (room, st, p) => R.relayPadView(room, st, p, 'glassfill'),
};
