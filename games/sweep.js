/**
 * Sweep Jump (قفزة الموجة) — a glowing beam sweeps the majlis floor; tap to jump it.
 * Reference: Mario Party Hot Rope Jump / Pummel Party Laser Leap.
 *
 * Judging is server-side and latency-forgiving: a pass is survived when the jump arrived between
 * 400 ms before and 520 ms after it, which covers a phone whose tap reaches the server 150-500 ms
 * after the player saw the beam. The renderer shows the "نجوت" flash so a save is visible, not silent.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 42000;
const SAFE_BEFORE = 400, SAFE_AFTER = 520;
const RING_R = 7.2, INNER_R = 4.4;

function create(room, opts) {
  opts = opts || {};
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = {
    t: 0, angle: 0, prev: 0, speed: 1.0, done: false, over: false,
    parts: [], live: {}, jumpedAt: {}, saveFlash: {}, outAt: {}, survive: {}, slots: {},
    hits: 0, passes: 0, rng: S.mulberry32(opts.seed || 7),
  };
  const n = players.length;
  const outer = n > 26 ? Math.ceil(n * 0.62) : n;
  players.forEach((p, i) => {
    let x, z, radius, ang;
    if (i < outer) { radius = RING_R; ang = (i / outer) * Math.PI * 2 + 0.12; }
    else {
      const k = i - outer, m = Math.max(1, n - outer);
      radius = INNER_R; ang = (k / m) * Math.PI * 2 + Math.PI / m;
    }
    x = Math.cos(ang) * radius; z = Math.sin(ang) * radius;
    st.slots[p.id] = { ang: (ang + Math.PI * 2) % (Math.PI * 2), x, z, radius, i };
    st.live[p.id] = true; st.survive[p.id] = 0;
    st.parts.push(p.id);
  });
  st.over = n === 0;
  return st;
}

function onStart() { /* the ring is built in create() so a mid-game join cannot move anyone */ }

function onInput(room, st, p, msg) {
  if (!st.live[p.id] || st.done) return;
  if (msg.kind === 'tap' || msg.kind === 'jump') st.jumpedAt[p.id] = st.t;
}

const norm = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  st.speed = S.lerp(1.0, 2.35, S.clamp(st.t / DURATION, 0, 1));
  st.prev = st.angle;
  st.angle += (st.speed * dt) / 1000;

  /* everyone still in the ring banks survival time */
  for (const id of st.parts) if (st.live[id]) st.survive[id] += dt;

  /* a player is hit when the beam angle crosses their slot angle this tick */
  const swept = norm(st.angle) - norm(st.prev);
  const span = swept < 0 ? swept + Math.PI * 2 : swept;
  for (const id of st.parts) {
    if (!st.live[id]) continue;
    const slot = st.slots[id];
    const toMe = norm(slot.ang - norm(st.prev));
    if (toMe > 0 && toMe <= span + 1e-9) {
      st.passes++;
      const passT = st.t - ((span - toMe) / Math.max(1e-6, span)) * dt; // exact crossing time
      const j = st.jumpedAt[id];
      const safe = j != null && passT >= j - SAFE_BEFORE && passT <= j + SAFE_AFTER;
      if (safe) {
        st.saveFlash[id] = st.t;
        delete st.jumpedAt[id];                 // one jump saves one pass
      } else {
        st.live[id] = false; st.outAt[id] = st.t; st.hits++;
      }
    }
  }
  /* a jump is spent once it has landed */
  for (const id of Object.keys(st.jumpedAt)) if (st.t - st.jumpedAt[id] > 900) delete st.jumpedAt[id];

  const aliveTeams = new Set(st.parts.filter(id => st.live[id]).map(id => room.players[id] && room.players[id].team));
  if (st.t >= DURATION || (st.t > 6000 && aliveTeams.size <= 1)) st.done = true;
}

const over = (room, st) => !!st.done;

function standings(room, st) {
  const byTeam = {};
  for (const id of st.parts) {
    const p = room.players[id]; if (!p) continue;
    const t = byTeam[p.team] || (byTeam[p.team] = { team: p.team, alive: 0, survive: 0, n: 0 });
    t.n++; if (st.live[id]) t.alive++; t.survive += st.survive[id] || 0;
  }
  for (const id of st.parts) {
    const p = room.players[id]; if (!p) continue;
    const t = byTeam[p.team];
    if (!st.live[id]) t.survive += (st.outAt[id] || 0) > 0 ? 0 : 0;   // survive already stops at the hit
  }
  return Object.values(byTeam).sort((a, b) => b.alive - a.alive || b.survive - a.survive || a.team - b.team);
}

function finish(room, st) {
  const table = standings(room, st);
  const teamPoints = {};
  table.forEach((row, i) => { teamPoints[row.team] = S.placePoints(i); });
  /* every player is paid for the seconds they lasted — a team cannot be carried by four people */
  const playerPoints = {};
  for (const id of st.parts) playerPoints[id] = Math.round((st.survive[id] || 0) / 1000) * 3;
  let best = null;
  for (const id of st.parts) if (!best || (st.survive[id] || 0) > (st.survive[best] || 0)) best = id;
  const crowns = best ? [{ playerId: best, label: 'ملك الصمود', detail: 'آخر من بقي على الأرض' }] : [];
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar} صمد ${win.alive} لاعبين` : 'انتهت الموجة',
    teamPoints, playerPoints, crowns, table,
  };
}

function hostView(room, st) {
  const chars = st.parts.map(id => {
    const p = room.players[id]; const s = st.slots[id] || {};
    return {
      id, team: p ? p.team : 1, x: s.x || 0, z: s.z || 0,
      out: !st.live[id], outAt: st.outAt[id] || 0,
      jump: st.jumpedAt[id] != null ? (st.t - st.jumpedAt[id]) / 1000 : -1,
      save: st.saveFlash[id] != null ? st.t - st.saveFlash[id] : -1,
      survive: Math.round((st.survive[id] || 0) / 100) / 10,
    };
  });
  const alive = st.parts.filter(id => st.live[id]).length;
  return {
    chars, alive, total: st.parts.length,
    game: { id: 'sweep', angle: st.angle, speed: st.speed, passes: st.passes, hits: st.hits, ring: RING_R },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), alive },
  };
}

function padView(room, st, p) {
  const live = !!st.live[p.id];
  const inGame = !!st.slots[p.id];
  const jump = st.jumpedAt[p.id] != null ? Math.max(0, 1 - (st.t - st.jumpedAt[p.id]) / 620) : 0;
  return {
    head: live ? 'اقفز فوق الموجة' : inGame ? 'خرجت — شاهد' : 'الجولة القادمة',
    sub: live ? 'اضغط عند اقتراب الشعاع' : '',
    controls: { type: 'tap', label: 'اقفز', en: 'JUMP', disabled: !live, id: 'jump' },
    stats: [
      { k: 'الحالة', v: live ? 'حيّ' : 'خارج' },
      { k: 'الصمود', v: ((st.survive[p.id] || 0) / 1000).toFixed(1) + 'ث' },
    ],
    meters: live ? [{ label: 'قفزة', pct: Math.round(jump * 100) }] : [],
    feed: live ? 'استعد…' : 'باقي اللاعبين يكملون',
    team: { i: (p.team || 1) - 1 },
    bot: botHint(st, p, live),
  };
}

/* Bot hint: tap a beat before the beam reaches this slot (the crowd's job is the same read). */
function botHint(st, p, live) {
  if (!live || !p.bot) return null;
  const slot = st.slots[p.id]; if (!slot) return null;
  const norm = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const toMe = norm(slot.ang - norm(st.angle));
  const tPass = toMe / Math.max(0.01, st.speed);
  const since = st.jumpedAt[p.id] != null ? st.t - st.jumpedAt[p.id] : 9e9;
  return tPass < 0.46 && tPass > 0.12 && since > 700 ? { kind: 'tap' } : null;
}

module.exports = {
  id: 'sweep', name: { ar: 'قفزة الموجة', en: 'Sweep Jump' }, emoji: '🌊',
  tagline: 'اقفز فوق الشعاع', how: 'شعاع يدور على الأرض — اضغط لتقفز فوقه. يسرع كل ثانية.',
  formats: ['team', 'ffa'], durationMs: DURATION, create, onStart, onInput, tick, over, finish, hostView, padView, standings,
};
