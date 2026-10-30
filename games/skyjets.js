/**
 * Sky Jets (طيور السماء) — the fastest minigame on the floor. Two team jets fly past a skyline of towers; each
 * team steers its jet by VOTE. Votes are sampled every 120 ms and weighted by freshness, so the last tap
 * before the sample is worth more than one that arrived half a second ago — a 150-500 ms link still has a
 * real say. The live vote split is on screen so a team can see why its jet moved.
 *
 * This game asks the host loop for 20 Hz views (see `viewHz`), twice the party default.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 40000, SPEED = 26, VOTE_MS = 120, FRESH_MS = 320;
const XR = 7.2, YMIN = 1.15, YMAX = 6.4, HIT = 0.62;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 66);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = {
    t: 0, done: false, jets: {}, parts: players.map(p => p.id), towers: [], nextTower: 30,
    dist: 0, votes: {}, sampleT: 0, rng, votes: {}, mult: 1, bolts: [],
  };
  const teams = [...new Set(players.map(p => p.team))].sort();
  teams.forEach((team, i) => {
    st.jets[team] = {
      team, x: -4 + i * (8 / Math.max(1, teams.length - 1)), y: 3.2, alive: true, outAt: 0,
      dir: null, split: { left: 0, right: 0, up: 0, down: 0 }, tint: team, dist: 0, voters: 0,
    };
    st.votes[team] = [];
  });
  spawn(st, rng);
  return st;
}

function spawn(st, rng) {
  const w = 2.0 + rng() * 2.2;
  const cx = -XR + 1 + rng() * (XR * 2 - 2);
  const h = 2.2 + rng() * 3.6;
  st.towers.push({ z: st.dist + 74, x: cx, w, h, seed: rng() });
  if (rng() < 0.45) {
    const s = rng() < 0.5 ? -1 : 1;
    const cx2 = S.clamp(cx + s * (w + 4.2), -XR + 1, XR - 1);
    st.towers.push({ z: st.dist + 74 + 9, x: cx2, w: 1.4 + rng() * 1.4, h: 1.6 + rng() * 2.4, seed: rng() });
  }
}

function onInput(room, st, p, msg) {
  const jet = st.jets[p.team]; if (!jet || !jet.alive || st.done) return;
  const dir = String(msg.dir || msg.kind || '');
  if (!['left', 'right', 'up', 'down'].includes(dir)) return;
  const q = st.votes[p.team];
  q.push({ dir, ts: st.t, pid: p.id });
  if (q.length > 90) q.splice(0, q.length - 90);
}

function sample(st) {
  const now = st.t;
  for (const k of Object.keys(st.votes)) {
    const q = st.votes[k].filter(v => now - v.ts <= 900);
    st.votes[k] = q;
    const split = { left: 0, right: 0, up: 0, down: 0 };
    let best = null, bestW = 0;
    for (const v of q) {
      const age = now - v.ts;
      const w = Math.exp(-age / FRESH_MS);     // freshest tap dominates, older taps still count
      split[v.dir] += w;
      if (split[v.dir] > bestW) { bestW = split[v.dir]; best = v.dir; }
    }
    const jet = st.jets[k]; if (!jet) continue;
    jet.split = split;
    jet.voters = q.length;
    if (best && bestW > 0.35 && now - (q[q.length - 1].ts) < 700) jet.dir = best;
  }
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  const s = dt / 1000;
  st.dist += SPEED * s;
  st.sampleT += dt;
  if (st.sampleT >= VOTE_MS) { st.sampleT = 0; sample(st); }

  while (st.towers.length && st.dist + 8 > st.nextTower) { st.nextTower += 26 + st.rng() * 16; spawn(st, st.rng); }
  st.towers = st.towers.filter(t => t.z > st.dist - 10);
  if (st.towers.length > 14) st.towers.splice(0, st.towers.length - 14);

  for (const k of Object.keys(st.jets)) {
    const j = st.jets[k]; if (!j.alive) continue;
    if (j.dir === 'left') j.x -= 9.2 * s;
    if (j.dir === 'right') j.x += 9.2 * s;
    if (j.dir === 'up') j.y += 5.6 * s;
    if (j.dir === 'down') j.y -= 5.6 * s;
    j.x = S.clamp(j.x, -XR, XR); j.y = S.clamp(j.y, YMIN, YMAX);
    j.dist = st.dist;
    for (const tw of st.towers) {
      const rel = tw.z - st.dist;
      if (rel > 1.2 || rel < -1.6) continue;
      if (Math.abs(j.x - tw.x) < tw.w / 2 + HIT && j.y < tw.h + 0.15) {
        j.alive = false; j.outAt = st.t; j.hitAt = tw.z; break;
      }
    }
  }
  const alive = Object.keys(st.jets).filter(k => st.jets[k].alive).length;
  if (st.t >= DURATION || alive <= 1) st.done = true;
}

const over = (room, st) => !!st.done;

function rows(st) {
  return Object.keys(st.jets).map(k => {
    const j = st.jets[k];
    return { team: Number(k), alive: j.alive, dist: Math.round(j.alive ? st.dist : (j.outAt ? j.outAt * SPEED / 1000 : 0)), outAt: j.outAt || 0, voters: j.voters || 0 };
  }).sort((a, b) => (a.alive !== b.alive ? (a.alive ? -1 : 1) : b.dist - a.dist));
}

function finish(room, st) {
  const table = rows(st);
  const teamPoints = S.teamTablePoints(table);
  const playerPoints = {};
  for (const id of st.parts) { const p = room.players[id]; if (p) playerPoints[id] = 10 + Math.round((st.jets[p.team] && st.jets[p.team].voters ? 20 : 0)); }
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar} عبرت ${Math.round(win.dist)} م` : 'انتهى التحليق',
    teamPoints, playerPoints, crowns: [], table,
  };
}

function hostView(room, st) {
  const jets = Object.keys(st.jets).map(k => {
    const j = st.jets[k];
    return { team: j.team, x: Math.round(j.x * 100) / 100, y: Math.round(j.y * 100) / 100, alive: j.alive, outAt: j.outAt, dir: j.dir, split: j.split, voters: j.voters };
  });
  return {
    chars: [],
    game: {
      id: 'skyjets', jets, towers: st.towers.map(t => ({ z: Math.round(t.z - st.dist), x: Math.round(t.x * 10) / 10, w: Math.round(t.w * 10) / 10, h: Math.round(t.h * 10) / 10 })),
      dist: Math.round(st.dist), speed: SPEED, xr: XR, ymin: YMIN, ymax: YMAX,
    },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), alive: jets.filter(j => j.alive).length, metres: Math.round(st.dist) },
  };
}

function padView(room, st, p) {
  const j = st.jets[p.team];
  const alive = !!(j && j.alive);
  let hint = null;
  if (p.bot && alive) {
    const threat = st.towers.filter(t => { const rel = t.z - st.dist; return rel > 3 && rel < 20 && Math.abs(j.x - t.x) < t.w / 2 + 1.1 && j.y < t.h + 0.6; })
      .sort((a, b) => (a.z - b.z) - (b.z - a.z))[0];
    if (threat) hint = { kind: 'vote', dir: j.y < YMAX - 0.4 ? 'up' : (threat.x > j.x ? 'left' : 'right') };
    else hint = { kind: 'vote', dir: st.rng() < 0.5 ? 'up' : (st.rng() < 0.5 ? 'left' : 'right') };
  }
  const split = j ? j.split : { left: 0, right: 0, up: 0, down: 0 };
  const tot = Object.values(split).reduce((a, b) => a + b, 0) || 1;
  return {
    head: alive ? 'صوّتوا للطيران' : 'سقطت الطائرة',
    sub: alive ? 'أغلبية النقرات الأحدث تقود' : 'شاهدوا بقية الفرق',
    controls: { type: 'vote', disabled: !alive, dirs: ['up', 'left', 'down', 'right'] },
    stats: [{ k: 'فريقك', v: alive ? 'يطير' : 'خرج' }, { k: 'المسافة', v: S.ar(Math.round(st.dist)) + 'م' }],
    meters: [],
    votes: { left: Math.round(split.left / tot * 100), right: Math.round(split.right / tot * 100), up: Math.round(split.up / tot * 100), down: Math.round(split.down / tot * 100) },
    feed: '',
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'skyjets', name: { ar: 'طيور السماء', en: 'Sky Jets' }, emoji: '✈️',
  tagline: 'قودوا الطائرة بالتصويت', how: 'كل فريق طائرة. صوّتوا يسار/يمين/أعلى/أسفل — الأغلبية الأحدث تقود الطائرة. تجنّبوا الأبراج.',
  formats: ['team'], durationMs: DURATION, viewHz: 20, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
