/**
 * Relay helper — the shared body of Balloon Pump and Glass Fill: one player per team holds a button to
 * push a shared meter, releases to hand the turn to the next teammate. 45 people all get a go.
 */
'use strict';
const S = require('../lib/sim');

function createRelay(room, opts) {
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = {
    t: 0, done: false, over: false, teams: {}, parts: players.map(p => p.id),
    holds: 0, seed: (opts && opts.seed) || 13, botUntil: {}, rng: S.mulberry32((opts && opts.seed) || 13),
    rate: (opts && opts.rate) || 0.34,
  };
  for (const p of players) {
    const T = st.teams[p.team] || (st.teams[p.team] = { team: p.team, value: 0, burst: 0, popped: false, poppedAt: 0, holding: null, turns: 0, passed: 0, rot: null });
    if (!T.rot) T.rot = [];
    T.rot.push(p.id);
  }
  for (const k of Object.keys(st.teams)) {
    const T = st.teams[k];
    T.burst = (opts && opts.burst) ? opts.burst(T) : 0.55 + st.rng() * 0.42;
    T.current = T.rot[0];
  }
  return st;
}

function passTurn(st, T, pid, now) {
  T.holding = null;
  const i = T.rot.indexOf(pid);
  let next = null;
  for (let k = 1; k <= T.rot.length; k++) { const cand = T.rot[(i + k) % T.rot.length]; if (cand !== pid) { next = cand; break; } }
  T.current = next || pid;
  T.passed++;
  if (next) st.botUntil[next] = 0.35 + st.rng() * 0.6;
}

function relayInput(room, st, p, msg) {
  const T = st.teams[p.team]; if (!T || st.done || T.popped) return;
  if (T.current !== p.id) return;
  if (msg.kind === 'hold') {
    if (msg.on) { T.holding = p.id; st.holds++; }
    else if (T.holding === p.id) passTurn(st, T, p.id, st.t);
  } else if (msg.kind === 'tap' || msg.kind === 'pump') {
    T.value += 0.045;
    if (T.value >= T.burst) pop(st, T);
  }
  if (T.value >= T.burst && !T.popped) pop(st, T);
}

function pop(st, T) { T.popped = true; T.poppedAt = st.t; T.value = Math.min(1, T.value); T.holding = null; }

function relayTick(room, st, dt) {
  st.t += dt;
  const s = dt / 1000;
  let anyLive = false;
  for (const k of Object.keys(st.teams)) {
    const T = st.teams[k];
    if (T.popped) continue;
    anyLive = true;
    if (T.holding) {
      T.value += st.rate * s;
      T.turns += s;
      if (T.value >= T.burst) pop(st, T);
    }
  }
  if (!anyLive) st.done = true;
}

function relayHostView(room, st, kind) {
  const chars = st.parts.map(id => {
    const p = room.players[id]; if (!p) return null;
    const T = st.teams[p.team];
    return {
      id, team: p.team, x: (p.team - 3.5) * 1.5, z: 3.2 + (T && T.rot.indexOf(id) % 5) * 0.55,
      out: !!(T && T.popped), current: !!(T && T.current === id), jump: -1,
    };
  }).filter(Boolean);
  const teams = Object.keys(st.teams).map(k => {
    const T = st.teams[k];
    return {
      team: T.team, value: Math.round(Math.min(1, T.value / (T.burst || 1)) * 1000) / 1000,
      raw: Math.round(T.value * 1000) / 1000, popped: T.popped, poppedAt: T.poppedAt,
      current: T.current, passed: T.passed, turns: Math.round(T.turns * 10) / 10,
    };
  });
  return { chars, game: { id: kind, teams, burstHidden: true }, hud: { left: null, alive: chars.filter(c => !c.out).length } };
}

function relayPadView(room, st, p, kind) {
  const T = st.teams[p.team];
  if (!T) return { head: 'الجولة القادمة', controls: { type: 'none' }, stats: [], team: { i: (p.team || 1) - 1 } };
  const yours = T.current === p.id && !T.popped;
  return {
    head: T.popped ? 'انفجر!' : yours ? 'دورك — اضغط باستمرار' : 'دور زميلك',
    sub: T.popped ? 'فريقك خرج من هذه الجولة' : yours ? (kind === 'balloon' ? 'ارفع… ثم اترك لتمرير الدور' : 'اسكب… ثم اترك للتمرير') : 'انتظر دورك',
    controls: { type: 'hold', disabled: !yours, label: kind === 'balloon' ? 'اضغط وانفخ' : 'اضغط واسكب', en: 'HOLD' },
    stats: [{ k: 'الدور', v: yours ? 'أنت' : '—' }, { k: 'المرات', v: S.ar(T.passed) }],
    meters: [],
    feed: T.popped ? '💥' : '',
    team: { i: (p.team || 1) - 1 },
    frac: T.popped ? 1 : Math.min(1, T.value / (T.burst || 1)),
    bot: yours && p.bot ? { kind: 'hold', until: st.botUntil[p.id] || 0.5 } : null,
  };
}

module.exports = { createRelay, relayInput, relayTick, relayHostView, relayPadView, passTurn };
