#!/usr/bin/env node
/**
 * Sim gate: every registered minigame, played to completion by 45 bots through its real pad view and
 * real input handler. Checks that it ends, ranks teams, pays points, and that the projector view is not
 * empty. No sockets — this is the fast gate the loadtest then re-proves over the wire.
 */
'use strict';
const GAMES = require('../games');
const H = require('./harness');
const S = require('../lib/sim');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('   ✗ ' + msg); } else console.log('   ✓ ' + msg); };

const games = GAMES.MODULES;
console.log(`\nMajlis Party — sim gate (${games.length} games, 45 bots each)\n`);
for (const g of games) {
  const formats = g.formats || ['team'];
  const fmt = formats.includes('team') ? 'team' : formats[0];
  const room = H.makeRoom(45);
  if (fmt === 'spotlight') {
    /* one player per team — a spotlight duel must be a real cross-team pairing, not two ids that happen
       to share a team now that there are only two teams */
    const ids = S.TEAM_IDS.map(t => Object.values(room.players).find(p => p.team === t).id);
    H.spotlight(room, ids);
  }
  room.match.format = fmt;
  const t0 = Date.now();
  const r = H.play(g, room);
  const ms = Date.now() - t0;
  console.log(`${g.emoji} ${g.id}  [${fmt}]  ${r.ms / 1000}s sim, ${r.inputs} inputs, ${ms} ms wall`);
  ok(r.ended, 'reached its own end condition');
  ok(!r.hostErr, 'hostView renders every second' + (r.hostErr ? ': ' + r.hostErr : ''));
  ok(r.result && (r.result.winnerTeam || fmt === 'spotlight'), 'has a winner/team result');
  ok(r.result && Object.keys(r.result.teamPoints || {}).length >= 2, 'pays at least two teams');
  ok(r.result && Object.keys(r.result.playerPoints || {}).length > 0, 'pays players');
  ok(!r.badViews.length, 'no undefined/NaN in the pad view' + (r.badViews.length ? ': ' + r.badViews.join(' | ') : ''));
  ok(r.inputs > 0, 'produced real input from the pad view');
  ok(r.frames.length > 2, 'projector got frames');
  if (r.frames.length) {
    const hv = r.frames[Math.floor(r.frames.length / 2)];
    const visual = (hv.chars && hv.chars.length) || (hv.game && (hv.game.jets || hv.game.teams || hv.game.phase));
    ok(!!visual, 'mid-game host view carries visible state');
  }
}
console.log(fails ? `\nFAIL — ${fails} assertion(s)\n` : '\nPASS — every minigame completes with 45 bots\n');
process.exit(fails ? 1 : 0);
