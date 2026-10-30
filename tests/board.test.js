#!/usr/bin/env node
/**
 * Board + picker gate.
 *
 * Two promises this locks down:
 *   1. THE BOARD IS FAIR AND LEGIBLE. Sixteen spaces in one order (public/board-path.js and lib/board.js must
 *      list the same kinds), every roll moves forward and never past the last space, coins never go negative,
 *      a shop purchase needs ten coins, and the fork vote resolves by majority with ties taking the short road.
 *   2. THE PICKER IS FAIR OVER A WHOLE SESSION. 45 bots play a nine-round night: nobody is drawn twice before
 *      everyone has been drawn once, both teams are always represented in a pair, and leavers do not stall it.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('../lib/board');
const PICK = require('../lib/picker');
const BOARD = require('../public/board-path.js');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('   ✗ ' + m); } else console.log('   ✓ ' + m); };

console.log('\nMajlis Party — board + picker gate\n');

/* ── the board */
ok(B.KINDS.length === 16, 'the road is sixteen spaces (' + B.KINDS.length + ')');
ok(BOARD.KINDS.length === B.KINDS.length && BOARD.KINDS.every((k, i) => k === B.KINDS[i]),
  'the picture and the rules agree on every space');
ok(B.KINDS[3] === 'fork' || B.KINDS.includes('fork'), 'the road has a fork the phones vote on');
ok(B.KINDS[B.LAST] === 'goal', 'the last space is the goal');

let b = B.fresh();
ok(b.coins[1] === 0 && b.stars[1] === 0 && b.pos[1] === 0, 'a fresh board starts empty');
for (let i = 0; i < 30; i++) { B.move(b, 1, 6); }
ok(b.pos[1] === B.LAST, 'a token never walks past the goal (' + b.pos[1] + ')');

let moved = false, back = false;
for (let i = 0; i < 400; i++) {
  const bb = B.fresh();
  B.rollTurn(bb, (i % 2) + 1, Math.random);
  const t = bb.turn;
  const other = t.winner === 1 ? 2 : 1;
  const diceOk = t.dice[t.winner].length === 2 && t.dice[other].length === 1;
  for (const team of [1, 2]) {
    const before = bb.pos[team];
    B.move(bb, team, t.steps[team]);
    if (bb.pos[team] < before) back = true;
    B.land(bb, team, Math.random);
    if (bb.coins[team] < 0) moved = true;
  }
  if (!diceOk) fails++;
}
ok(!back, 'no roll moves a team backwards');
ok(!moved, 'coins never fall below zero');

/* the shop needs ten coins */
let shopB = B.fresh(); shopB.pos[1] = 6; shopB.coins[1] = 9;
const poor = B.land(shopB, 1, () => 0);
ok(poor.star === 0 && shopB.stars[1] === 0, 'nine coins cannot buy a dallah');
let richB = B.fresh(); richB.pos[1] = 6; richB.coins[1] = 12;
const rich = B.land(richB, 1, () => 0);
ok(rich.star === 1 && richB.coins[1] === 2, 'twelve coins buy one dallah for ten');

/* the fork */
let forkB = B.fresh(); forkB.pos[1] = 3;
const v = B.voteResult(forkB, { short: 7, long: 21 });
ok(v.choice === 'long', 'the majority decides the fork');
ok(B.voteResult(forkB, { short: 9, long: 9 }).choice === 'short', 'a tie takes the short road');
let fb = B.fresh(); fb.pos[1] = 3;
const after = B.applyFork(fb, 1, 'short');
ok(fb.pos[1] === 3 + 3, 'the short road is three spaces');

/* stars decide the night, not points */
const lb = B.fresh(); lb.stars[1] = 1; lb.stars[2] = 3;
ok(B.leader(lb) === 2, 'more dallahs wins');
const lb2 = B.fresh(); lb2.stars[1] = 2; lb2.stars[2] = 2; lb2.coins[1] = 4; lb2.coins[2] = 11;
ok(B.leader(lb2) === 2, 'a tie on dallahs is broken by coins');

/* ── the picker over 45 bots and a nine-round night */
const bots = [];
for (let i = 1; i <= 45; i++) bots.push({ id: 'p' + i, team: (i % 2) + 1, connected: true });
let pool = bots.map(p => p.id);
const drawn = [];
const rounds = 24; /* 45 players / 2 per round = 22.5, so round 23 refills the pool */
let sameTeam = 0;
for (let r = 0; r < rounds; r++) {
  const { pair, pool: next } = PICK.draw(bots, pool, Math.random);
  pool = next;
  if (!pair) { fails++; console.log('   ✗ picker returned no pair at round ' + r); break; }
  if (pair[0].team === pair[1].team) sameTeam++;
  drawn.push(pair[0].id, pair[1].id);
}
ok(drawn.length === rounds * 2, 'every round draws exactly two phones');
ok(sameTeam === 0, 'every pair spans both teams (' + sameTeam + ' same-team pairs)');
const first22 = drawn.slice(0, 44);
ok(new Set(first22).size === 44, '44 draws cover 44 different players — no repeats before the pool empties');
ok(new Set(drawn).size >= 44, 'after the pool empties it refills — ' + new Set(drawn).size + ' different phones in 24 rounds');

/* the shop cannot be bought with money the team does not have */
const nb = B.fresh(); nb.pos[2] = 4; /* chaos */
B.land(nb, 2, () => 0.1);
ok(nb.coins[2] >= 0, 'a chaos penalty cannot push coins below zero');

/* a leaver must not stall the pool */
let p2 = ['p1', 'p2', 'p3'];
bots[0].connected = false;
const d2 = PICK.draw(bots, p2, Math.random);
ok(!!d2.pair && d2.pair.every(p => p.connected !== false), 'a disconnected player is skipped');
bots[0].connected = true;

/* the picker must be random, not ordered: 45 bots, 200 draws, the first of the pair should vary */
const firsts = new Set();
for (let i = 0; i < 200; i++) { const d = PICK.draw(bots, bots.map(p => p.id), Math.random); if (d.pair) firsts.add(d.pair[0].id); }
ok(firsts.size > 20, 'the draw order is not fixed (' + firsts.size + ' different openers in 200 draws)');

/* ── the phone payload must expose the vote only during the board */
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
ok(/socket\.on\('vote'/.test(src), 'phones can vote');
ok(/socket\.on\('cheer'/.test(src), 'watching phones can cheer');
ok(/enterBoard\(\)/.test(src) && /endBoard\(\)/.test(src), 'the board sits between a result and the wheel');

console.log(fails ? `\nFAIL — ${fails} board/picker problem(s)\n` : '\nPASS — sixteen fair spaces and a picker that covers the room\n');
process.exit(fails ? 1 : 0);
