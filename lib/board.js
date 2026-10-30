/**
 * The board — a woven rug road of sixteen spaces that both teams walk between minigames.
 *
 * Pure logic, no sockets: the server calls it on entering the board phase and the tests call it directly.
 * The flat `KINDS` list lives here and in public/board-path.js (same order), so the picture and the rules
 * can never disagree about what space 9 is.
 *
 * Money is coins; one golden dallah (✦) costs ten coins at the shop, and stars decide the night.
 */
'use strict';

const KINDS = [
  'coin', 'coin', 'star', 'coin',
  'chaos', 'coin', 'shop', 'fork',
  'coin', 'star', 'event', 'coin',
  'coin', 'chaos', 'coin', 'goal'
];
const LAST = KINDS.length - 1;

const CHAOS = [
  { ar: 'ضيف متأخر أهداكم قِدر قهوة', coins: 3 },
  { ar: 'انقلبت الدلة — خسرتم قطعًا', coins: -2 },
  { ar: 'المضيف معجب بكم', coins: 4 },
  { ar: 'عاصفة رملية على الطريق', coins: -1 },
  { ar: 'لقطة من الشاشة', coins: 2 },
];
const EVENTS = [
  { ar: 'تبادل أماكن! انتقلتم إلى موقعهم', swap: true },
  { ar: 'خطوة إضافية بالمجان', coins: 0, step: 2 },
  { ar: 'دالية على حساب المجلس', star: 1 },
  { ar: 'قهوة للجميع', coins: 5 },
];

function fresh() {
  const coins = {}, stars = {}, pos = {};
  for (const t of [1, 2]) { coins[t] = 0; stars[t] = 0; pos[t] = 0; }
  return { coins, stars, pos, last: { 1: null, 2: null }, turn: null, vote: null, log: [], seq: 0, done: false };
}

function move(b, team, steps) {
  b.pos[team] = Math.min(LAST, b.pos[team] + steps);
  return b.pos[team];
}

/** Resolve the space a team landed on. Returns the line shown on the projector. */
function land(b, team, rng) {
  const idx = b.pos[team];
  const kind = KINDS[idx];
  const out = { team, space: idx, kind, coins: 0, star: 0, text: '' };
  if (kind === 'coin') { out.coins = 3; out.text = 'ثلاث قطع'; }
  else if (kind === 'star') { out.star = 1; out.text = 'دالية ذهبية!'; }
  else if (kind === 'goal') { out.star = 1; out.coins = 5; out.text = 'الخِتام — دالية وخمس قطع'; }
  else if (kind === 'shop') {
    if (b.coins[team] >= 10) { out.coins = -10; out.star = 1; out.text = 'اشترى دالية بعشر قطع'; }
    else { out.coins = 2; out.text = 'لا يكفي — أخذتم قطعتين'; }
  } else if (kind === 'chaos') {
    const c = CHAOS[Math.floor((rng ? rng() : Math.random()) * CHAOS.length) % CHAOS.length];
    out.coins = c.coins; out.text = c.ar;
  } else if (kind === 'event') {
    const e = EVENTS[Math.floor((rng ? rng() : Math.random()) * EVENTS.length) % EVENTS.length];
    out.star = e.star || 0; out.coins = e.coins || 0; out.text = e.ar; out.swap = !!e.swap; out.step = e.step || 0;
  } else if (kind === 'fork') { out.text = 'مفترق — القرار للهواتف'; }
  /* coins never fall below zero: a penalty that would take a team under floor is capped at what it has */
  const before = b.coins[team];
  b.coins[team] = Math.max(0, before + out.coins);
  out.coins = b.coins[team] - before;
  b.stars[team] += out.star;
  b.last[team] = out;
  b.log.push(out);
  if (b.log.length > 12) b.log.shift();
  return out;
}

/** Winner rolls two dice and keeps the best; the other team rolls one. */
function rollTurn(b, winnerTeam, rng) {
  const r = rng || Math.random;
  const d6 = () => 1 + Math.floor(r() * 6);
  const dice = {};
  for (const t of [1, 2]) dice[t] = t === winnerTeam ? [d6(), d6()] : [d6()];
  const steps = {};
  for (const t of [1, 2]) steps[t] = Math.max.apply(null, dice[t]);
  b.turn = { winner: winnerTeam, dice, steps, at: Date.now() };
  return b.turn;
}

/** Majority decides a fork: 'short' costs 2 coins and takes 3 spaces, 'long' takes 5 spaces. */
function voteResult(b, hits) {
  const a = hits && hits.short || 0, c = hits && hits.long || 0;
  return { short: a, long: c, choice: a >= c ? 'short' : 'long' };
}
function applyFork(b, team, choice) {
  const steps = choice === 'short' ? 3 : 5;
  if (choice === 'short') b.coins[team] = Math.max(0, b.coins[team] - 2);
  move(b, team, steps);
  return land(b, team);
}

function leader(b) {
  const s1 = b.stars[1], s2 = b.stars[2];
  if (s1 !== s2) return s1 > s2 ? 1 : 2;
  const c1 = b.coins[1], c2 = b.coins[2];
  if (c1 !== c2) return c1 > c2 ? 1 : 2;
  const p1 = b.pos[1], p2 = b.pos[2];
  if (p1 !== p2) return p1 > p2 ? 1 : 2;
  return null;
}

module.exports = { fresh, move, land, rollTurn, voteResult, applyFork, leader, KINDS, LAST, CHAOS, EVENTS };
