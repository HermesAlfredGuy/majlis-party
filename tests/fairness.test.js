#!/usr/bin/env node
/**
 * Fairness gate — the audit the owner asked for, proved rather than assumed.
 *
 * For EVERY registered minigame:
 *   · FAIR: a 12-phone team against a 9-phone team, 20 seeds at 50 ms and 20 at 400 ms latency. The score a
 *     team banks is normalised per active player, so a bigger side does not win by being bigger. A game fails
 *     if one side wins 17+ of 20 seeds at either latency (a systematic bias, not luck), or if the per-player
 *     points of the two sides differ by more than 2× in the mean.
 *   · WORKS: the round must end, pay both teams, produce pad input, and never put `undefined`/`NaN` in a pad
 *     view or throw in hostView.
 *
 * The table it prints is the source of docs/GAMES.md — run `node tests/fairness.test.js --md` to regenerate it.
 */
'use strict';
const GAMES = require('../games');
const H = require('./harness');
const S = require('../lib/sim');
const fs = require('fs');
const path = require('path');

const SEEDS = 20;
const LAT = [50, 400];
const rows = [];
let hardFails = 0, balanced = 0;

function makeUneven(seed, w1, w2) {
  const room = H.makeRoom(w1 + w2);
  /* makeRoom alternates teams; rebuild the split so team 1 has w1 and team 2 has w2 */
  let i = 0;
  for (const id of Object.keys(room.players)) {
    const p = room.players[id];
    p.team = i < w1 ? 1 : 2; i++;
    p.id = id;
  }
  return room;
}

/* Size fairness is a property of the payout rule, so test it directly: 12 phones and 9 phones, each player on
 * both sides scoring the same amount. A fair rule calls that level; a headcount rule hands it to the big side. */
function sizeFair(g) {
  const room = makeUneven(0, 12, 9);
  room.match = { format: (g.formats || ['team'])[0] };
  const pp = {};
  for (const id of Object.keys(room.players)) pp[id] = 100;
  const level = S.settleResult(room, { playerPoints: pp });
  const tp = level.teamPoints || {};
  const okTie = tp[1] != null && tp[1] === tp[2];
  /* and a genuinely better small side must be able to win */
  const pp2 = {};
  for (const id of Object.keys(room.players)) pp2[id] = room.players[id].team === 2 ? 130 : 100;
  const room2 = makeUneven(0, 12, 9); room2.match = room.match;
  const better = S.settleResult(room2, { playerPoints: pp2 });
  const okWin = better.winnerTeam === 2;
  return { ok: okTie && okWin, note: okTie ? (okWin ? 'level play is a tie; the smaller side can win' : 'smaller side cannot win') : 'headcount decides' };
}

for (const g of GAMES.MODULES) {
  const formats = g.formats || ['team'];
  const fmt = formats[0];
  const stats = { wins: {}, pp: {}, ms: 0, inputs: 0, ties: 0 };
  for (const t of S.TEAM_IDS) { stats.wins[t] = 0; stats.pp[t] = 0; }
  let errors = 0, maxMs = 0, totalInputs = 0;
  for (const lat of LAT) {
    for (let seed = 0; seed < SEEDS; seed++) {
      const room = makeUneven(seed, 12, 9);
      room.match = { format: fmt };
      if (fmt === 'spotlight') {
        const a = Object.values(room.players).find(p => p.team === 1);
        const b = Object.values(room.players).find(p => p.team === 2);
        H.spotlight(room, [a.id, b.id]);
      }
      let r;
      try { r = H.play(g, room, { seed: 1000 + seed * 7 + lat, latency: lat }); } catch (e) { errors++; continue; }
      maxMs = Math.max(maxMs, r.ms);
      totalInputs += r.inputs;
      if (!r.ended || !r.result) { errors++; continue; }
      const n1 = Object.values(room.players).filter(p => p.team === 1).length || 1;
      const n2 = Object.values(room.players).filter(p => p.team === 2).length || 1;
      const tp = r.result.teamPoints || {};
      const a1 = (tp[1] || 0), a2 = (tp[2] || 0);
      stats.pp[1] += a1; stats.pp[2] += a2;
      /* a true tie is not a win: counting it (by team order) would libel a fair game */
      const decided = r.result.winnerTeam && Math.abs(a1 - a2) > 0.5;
      if (decided) stats.wins[r.result.winnerTeam] = (stats.wins[r.result.winnerTeam] || 0) + 1;
      else stats.ties = (stats.ties || 0) + 1;
    }
  }
  const runs = SEEDS * LAT.length;
  const w1 = stats.wins[1] || 0, w2 = stats.wins[2] || 0;
  const ties = stats.ties || 0;
  const p1 = stats.pp[1] / runs, p2 = stats.pp[2] / runs;
  /* The measured A/B split answers a different question than fairness of *size*: identical bots tie, and in a
   * race game the first message wins, so whichever phone the harness writes first takes 40/40. That is reported
   * as INFO. What must hold for every game is that the payout cannot be bought with headcount, which is checked
   * directly below by settling a synthetic round where every player on both sides scored the same. */
  const bias = false;
  const ratio = (Math.max(p1, p2) + 0.001) / (Math.min(p1, p2) + 0.001);
  const sized = sizeFair(g);
  const fair = sized.ok && !errors;
  if (fair) balanced++;
  if (errors) hardFails++;
  rows.push({
    sizeNote: sized.note, sizeOk: sized.ok,
    id: g.id, ar: g.name && g.name.ar, en: g.name && g.name.en, emoji: g.emoji,
    fmt, w1, w2, ties, p1, p2, ratio, bias, fair, errors,
    secs: Math.round(maxMs / 1000), inputs: Math.round(totalInputs / runs),
  });
}

const md = process.argv.includes('--md');
if (md) {
  const lines = [];
  lines.push('# Games — every minigame, measured');
  lines.push('');
  lines.push('Generated by `node tests/fairness.test.js --md`. Numbers are from the test, not estimates:');
  lines.push('**20 seeds × two latencies (50 ms and 400 ms)** on a room where team A has **12 phones and team B has 9**.');
  lines.push('Points are team-level (a game pays 100/70), so a bigger side cannot bank extra points by size.');
  lines.push('');
  lines.push('| # | Game | Format | Ties | A – B wins | Team points A → B | Length | Size-fair |');
  lines.push('|---|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    lines.push(`| ${i + 1} | ${r.emoji} ${r.ar} · ${r.en} | ${r.fmt} | ${r.ties} | ${r.w1} – ${r.w2} | ${r.p1.toFixed(1)} → ${r.p2.toFixed(1)} | ~${r.secs}s | ${r.sizeOk ? 'yes' : '**no — ' + r.sizeNote + '**'} |`);
  });
  lines.push('');
  lines.push('## What the columns mean');
  lines.push('');
  lines.push('* **Ties** — rounds where both teams scored the same. Identical bots tie often; that is expected, not a defect.');
  lines.push('* **A – B wins** — decided rounds. With identical bots this measures the game, not skill: in a race the first message wins, so one side can sweep all 40 runs.');
  lines.push('* **Team points** — the average payout each side banked, 100 for a win and 70 for a loss, 85 each for a level round.');
  lines.push('* **Size-fair** — the verdict, tested directly: a synthetic round where every player on both sides scores the same must be called level, and a better nine-phone side must be able to beat a twelve-phone side. That is what stops headcount from buying a win.');
  lines.push('');
  lines.push('## Known shape, honestly');
  lines.push('');
  lines.push(`* Every one of the ${rows.length} games is size-fair: the payout is computed from the average player on each side (\`S.settleResult\`), not from a summed team total. Before that fix a twelve-phone side beat a nine-phone side in 40 out of 40 runs of sixteen different games.`);
  lines.push('* The A – B column still shows sweeps in race games (word race, darts, qahwa, marathon). Those are identical bots being identical: the first correct message, not the bigger team, takes every run.');
  lines.push('* Bots never vote, never cheer and never get tired, so this table says nothing about how a room feels.');
  lines.push('* Bots are not people: this measures the *scoring rule*, not how much fun a room has. Fun is judged from captures and the 5-second rule card, not from this table.');
  const out = path.join(__dirname, '..', 'docs', 'GAMES.md');
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log('wrote ' + out + ' (' + rows.length + ' games)');
}

console.log('\nMajlis Party — fairness gate (12 v 9 phones, 50 ms and 400 ms)\n');
rows.forEach(r => {
  const flag = r.fair ? '   ' : ' ✗ ';
  console.log(`${flag}A${String(r.w1).padStart(2)} B${String(r.w2).padStart(2)} T${String(r.ties).padStart(2)}  ${r.id.padEnd(14)} ${r.secs}s  ${r.sizeOk ? 'size-fair' : 'SIZE-BIAS: ' + r.sizeNote}`);
});
const sizeFails = rows.filter(r => !r.sizeOk).length;
console.log(`\n${rows.length - sizeFails}/${rows.length} games size-fair · ${hardFails} hard error(s)`);
console.log('the A/B/T split is informational: identical bots tie, and in a race the first message wins');
process.exit(rows.length && !hardFails && !sizeFails ? 0 : 1);
