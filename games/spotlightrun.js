/**
 * Spotlight Run (تحت الأضواء) — FREE-FOR-ALL. Three spotlights hunt the room across the majlis floor; standing in
 * one costs a heart, standing in the dark slowly gives it back. The lights chase the nearest player, so the safest
 * place is beside somebody else — which is exactly the argument the game wants to start.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 42000, W = 15, H = 9, SPOTS = 3, RADIUS = 1.45, HURT_MS = 1150, HEAL_MS = 2200, GRACE_MS = 1600, MAXHP = 3;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 61);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng, parts: [], players: {}, spots: [], rngT: 0, hits: 0 };
  players.forEach((p, i) => {
    st.parts.push(p.id);
    st.players[p.id] = { id: p.id, team: p.team, x: -W / 2 + 1.4 + (i % 10) * 1.35, z: -H / 2 + 1.2 + Math.floor(i / 10) * 1.5, dx: 0, dz: 0, hp: MAXHP, hitT: 0, healT: 0, out: false, exposure: 0 };
  });
  for (let i = 0; i < SPOTS; i++) st.spots.push({ x: (rng() - 0.5) * W * 0.8, z: (rng() - 0.5) * H * 0.7, vx: 0, vz: 0, heat: 0, cool: 0 });
  return st;
}

function onInput(room, st, p, msg) {
  const q = st.players[p.id]; if (!q || q.out || st.done) return;
  if (msg.kind !== 'move' && msg.kind !== 'stick') return;
  let dx = Number(msg.dx), dz = Number(msg.dz != null ? msg.dz : msg.dy);
  if (!isFinite(dx) || !isFinite(dz)) { dx = 0; dz = 0; }
  const m = Math.hypot(dx, dz); if (m > 1) { dx /= m; dz /= m; }
  q.dx = dx * 5.4; q.dz = dz * 5.4;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  const s = dt / 1000;
  for (const id of st.parts) {
    const q = st.players[id]; if (q.out) continue;
    q.x = S.clamp(q.x + q.dx * s, -W / 2 + 0.6, W / 2 - 0.6);
    q.z = S.clamp(q.z + q.dz * s, -H / 2 + 0.6, H / 2 - 0.6);
    if (q.hitT > 0) q.hitT = Math.max(0, q.hitT - dt);
  }
  /* the lights hunt the nearest live player, then drift */
  for (const sp of st.spots) {
    let best = null, bd = 1e9;
    for (const id of st.parts) {
      const q = st.players[id]; if (q.out) continue;
      const d = Math.hypot(q.x - sp.x, q.z - sp.z);
      if (d < bd) { bd = d; best = q; }
    }
    let tx = 0, tz = 0;
    if (best) { tx = best.x; tz = best.z; }
    const dx = tx - sp.x, dz = tz - sp.z, m = Math.hypot(dx, dz) || 1;
    if (sp.cool > 0) sp.cool = Math.max(0, sp.cool - dt);
    /* a light that just burned someone dims and drifts — the room gets a breath, not a meat grinder */
    const speed = (2.6 + (st.t / DURATION) * 1.3) * (sp.cool > 0 ? 0.6 : 1);
    sp.vx += ((dx / m) * speed - sp.vx) * Math.min(1, s * 2.2);
    sp.vz += ((dz / m) * speed - sp.vz) * Math.min(1, s * 2.2);
    sp.x = S.clamp(sp.x + sp.vx * s, -W / 2 + 0.8, W / 2 - 0.8);
    sp.z = S.clamp(sp.z + sp.vz * s, -H / 2 + 0.8, H / 2 - 0.8);
    sp.heat = sp.cool > 0 ? 0.12 : 0.5 + Math.sin(st.t / 240) * 0.5;
  }
  /* damage / recovery */
  for (const id of st.parts) {
    const q = st.players[id]; if (q.out) continue;
    let lit = false;
    for (const sp of st.spots) if (Math.hypot(q.x - sp.x, q.z - sp.z) < RADIUS) { lit = true; break; }
    if (lit) q.exposure += dt;
    if (lit && st.t > GRACE_MS) { q.hurtT = (q.hurtT || 0) + dt; q.healT = 0; if (q.hurtT > HURT_MS) { q.hp--; q.hurtT = 0; q.hitT = 700; st.hits++; for (const sp of st.spots) if (Math.hypot(q.x - sp.x, q.z - sp.z) < RADIUS) sp.cool = 1300; if (q.hp <= 0) { q.out = true; q.outAt = st.t; } } }
    else { q.hurtT = 0; q.healT += dt; if (q.healT > HEAL_MS && q.hp < MAXHP) { q.hp++; q.healT = 0; } }
  }
  if (st.t >= DURATION) st.done = true;
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const rank = st.parts.slice().sort((a, b) => {
    const A = st.players[a], B = st.players[b];
    return (B.hp - A.hp) || (A.exposure - B.exposure) || a.localeCompare(b);
  });
  const byTeam = {};
  rank.forEach((id, i) => {
    const p = room.players[id]; if (!p) return;
    const T = byTeam[p.team] || (byTeam[p.team] = { team: p.team, score: 0, best: 1e9, n: 0 });
    T.n++; T.score += rank.length - i; T.best = Math.min(T.best, i);
  });
  const table = Object.values(byTeam).sort((a, b) => b.score - a.score || a.best - b.best);
  const teamPoints = {}; table.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {}; rank.forEach((id, i) => { playerPoints[id] = 4 + st.players[id].hp * 9 + (rank.length - i); });
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${win.n} تحت الضوء` : 'انطفأت الأضواء',
    teamPoints, playerPoints,
    crowns: rank[0] ? [{ playerId: rank[0], label: 'ظلّ المجلس', detail: `${st.players[rank[0]].hp} قلوب · ${(st.players[rank[0]].exposure / 1000).toFixed(1)}ث في الضوء` }] : [],
    table: table.map(r => ({ team: r.team, value: r.score })),
  };
}

function hostView(room, st) {
  const chars = st.parts.map(id => {
    const q = st.players[id];
    return { id, team: q.team, x: q.x, z: q.z, out: q.out, jump: q.hitT > 0 ? 0.7 : -1, flash: q.hitT > 0 };
  });
  return {
    chars,
    game: {
      id: 'spotlightrun', spots: st.spots.map(s2 => ({ x: Math.round(s2.x * 100) / 100, z: Math.round(s2.z * 100) / 100, heat: Math.round(s2.heat * 100) / 100, r: RADIUS })),
      alive: st.parts.filter(id => !st.players[id].out).length, total: st.parts.length, hits: st.hits,
      box: { w: W, h: H }, phase: 'hunt',
    },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), alive: st.parts.filter(id => !st.players[id].out).length },
  };
}

function padView(room, st, p) {
  const q = st.players[p.id];
  if (!q) return { head: 'الجولة القادمة', controls: { type: 'none' }, stats: [], team: { i: (p.team || 1) - 1 } };
  let hint = null;
  if (p.bot && !q.out) {
    /* run from the closest light, and keep moving: a stationary bot is a target */
    let near = null, nd = 1e9;
    for (const sp of st.spots) { const d = Math.hypot(sp.x - q.x, sp.z - q.z); if (d < nd) { nd = d; near = sp; } }
    let dx = q.x - (near ? near.x : 0), dz = q.z - (near ? near.z : 0);
    if (nd > RADIUS * 1.5) { dx = Math.sin(st.t / 700 + q.x); dz = Math.cos(st.t / 900 + q.z); }
    /* steer around the walls instead of into them */
    if (q.x > W / 2 - 1.6) dx = -Math.abs(dx);
    if (q.x < -W / 2 + 1.6) dx = Math.abs(dx);
    if (q.z > H / 2 - 1.6) dz = -Math.abs(dz);
    if (q.z < -H / 2 + 1.6) dz = Math.abs(dz);
    const m = Math.hypot(dx, dz) || 1;
    hint = { kind: 'move', dx: dx / m, dz: dz / m };
  }
  return {
    head: q.out ? 'خرجت من الضوء' : q.hitT > 0 ? 'احترقت!' : 'اهرب من الأضواء',
    sub: q.out ? 'شاهد بقية اللاعبين' : 'تحرّك في الظل — الضوء يستهلك قلباً',
    controls: { type: 'stick', disabled: q.out || st.done, dash: false },
    stats: [{ k: 'قلوبك', v: '❤'.repeat(Math.max(0, q.hp)) || '—' }, { k: 'حيّ', v: S.ar(st.parts.filter(id => !st.players[id].out).length) }],
    meters: [], feed: q.out ? '' : (q.hp === 1 ? '⚠️ قلب واحد' : ''),
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'spotlightrun', name: { ar: 'تحت الأضواء', en: 'Spotlight Run' }, emoji: '🔦',
  tagline: 'ابقَ في الظل', how: 'ثلاثة أضواء تطاردكم على أرضية المجلس. الضوء يأخذ قلباً كل نصف ثانية، والظل يعيده ببطء.',
  formats: ['ffa', 'team'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
