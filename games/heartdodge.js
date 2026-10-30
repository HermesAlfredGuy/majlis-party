/**
 * Heart Dodge (قلوب في مهبّ) — the room's bullet-hell. Hearts move with the joystick inside a boxed arena
 * while bones slide, feathers fall and beans bounce across it. Every wave is telegraphed on the wall for a
 * full second before anything moves, so a slow link costs a reaction, not a life.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 46000, W = 16, H = 9, HR = 0.42;
const FONT = ['bones', 'feathers', 'beans'];
const WAVE_MS = 3400, TELEGRAPH = 900;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 31);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = {
    t: 0, done: false, rng, wave: 0, waveT: 0, tele: 0, phase: 'calm', projectiles: [], parts: [], live: {},
    players: {}, pattern: 'bones', intensity: 1, hitFlash: {},
  };
  players.forEach((p, i) => {
    const col = p.team;
    st.parts.push(p.id); st.live[p.id] = true;
    st.players[p.id] = { id: p.id, team: p.team, x: -W / 2 + 2 + (i % 12) * 1.1, y: 1.2 + Math.floor(i / 12) * 1.0, dx: 0, dy: 0, r: HR };
  });
  /* keep everyone inside the box */
  for (const id of st.parts) { const q = st.players[id]; q.x = S.clamp(q.x, -W / 2 + 0.8, W / 2 - 0.8); q.y = S.clamp(q.y, 0.9, H - 0.9); }
  return st;
}

function onInput(room, st, p, msg) {
  const q = st.players[p.id]; if (!q || !st.live[p.id] || st.done) return;
  if (msg.kind === 'move' || msg.kind === 'stick') {
    let dx = Number(msg.dx), dy = Number(msg.dy != null ? msg.dy : msg.dz);
    if (!isFinite(dx) || !isFinite(dy)) { dx = 0; dy = 0; }
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    q.dx = dx * 5.6; q.dy = -dy * 5.6;
  }
}

function spawnWave(st) {
  st.wave++;
  st.pattern = FONT[(st.wave - 1) % FONT.length];
  st.intensity = 1 + Math.floor(st.wave / 3) * 0.35;
  const rng = st.rng;
  const side = Math.floor(rng() * 4);                 // 0 top, 1 right, 2 bottom, 3 left
  const speed = (2.6 + rng() * 1.4) * Math.min(1.8, st.intensity);
  if (st.pattern === 'bones') {
    const n = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const lane = -H / 2 + 1 + rng() * (H - 2);
      const vertical = side % 2 === 0;
      st.projectiles.push(vertical
        ? { k: 'bone', x: -W / 2 - 1, y: lane, vx: speed, vy: 0, w: 2.2, h: 0.35, spin: rng() * 6 }
        : { k: 'bone', x: lane, y: -H / 2 - 1, vx: 0, vy: speed, w: 0.35, h: 2.2, spin: rng() * 6 });
    }
  } else if (st.pattern === 'feathers') {
    for (let i = 0; i < 7; i++) {
      st.projectiles.push({ k: 'feather', x: -W / 2 + 1 + rng() * (W - 2), y: H / 2 + 1 + rng() * 2, vx: (rng() - 0.5) * 1.2, vy: -speed * 0.75, w: 0.7, h: 0.7, spin: rng() * 6, sway: rng() * 6 });
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const fromLeft = i % 2 === 0;
      st.projectiles.push({ k: 'bean', x: fromLeft ? -W / 2 - 1 : W / 2 + 1, y: 1 + rng() * (H - 2), vx: (fromLeft ? 1 : -1) * speed * 1.15, vy: (rng() - 0.5) * 1.4, w: 0.9, h: 0.9, spin: rng() * 6, bounce: 0.9 });
    }
  }
  st.phase = 'telegraph'; st.tele = TELEGRAPH;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  const s = dt / 1000;
  st.waveT += dt;
  if (st.phase === 'telegraph') {
    st.tele -= dt;
    if (st.tele <= 0) st.phase = 'live';
  } else {
    if (st.waveT >= WAVE_MS) { st.waveT = 0; spawnWave(st); }
  }
  /* movement + walls */
  for (const id of st.parts) {
    const q = st.players[id]; if (!st.live[id]) continue;
    q.x = S.clamp(q.x + q.dx * s, -W / 2 + q.r, W / 2 - q.r);
    q.y = S.clamp(q.y + q.dy * s, q.r, H - q.r);
  }
  /* projectiles */
  const alive = [];
  for (const o of st.projectiles) {
    o.x += o.vx * s; o.y += o.vy * s; o.spin += dt / 120;
    if (o.k === 'feather') o.x += Math.sin(o.sway + st.t / 500) * s * 0.8;
    if (o.k === 'bean') {
      o.vy -= 3.4 * s;
      if (o.y < 0.6) { o.y = 0.6; o.vy = Math.abs(o.vy) * (o.bounce || 0.9); }
    }
    if (st.phase === 'live') {
      for (const id of st.parts) {
        if (!st.live[id]) continue;
        const q = st.players[id];
        const hit = Math.abs(o.x - q.x) < (o.w / 2 + q.r * 0.8) && Math.abs(o.y - q.y) < (o.h / 2 + q.r * 0.8);
        if (hit) { st.live[id] = false; st.players[id].outAt = st.t; st.hitFlash[id] = 1; }
      }
    }
    if (o.x > -W / 2 - 4 && o.x < W / 2 + 4 && o.y > -3 && o.y < H + 4) alive.push(o);
  }
  st.projectiles = alive.slice(-60);
  for (const id of Object.keys(st.hitFlash)) st.hitFlash[id] = Math.max(0, st.hitFlash[id] - dt / 600);
  const liveN = st.parts.filter(id => st.live[id]).length;
  if (st.t >= DURATION || liveN <= 1) st.done = true;
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const byTeam = {};
  for (const id of st.parts) {
    const p = room.players[id]; if (!p) continue;
    const t = byTeam[p.team] || (byTeam[p.team] = { team: p.team, alive: 0, survive: 0, n: 0 });
    t.n++; if (st.live[id]) t.alive++;
    t.survive += st.live[id] ? DURATION : (st.players[id].outAt || 0);
  }
  const table = Object.values(byTeam).sort((a, b) => b.alive - a.alive || b.survive - a.survive || a.team - b.team);
  const teamPoints = {}; table.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const id of st.parts) playerPoints[id] = 8 + Math.round((st.live[id] ? DURATION : (st.players[id].outAt || 0)) / 1000) * 3;
  let best = null;
  for (const id of st.parts) { if (!best) { best = id; continue; } const a = st.live[id] ? 1e9 : st.players[id].outAt, b = st.live[best] ? 1e9 : st.players[best].outAt; if (a > b) best = id; }
  const crowns = best ? [{ playerId: best, label: 'قلب حديدي', detail: 'نجا من كل الموجات' }] : [];
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${win.alive} قلوب` : 'انتهت الموجة',
    teamPoints, playerPoints, crowns, table,
  };
}

function hostView(room, st) {
  const chars = st.parts.map(id => {
    const q = st.players[id];
    return { id, team: q.team, x: q.x, z: H / 2 - q.y, out: !st.live[id], jump: -1, flash: st.hitFlash[id] > 0 };
  });
  return {
    chars,
    game: {
      id: 'heartdodge', phase: st.phase, pattern: st.pattern, wave: st.wave, tele: st.tele, waveMs: WAVE_MS,
      projectiles: st.projectiles.map(o => ({ k: o.k, x: Math.round(o.x * 100) / 100, y: Math.round(o.y * 100) / 100, vx: o.vx, vy: o.vy, w: o.w, h: o.h })),
      box: { w: W, h: H }, alive: st.parts.filter(id => st.live[id]).length, total: st.parts.length,
    },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), alive: st.parts.filter(id => st.live[id]).length },
  };
}

function padView(room, st, p) {
  const q = st.players[p.id];
  if (!q) return { head: 'الجولة القادمة', controls: { type: 'none' }, stats: [], team: { i: (p.team || 1) - 1 } };
  const live = st.live[p.id];
  let hint = null;
  if (p.bot && live) {
    /* dodge the nearest projectile: push away from it, stay off the walls */
    let bx = 0, by = 0, bd = 1e9;
    for (const o of st.projectiles) {
      const d = Math.hypot(o.x - q.x, o.y - q.y);
      if (d < bd) { bd = d; bx = o.x; by = o.y; }
    }
    let dx = 0, dy = 0;
    if (bd < 3.4) { dx = q.x - bx; dy = q.y - by; }
    else { dx = -q.x * 0.05; dy = H / 2 - q.y; }
    const m = Math.hypot(dx, dy) || 1;
    hint = { kind: 'move', dx: dx / m, dz: dy / m };
  }
  return {
    head: !live ? 'انفجر قلبك' : st.phase === 'telegraph' ? '⚠️ الموجة قادمة' : 'تحرّك!',
    sub: !live ? 'شاهد بقية اللاعبين' : 'اسحب للحركة داخل الصندوق',
    controls: { type: 'stick', disabled: !live || st.done, dash: false },
    stats: [{ k: 'الموجة', v: S.ar(st.wave) }, { k: 'الحالة', v: live ? 'حيّ' : 'خارج' }],
    meters: [], feed: '',
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'heartdodge', name: { ar: 'قلوب في مهبّ', en: 'Heart Dodge' }, emoji: '💗',
  tagline: 'تجنّب العظام والريش', how: 'حرّك قلبك بالعصا. كل موجة تُعلن قبل ثانية — عظام تنزلق، ريش يتساقط، فاصولياء تتنطط.',
  formats: ['ffa', 'team', 'spotlight'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
