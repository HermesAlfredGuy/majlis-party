/**
 * Arrow Memory (خطوة الذاكرة) — a sequence of four arrows flashes on the big screen, then every player
 * types it back on the arrow pad. Reference: Mortar Mayhem / Mushroom Mix-up / Memory Menu.
 *
 * Memory, not reflexes: nothing here is timed against another player's tap, so 150-500 ms of input
 * latency cannot decide the round. A wrong arrow costs a step and a 900 ms stun.
 */
'use strict';
const S = require('../lib/sim');

const SHOW_MS = 760, GAP_MS = 240, RUN_MS = 20000;
const DIRS = ['up', 'down', 'left', 'right'];
const SEQ_LEN = 5;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 91);
  const seq = [];
  let prev = null;
  while (seq.length < SEQ_LEN) { const d = S.pick(rng, DIRS); if (d !== prev || seq.length === 0) { seq.push(d); prev = d; } }
  const parts = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt).map(p => p.id);
  const st = {
    t: 0, phase: 'show', seq, step: 0, stepT: 0, done: false, over: false, parts,
    progress: {}, finishAt: {}, stunUntil: {}, errs: {}, lastOk: {},
  };
  for (const id of parts) { st.progress[id] = 0; st.errs[id] = 0; }
  return st;
}

const cell = (st) => SHOW_MS + GAP_MS;

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  if (st.phase === 'show') {
    st.stepT += dt;
    if (st.stepT >= cell(st)) { st.stepT -= cell(st); st.step++; }
    if (st.step >= st.seq.length) { st.phase = 'run'; st.t = 0; st.stepT = 0; }
    return;
  }
  const finishers = st.parts.filter(id => st.finishAt[id] != null).length;
  if (st.t >= RUN_MS || (finishers > 0 && finishers === st.parts.length)) st.done = true;
}

function onInput(room, st, p, msg) {
  if (st.phase !== 'run' || st.done) return;
  const dir = String(msg.dir || msg.d || '').toLowerCase();
  if (!DIRS.includes(dir)) return;
  if (st.finishAt[p.id] != null) return;
  const now = st.t;
  if ((st.stunUntil[p.id] || 0) > now) return;
  const want = st.seq[st.progress[p.id] || 0];
  if (dir === want) {
    st.progress[p.id] = (st.progress[p.id] || 0) + 1;
    st.lastOk[p.id] = now;
    if (st.progress[p.id] >= st.seq.length) st.finishAt[p.id] = now;
  } else {
    st.errs[p.id] = (st.errs[p.id] || 0) + 1;
    st.stunUntil[p.id] = now + 900;
    st.progress[p.id] = Math.max(0, (st.progress[p.id] || 0) - 1);
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const byTeam = {};
  for (const id of st.parts) {
    const p = room.players[id]; if (!p) continue;
    const prog = st.progress[id] || 0;
    const val = st.finishAt[id] != null ? 5000 - st.finishAt[id] * 0.12 : prog * 260 - st.errs[id] * 40;
    const t = byTeam[p.team] || (byTeam[p.team] = { team: p.team, score: 0, finished: 0, n: 0 });
    t.score += Math.max(0, val); t.n++; if (st.finishAt[id] != null) t.finished++;
  }
  const table = Object.values(byTeam).sort((a, b) => b.finished - a.finished || b.score - a.score || a.team - b.team);
  const teamPoints = S.teamTablePoints(table);
  const playerPoints = {};
  for (const id of st.parts) {
    const p = room.players[id];
    playerPoints[id] = 10 + (st.progress[id] || 0) * 12 + (p && st.finishAt[id] != null ? 40 : 0);
  }
  const fastest = st.parts.filter(id => st.finishAt[id] != null).sort((a, b) => st.finishAt[a] - st.finishAt[b])[0];
  const crowns = fastest ? [{ playerId: fastest, label: 'أسرع ذاكرة', detail: 'أكمل السلسلة أولاً' }] : [];
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${win.finished} أكملوا السلسلة` : 'انتهت الجولة',
    teamPoints, playerPoints, crowns, table,
  };
}

const DIR_AR = { up: '↑', down: '↓', left: '←', right: '→' };

function hostView(room, st) {
  const chars = st.parts.map(id => {
    const p = room.players[id];
    return {
      id, team: p ? p.team : 1, x: 0, z: 0,
      out: false, done: st.finishAt[id] != null, progress: st.progress[id] || 0,
      err: st.lastOk[id] != null && st.t - st.lastOk[id] < 160,
    };
  });
  return {
    chars,
    game: {
      id: 'arrows', phase: st.phase, seq: st.seq, step: st.step, steps: st.seq.length,
      stepT: st.stepT, cell: cell(st), progress: st.progress, finished: st.parts.filter(id => st.finishAt[id] != null).length,
      total: st.parts.length, symbols: DIR_AR,
    },
    hud: { left: st.phase === 'show' ? null : Math.max(0, Math.ceil((RUN_MS - st.t) / 1000)), alive: st.parts.length },
  };
}

function padView(room, st, p) {
  const prog = st.progress[p.id] || 0;
  const finished = st.finishAt[p.id] != null;
  const stunned = (st.stunUntil[p.id] || 0) > st.t;
  return {
    head: st.phase === 'show' ? 'شاهد السلسلة' : finished ? 'أكملت! ✅' : 'كرر السلسلة',
    sub: st.phase === 'show' ? 'احفظ ترتيب الأسهم' : finished ? 'انتظر بقية اللاعبين' : `الخطوة ${S.ar(prog + 1)} من ${S.ar(st.seq.length)}`,
    controls: { type: 'arrows', disabled: st.phase !== 'run' || finished, dirs: DIRS },
    stats: [{ k: 'التقدم', v: `${S.ar(prog)}/${S.ar(st.seq.length)}` }, { k: 'الأخطاء', v: S.ar(st.errs[p.id] || 0) }],
    meters: [{ label: 'السلسلة', pct: Math.round((prog / st.seq.length) * 100) }],
    feed: stunned ? 'توقف لحظة…' : finished ? '✅' : '',
    team: { i: (p.team || 1) - 1 },
    bot: st.phase === 'run' && !finished && !stunned && p.bot ? { kind: 'arrow', dir: st.seq[prog] } : null,
  };
}

module.exports = {
  id: 'arrows', name: { ar: 'خطوة الذاكرة', en: 'Arrow Memory' }, emoji: '🧠',
  tagline: 'احفظ ثم كرر', how: 'تظهر سلسلة أسهم على الشاشة — كررها على لوحة الأسهم بالترتيب.',
  formats: ['team', 'ffa'], durationMs: SHOW_MS * SEQ_LEN + GAP_MS * SEQ_LEN + RUN_MS, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
