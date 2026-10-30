/**
 * Sand Sumo (سومو الرمل) — everyone on a round platform over a dune drop; push and dash to be the last
 * one standing. Reference: Snowy Spin / Bumper Balls / Pushy Penguins.
 *
 * Forgiving shared-arena physics is exactly what a 150-500 ms link survives: you steer a direction,
 * you dash, the bumps are the fun. The server integrates it at 50 ms and broadcasts at 15 Hz.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 45000, R = 8.2, SPEED = 3.6, BODY = 0.62, DASH_CD = 1700, PUSH = 2.6;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 23);
  const parts = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt).map(p => p.id);
  const st = { t: 0, done: false, over: false, parts, P: {}, spin: 0, dashes: 0, falls: 0 };
  parts.forEach((id, i) => {
    const a = (i / Math.max(1, parts.length)) * Math.PI * 2 + 0.3;
    const r = 2.2 + rng() * 3.4;
    st.P[id] = { x: Math.cos(a) * r, z: Math.sin(a) * r, vx: 0, vz: 0, dx: 0, dz: 0, dashAt: -9e9, out: false, outAt: 0, fall: 0 };
  });
  return st;
}

function onInput(room, st, p, msg) {
  const q = st.P[p.id]; if (!q || q.out || st.done) return;
  if (msg.kind === 'move' || msg.kind === 'stick') {
    let dx = Number(msg.dx), dz = Number(msg.dz);
    if (!isFinite(dx) || !isFinite(dz)) {
      const dir = String(msg.dir || '');
      dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
      dz = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    }
    const m = Math.hypot(dx, dz) || 1;
    q.dx = dx / m; q.dz = dz / m;
  } else if (msg.kind === 'dash' || msg.kind === 'tap') {
    if (st.t - q.dashAt < DASH_CD) return;
    const m = Math.hypot(q.dx, q.dz);
    const ax = m > 0.1 ? q.dx / m : 0, az = m > 0.1 ? q.dz / m : 1;
    q.vx += ax * 7.4; q.vz += az * 7.4; q.dashAt = st.t; st.dashes++;
  }
}

function tick(room, st, dt) {
  if (st.done) return;
  const s = dt / 1000;
  st.t += dt; st.spin += dt / 1000 * 0.16;
  const ids = st.parts.filter(id => !st.P[id].out);
  for (const id of ids) {
    const q = st.P[id];
    const wantX = q.dx * SPEED, wantZ = q.dz * SPEED;
    const k = S.clamp(dt / 190, 0, 1);
    q.vx += (wantX - q.vx) * k; q.vz += (wantZ - q.vz) * k;
    /* the deck is polished — a slow bleed, not a stop, so a dash still carries */
    const fr = Math.exp(-1.35 * s);
    q.vx *= fr; q.vz *= fr;
    q.x += q.vx * s; q.z += q.vz * s;
  }
  /* bump: separate overlapping bodies and trade momentum along the normal */
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = st.P[ids[i]], b = st.P[ids[j]];
      let nx = b.x - a.x, nz = b.z - a.z;
      let d = Math.hypot(nx, nz);
      if (d > BODY * 2 || d === 0) continue;
      nx /= d; nz /= d;
      const overlap = BODY * 2 - d;
      a.x -= nx * overlap * 0.5; a.z -= nz * overlap * 0.5;
      b.x += nx * overlap * 0.5; b.z += nz * overlap * 0.5;
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) {
        const boost = (st.t - a.dashAt < 420 ? 1.9 : 1) * (st.t - b.dashAt < 420 ? 0.55 : 1);
        const imp = -rel * PUSH * boost;
        a.vx -= nx * imp; a.vz -= nz * imp;
        b.vx += nx * imp; b.vz += nz * imp;
      }
    }
  }
  /* off the edge */
  for (const id of st.parts) {
    const q = st.P[id]; if (q.out) continue;
    if (Math.hypot(q.x, q.z) > R + 0.15) { q.out = true; q.outAt = st.t; st.falls++; }
  }
  const aliveTeams = new Set(st.parts.filter(id => !st.P[id].out).map(id => room.players[id] && room.players[id].team));
  const aliveN = st.parts.filter(id => !st.P[id].out).length;
  if (st.t >= DURATION || (st.t > 5000 && (aliveTeams.size <= 1 || aliveN <= 1))) st.done = true;
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const byTeam = {};
  for (const id of st.parts) {
    const p = room.players[id]; if (!p) continue;
    const q = st.P[id];
    const t = byTeam[p.team] || (byTeam[p.team] = { team: p.team, alive: 0, last: 0, n: 0 });
    t.n++; if (!q.out) { t.alive++; t.last = Math.max(t.last, DURATION); } else t.last = Math.max(t.last, q.outAt || 0);
  }
  const table = Object.values(byTeam).sort((a, b) => b.alive - a.alive || b.last - a.last || a.team - b.team);
  const teamPoints = {}; table.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const id of st.parts) {
    const q = st.P[id];
    playerPoints[id] = q.out ? 6 + Math.round((q.outAt || 0) / 1000) * 3 : 55;
  }
  let best = null;
  for (const id of st.parts) {
    const q = st.P[id];
    if (!best) { best = id; continue; }
    const bq = st.P[best];
    const av = q.out ? (q.outAt || 0) : 1e9, bv = bq.out ? (bq.outAt || 0) : 1e9;
    if (av > bv) best = id;
  }
  const crowns = best ? [{ playerId: best, label: 'بطل السومو', detail: 'آخر من بقي على المنصة' }] : [];
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar} بقي ${win.alive} لاعبين` : 'انتهى السومو',
    teamPoints, playerPoints, crowns, table,
  };
}

function hostView(room, st) {
  const chars = st.parts.map(id => {
    const p = room.players[id]; const q = st.P[id];
    return {
      id, team: p ? p.team : 1, x: q.x, z: q.z, out: q.out, outAt: q.outAt || 0,
      vx: q.vx, vz: q.vz, dash: st.t - q.dashAt < 420,
    };
  });
  return {
    chars,
    game: { id: 'sumo', platformR: R, spin: st.spin, alive: chars.filter(c => !c.out).length, total: chars.length },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), alive: chars.filter(c => !c.out).length },
  };
}

function padView(room, st, p) {
  const q = st.P[p.id];
  if (!q) return { head: 'الجولة القادمة', controls: { type: 'none' }, watching: true, stats: [], team: { i: (p.team || 1) - 1 } };
  const cd = Math.max(0, 1 - (st.t - q.dashAt) / DASH_CD);
  let hint = null;
  if (p.bot && !q.out && !st.done) {
    const r = Math.hypot(q.x, q.z);
    let tx = 0, tz = 0;
    if (r > R * 0.55) { tx = -q.x; tz = -q.z; }
    else {
      let bd = 1e9, best = null;
      for (const id of st.parts) {
        if (id === p.id) continue;
        const o = st.P[id]; if (o.out) continue;
        const op = room.players[id]; if (!op || op.team === p.team) continue;
        const d = Math.hypot(o.x - q.x, o.z - q.z);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) { tx = best.x - q.x; tz = best.z - q.z; }
    }
    const m = Math.hypot(tx, tz) || 1;
    hint = { kind: 'move', dx: tx / m, dz: tz / m };
    if (cd <= 0.05) hint = { kind: 'dash' };
  }
  return {
    head: q.out ? 'سقطت — شاهد' : 'ادفع وأطاح',
    sub: q.out ? 'انتظر الجولة القادمة' : 'حرّك العصا واندفع',
    controls: { type: 'stick', disabled: q.out || st.done, dash: cd <= 0.02, dashPct: Math.round(cd * 100) },
    stats: [{ k: 'الحالة', v: q.out ? 'خارج' : 'على المنصة' }, { k: 'المتبقّون', v: S.ar(st.parts.filter(id => !st.P[id].out).length) }],
    meters: [],
    feed: '',
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'sumo', name: { ar: 'سومو الرمل', en: 'Sand Sumo' }, emoji: '🤼',
  tagline: 'ابقَ على المنصة', how: 'حرّك الشخصية بالعصا واندفع بالزر — أطِح بالخصوم خارج المنصة.',
  formats: ['team', 'ffa', 'spotlight'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
