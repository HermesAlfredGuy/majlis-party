/**
 * Lava Tanks (دبابات الحمم) — 1v1 SPOTLIGHT. Turn-based artillery over a lava pit: set the angle, hold to
 * charge, release to fire. Nobody is racing anybody's thumb, so a 400 ms link plays exactly like a 20 ms one.
 * A hit knocks the enemy tank one step toward the edge; three hits and it drops in.
 */
'use strict';
const S = require('../lib/sim');

const GRAV = 18, SPEED = 15, TURN_MS = 14000, CHARGE_MS = 1400, EDGE = 11, MATCH_MS = 78000;

function create(room, opts) {
  const ps = S.participants(room);
  const st = {
    t: 0, done: false, turn: 0, phase: 'aim', phaseT: 0, proj: null, tanks: [], wind: 0,
    rng: S.mulberry32(opts && opts.seed ? opts.seed : 5), lastEvent: null, shots: 0,
  };
  if (ps.length === 0) { st.done = true; st.stalemate = true; }
  ps.slice(0, 2).forEach((p, i) => {
    st.tanks.push({
      id: p.id, team: p.team, x: (i === 0 ? -1 : 1) * 8.5, hp: 3, angle: 45, power: 0, charging: false,
      facing: i === 0 ? 1 : -1, alive: true, chargeAt: 0, dmgFlash: 0,
    });
  });
  st.wind = Math.round((st.rng() * 4 - 2) * 10) / 10;
  return st;
}

const me = (st, p) => st.tanks.find(t => t.id === p.id);
const current = (st) => st.tanks[st.turn];

function onInput(room, st, p, msg) {
  const T = me(st, p); if (!T || st.done || !T.alive) return;
  const cur = current(st); if (!cur || cur.id !== p.id || st.phase !== 'aim') return;
  if (msg.kind === 'aim') {
    const a = Number(msg.angle);
    if (isFinite(a)) T.angle = Math.max(12, Math.min(82, a));
  } else if (msg.kind === 'hold') {
    if (msg.on) { T.charging = true; T.chargeAt = st.t; }
    else if (T.charging) { fire(st, T); }
  } else if (msg.kind === 'tap') {
    /* single-tap fallback: fire at half charge */
    T.power = 0.55; fire(st, T);
  }
}

function fire(st, T) {
  const power = Math.max(0.12, Math.min(1, (st.t - T.chargeAt) / CHARGE_MS));
  T.charging = false; T.power = power;
  const rad = (T.angle * Math.PI) / 180;
  st.proj = { x: T.x + T.facing * 1.1, y: 1.4, vx: Math.cos(rad) * power * SPEED * 1.5 * T.facing, vy: Math.sin(rad) * power * SPEED * 1.5, owner: T.id, life: 0 };
  st.phase = 'flight'; st.phaseT = 0; st.shots++;
}

function tick(room, st, dt) {
  if (st.done) return;
  if (!st.tanks.length) { st.done = true; st.stalemate = true; return; }
  const s = dt / 1000;
  st.t += dt; st.phaseT += dt;
  for (const T of st.tanks) if (T.dmgFlash > 0) T.dmgFlash = Math.max(0, T.dmgFlash - dt);
  if (st.t >= MATCH_MS && !st.done) {
    /* a stalemate is decided on hearts, never on nothing */
    st.done = true;
    const alive = st.tanks.slice().sort((a, b) => b.hp - a.hp || Math.abs(a.x) - Math.abs(b.x));
    st.winner = alive[0].id;
    st.lastEvent = 'timeout';
  }
  if (st.phase === 'aim') {
    if (st.phaseT > TURN_MS) { st.phase = 'flight'; st.phaseT = 0; st.proj = null; st.lastEvent = 'timeout'; }
  } else if (st.phase === 'flight') {
    if (st.proj) {
      const pr = st.proj;
      pr.vy -= GRAV * s; pr.vx += st.wind * 0.35 * s;
      pr.x += pr.vx * s; pr.y += pr.vy * s; pr.life += dt;
      const enemy = st.tanks.find(t => t.id !== pr.owner && t.alive);
      if (enemy && Math.abs(pr.x - enemy.x) < 1.15 && pr.y < 2.2 && pr.y > 0) {
        enemy.hp--; enemy.dmgFlash = 600;
        enemy.x += (pr.x < enemy.x ? 1 : -1) * -0.9;    // knocked toward the pit
        st.lastEvent = 'hit';
        st.proj = null; st.phase = 'resolve'; st.phaseT = 0;
        if (enemy.hp <= 0 || Math.abs(enemy.x) > EDGE) { enemy.alive = false; enemy.hp = 0; st.done = true; st.winner = pr.owner; }
      } else if (pr.y <= 0.05 || pr.x < -30 || pr.x > 30 || pr.life > 6000) {
        st.lastEvent = 'miss'; st.proj = null; st.phase = 'resolve'; st.phaseT = 0;
      }
    } else { st.phase = 'resolve'; st.phaseT = 0; }
  } else if (st.phase === 'resolve') {
    if (st.phaseT >= 1300) {
      st.turn = (st.turn + 1) % Math.max(1, st.tanks.length);
      st.wind = Math.round((st.rng() * 4 - 2) * 10) / 10;
      st.phase = 'aim'; st.phaseT = 0; st.lastEvent = null;
      const T = current(st);
      if (T) { T.angle = 45; T.power = 0; }
    }
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const winner = st.winner ? st.tanks.find(t => t.id === st.winner) || st.tanks[0] : st.tanks[0];
  if (!st.tanks.length) return { winnerTeam: null, summary: 'لم يصل أحد', teamPoints: {}, playerPoints: {}, crowns: [], table: [] };
  const ordered = st.tanks.slice().sort((a, b) => (b.alive - a.alive) || (b.hp - a.hp));
  const teamPoints = {};
  ordered.forEach((T, i) => { teamPoints[T.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const T of st.tanks) playerPoints[T.id] = 30 + T.hp * 15;
  const win = ordered[0];
  const crowns = win ? [{ playerId: win.id, label: 'قنّاص الحمم', detail: 'فاز بدبابته' }] : [];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar} — ${room.players[win.id] ? room.players[win.id].nick : ''}` : 'تعادل',
    teamPoints, playerPoints, crowns,
    table: ordered.map(T => ({ team: T.team, alive: T.alive ? 1 : 0, hp: T.hp, value: T.hp })),
  };
}

function hostView(room, st) {
  return {
    chars: [],
    game: {
      id: 'lavatanks', phase: st.phase, turn: st.tanks[st.turn] ? st.tanks[st.turn].team : null,
      tanks: st.tanks.map(T => ({ team: T.team, x: Math.round(T.x * 100) / 100, hp: T.hp, angle: T.angle, power: Math.round(T.power * 100) / 100, charging: T.charging, alive: T.alive, flash: T.dmgFlash > 0, id: T.id })),
      proj: st.proj ? { x: Math.round(st.proj.x * 100) / 100, y: Math.round(st.proj.y * 100) / 100 } : null,
      wind: st.wind, edge: EDGE,
      names: st.tanks.map(T => ({ id: T.id, nick: room.players[T.id] ? room.players[T.id].nick : '' })),
      event: st.lastEvent,
    },
    hud: { left: null, alive: st.tanks.filter(t => t.alive).length },
  };
}

function padView(room, st, p) {
  const T = me(st, p);
  if (!T) return { head: 'شاهد', controls: { type: 'none' }, stats: [], team: { i: (p.team || 1) - 1 } };
  const yourTurn = st.tanks[st.turn] && st.tanks[st.turn].id === p.id;
  const enemy = st.tanks.find(t => t.id !== p.id);
  const charge = T.charging ? Math.min(1, (st.t - T.chargeAt) / CHARGE_MS) : 0;
  let bot = null;
  if (p.bot && yourTurn && st.phase === 'aim') {
    const target = enemy;
    const dx = Math.abs((target ? target.x : 0) - T.x);
    const angle = 40 + st.rng() * 14;
    /* invert the projectile range so the bot is aiming, not guessing */
    const rad = angle * Math.PI / 180;
    const pNeed = Math.sqrt(Math.max(0.02, dx * GRAV / Math.max(0.15, Math.sin(2 * rad)))) / (SPEED * 1.5);
    const best = Math.max(0.2, Math.min(1, pNeed * (0.93 + st.rng() * 0.14)));
    bot = { kind: 'aim', angle };
    if (charge < best - 0.05) bot.hold = true; else bot.fire = true;
  }
  return {
    head: !T.alive ? 'سقطت الدبابة' : yourTurn ? 'دورك — صوّب واشحن' : 'دور الخصم',
    sub: yourTurn ? 'اسحب الزاوية، اضغط باستمرار للشحن، اترك للإطلاق' : '',
    controls: { type: 'aim', disabled: !yourTurn || !T.alive, angle: Math.round(T.angle), charging: T.charging, charge: Math.round(charge * 100) },
    stats: [{ k: 'قلبك', v: '❤'.repeat(Math.max(0, T.hp)) || '—' }, { k: 'الخصم', v: enemy ? '❤'.repeat(Math.max(0, enemy.hp)) || '—' : '—' }],
    meters: T.charging ? [{ label: 'الشحن', pct: Math.round(charge * 100) }] : [],
    feed: st.lastEvent === 'hit' ? '💥 إصابة!' : st.lastEvent === 'miss' ? 'أخطأت' : '',
    team: { i: (p.team || 1) - 1 },
    bot,
  };
}

module.exports = {
  id: 'lavatanks', name: { ar: 'دبابات الحمم', en: 'Lava Tanks' }, emoji: '💥',
  tagline: 'دبابة… زاوية… إطلاق', how: 'دور بدور: وجّه الزاوية، اضغط باستمرار للشحن، واترك لتطلق. ثلاث إصابات تُسقط الخصم.',
  formats: ['spotlight', 'team'], durationMs: 90000, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
