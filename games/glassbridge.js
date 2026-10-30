/**
 * Glass Bridge (جسر الزجاج) — every team gets its own bridge with the SAME hidden pattern, so no team can
 * copy another: both bridges look identical until a pane breaks. Each beat the team's current jumper reads
 * the vote (left / right, freshest taps win) and jumps; a broken pane drops them and the next teammate
 * starts from the last safe pane. Furthest wins; fewer falls breaks the tie.
 */
'use strict';
const S = require('../lib/sim');

const STEPS = 7, VOTE_MS = 2800, JUMP_MS = 900, BEAT = VOTE_MS + JUMP_MS;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 77);
  const pattern = []; for (let i = 0; i < STEPS; i++) pattern.push(rng() < 0.5 ? 0 : 1);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, pattern, steps: STEPS, teams: {}, parts: [], beat: 0, beatT: 0, phase: 'vote', reveal: {} };
  const byTeam = {};
  for (const p of players) { (byTeam[p.team] || (byTeam[p.team] = [])).push(p); st.parts.push(p.id); }
  for (const k of Object.keys(byTeam)) {
    const team = +k, rot = byTeam[k];
    st.teams[team] = {
      team, pos: 0, best: 0, falls: 0, finished: false, finishOrder: 0,
      rot, ri: 0, jumper: rot[0].id, choice: null, lastChoice: null, votes: [], voters: 0,
      falling: 0, revealed: [],
    };
    st.reveal[team] = [];
  }
  st.order = Object.keys(st.teams).map(Number);
  return st;
}

function voteTally(T, now) {
  const q = T.votes.filter(v => now - v.ts < 1200);
  let l = 0, r = 0, last = null;
  for (const v of q) { const w = Math.exp(-(now - v.ts) / 320); if (v.dir === 'left') l += w; else r += w; last = v.dir; }
  if (!q.length) return null;
  if (Math.abs(l - r) < 0.12) return last;
  return l > r ? 'left' : 'right';
}

function onInput(room, st, p, msg) {
  const T = st.teams[p.team]; if (!T || st.done || T.finished) return;
  const dir = msg.dir || (msg.side === 1 ? 'right' : msg.side === 0 ? 'left' : null);
  if (dir !== 'left' && dir !== 'right') return;
  T.votes.push({ dir, ts: st.t, pid: p.id });
  if (T.votes.length > 60) T.votes.splice(0, T.votes.length - 60);
  T.voters = new Set(T.votes.map(v => v.pid)).size;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt; st.beatT += dt;
  if (st.beatT >= BEAT) { st.beatT -= BEAT; st.beat++; }
  const ph = st.beatT < VOTE_MS ? 'vote' : 'jump';
  if (ph !== st.phase) { st.phase = ph; if (ph === 'jump') resolveAll(st); }
  for (const k of Object.keys(st.teams)) {
    const T = st.teams[k];
    if (T.falling > 0) T.falling = Math.max(0, T.falling - dt / 700);
  }
  const live = Object.values(st.teams).filter(T => !T.finished);
  if (!live.length || (st.t > 3000 && Object.values(st.teams).every(T => T.finished))) st.done = true;
}

function resolveAll(st) {
  for (const k of Object.keys(st.teams)) {
    const T = st.teams[k];
    if (T.finished) continue;
    const dir = voteTally(T, st.t);
    T.choice = dir;
    if (!dir) { nextJumper(T); continue; }              // silence costs the beat, not the run
    const safeSide = st.pattern[T.pos] === 0 ? 'left' : 'right';
    if (dir === safeSide) {
      T.revealed[T.pos] = 1;
      T.pos++; T.best = Math.max(T.best, T.pos);
      if (T.pos >= STEPS) { T.finished = true; T.finishOrder = ++st.finish; }
    } else {
      T.revealed[T.pos] = 0;
      T.falls++; T.falling = 1;
      T.pos = T.best;                                   // next teammate restarts from the last safe pane
    }
    nextJumper(T);
  }
}

function nextJumper(T) {
  T.ri = (T.ri + 1) % T.rot.length;
  T.jumper = T.rot[T.ri].id;
  T.votes = [];
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const table = Object.values(st.teams).map(T => ({ team: T.team, pos: T.best, falls: T.falls, finished: T.finished, finishOrder: T.finishOrder || 99 }))
    .sort((a, b) => (b.pos - a.pos) || (a.falls - b.falls) || (a.finishOrder - b.finishOrder));
  const teamPoints = S.teamTablePoints(table);
  const playerPoints = {};
  for (const id of st.parts) { const p = room.players[id]; if (p) playerPoints[id] = 10 + Math.round((table.find(r => r.team === p.team).pos || 0) * 6); }
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${win.pos}/${STEPS} ألواح` : 'انتهى الجسر',
    teamPoints, playerPoints, crowns: [], table,
  };
}

function hostView(room, st) {
  const chars = st.parts.map(id => {
    const p = room.players[id]; const T = st.teams[p.team];
    return {
      id, team: p.team, x: (p.team - 3.5) * 2.9 + (T.jumper === id ? 0 : 0), z: -6 + (T.pos || 0) * 1.75,
      out: false, jumper: T.jumper === id, jump: T.falling > 0 && T.jumper === id ? (1 - T.falling) * 0.6 : -1,
    };
  });
  return {
    chars,
    game: {
      id: 'glassbridge', steps: st.steps, phase: st.phase, beatT: st.beatT, voteMs: VOTE_MS,
      teams: Object.values(st.teams).map(T => ({ team: T.team, pos: T.pos, best: T.best, falls: T.falls, finished: T.finished, choice: T.choice, revealed: T.revealed, voters: T.voters })),
    },
    hud: { left: null, alive: st.parts.length },
  };
}

function padView(room, st, p) {
  const T = st.teams[p.team];
  const yours = T && T.jumper === p.id && !T.finished;
  const dirs = T && T.choice ? { choice: T.choice } : {};
  let hint = null;
  if (p.bot && yours && st.phase === 'vote') {
    /* the bot reads the same hint a human would get from watching the bridge: 70% correct read */
    hint = { kind: 'vote', dir: Math.random() < 0.7 ? (st.pattern[T.pos] === 0 ? 'left' : 'right') : (Math.random() < 0.5 ? 'left' : 'right') };
  }
  return {
    head: T && T.finished ? 'عبرتم! 🎉' : yours ? 'اقفز — يسار أم يمين؟' : 'شاهد — دور زميلك',
    sub: yours ? `اللوح ${S.ar((T.pos || 0) + 1)} من ${S.ar(st.steps)}` : (T && T.jumper ? 'الزميل يختار' : ''),
    controls: { type: 'pick', disabled: !yours || st.phase !== 'vote', options: [{ id: 'left', label: 'يسار', en: 'LEFT', hex: '#2f9a92' }, { id: 'right', label: 'يمين', en: 'RIGHT', hex: '#e0b558' }] },
    stats: [{ k: 'الألواح', v: `${S.ar(T ? T.best : 0)}/${S.ar(st.steps)}` }, { k: 'السقطات', v: S.ar(T ? T.falls : 0) }],
    meters: [], feed: st.phase === 'jump' && T && T.choice ? (T.choice === (st.pattern[Math.max(0, T.pos - 1)] === 0 ? 'left' : 'right') ? '✅' : '💥') : '',
    team: { i: (p.team || 1) - 1 }, dirs,
    bot: hint,
  };
}

module.exports = {
  id: 'glassbridge', name: { ar: 'جسر الزجاج', en: 'Glass Bridge' }, emoji: '🪟',
  tagline: 'اختر اللوح الآمن', how: 'لكل فريق جسر بنفس النمط المخفي. صوّتوا يسار أو يمين — الأغلبية تقفز. السقوط يعيدكم لآخر لوح آمن.',
  formats: ['team'], durationMs: 60000, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
