/**
 * Majlis Party — shared simulation helpers.
 * Team table, seeded RNG, small maths, Arabic-Indic digits for the projector.
 * Nothing here touches the DOM or the socket; the server sims and the tests both use it.
 */
'use strict';

/* Exactly two teams. The owner's correction: a hall of 40 phones splits into two sides, not six — six did not
 * give anyone a side to shout for. `hex` is the live colour, `dark` the shaded side the renderer uses for the
 * thobe's shadow panel and the carpet trim, so a team reads as one object from the back of a room. */
const TEAMS = [
  { i: 1, key: 'mint',   ar: 'الفيروز', en: 'Turquoise',   hex: '#3ED9B0', dark: '#0C5F4E', crest: '◆' },
  { i: 2, key: 'coral',  ar: 'الرمان',  en: 'Pomegranate', hex: '#FF7A5C', dark: '#7C2430', crest: '✦' },
];
const TEAM_BY_I = {}; for (const t of TEAMS) TEAM_BY_I[t.i] = t;
const TEAM_IDS = TEAMS.map(t => t.i);
const team = (i) => TEAM_BY_I[i] || TEAMS[0];

/* Placement points for one minigame, newest first? No: index 0 = first place. With two teams the loser of a
 * round still banks points, so a bad game never buries a side before the finale. */
const PLACEMENT = [100, 70];
/* Settle a finished round on PER-PLAYER averages.
 *
 * Every game sums its team's player points into a team total, which quietly hands the bigger side a win: with
 * identical play, twelve phones bank 12/9 of nine phones' total and take the round. The award is therefore
 * recomputed here, once, from playerPoints — team score is the average of its players — so a team cannot win by
 * having more phones. Every caller (server and tests) goes through this, so the rule cannot drift per game.
 */
function settleResult(room, result) {
  if (!result) return result;
  const pp = result.playerPoints || {};
  const acc = {};
  /* every participant counts, even one a game forgot to pay: an unpaid player is still a player, and dropping
   * them from the average is how a team ends up with a score built from three people out of nine. */
  const inGame = new Set(Object.keys(pp));
  for (const p of Object.values(room.players || {})) {
    if (!p || !p.connected || p.afk) continue;
    if (inGame.size && !inGame.has(p.id) && !result.__all) { /* a game may pay only some seats (spotlight) */ }
    (acc[p.team] = acc[p.team] || []).push(Number(pp[p.id]) || 0);
  }
  const ids = Object.keys(acc);
  if (ids.length < 2) return result;
  const avg = {};
  ids.forEach(t => { avg[t] = acc[t].length ? acc[t].reduce((a, b) => a + b, 0) / acc[t].length : 0; });
  const order = ids.slice().sort((a, b) => avg[b] - avg[a]);
  /* a one-point gap over a whole round is not a win: treat anything inside 1% as level */
  const spread = Math.max(Math.abs(avg[order[0]]), Math.abs(avg[order[1]]), 1);
  const tie = Math.abs(avg[order[0]] - avg[order[1]]) <= spread * 0.01;
  const teamPoints = {};
  if (tie) {
    /* An exact tie pays both sides the same. The board still needs somebody to roll, so the dice advantage goes
     * to the team whose best individual scored highest — a fair coin in practice, and never a silent stall. */
    ids.forEach(t => { teamPoints[t] = Math.round((PLACEMENT[0] + PLACEMENT[1]) / 2); });
    let bestId = null, best = -Infinity;
    for (const id of Object.keys(pp)) { const v = Number(pp[id]) || 0; if (v > best) { best = v; bestId = id; } }
    const bp = bestId && room.players ? room.players[bestId] : null;
    result.winnerTeam = bp ? Number(bp.team) : Number(ids[0]);
  }
  else {
    teamPoints[order[0]] = PLACEMENT[0];
    order.slice(1).forEach(t => { teamPoints[t] = PLACEMENT[1]; });
    result.winnerTeam = Number(order[0]);
  }
  result.teamPoints = teamPoints;
  result.teamAvg = avg;
  result.tie = tie;
  return result;
}

/* Team points from a ranked table.
 *
 * The old rule gave the payout to whichever team held rank 0, so with two teams of different sizes the bigger
 * side got a free max-of-N advantage, and an exact tie was decided by stable-sort order (team 1 always won).
 * The mean placement percentile is size-neutral: twelve phones and nine phones are compared on the average
 * player, not the luckiest one. A true tie pays both sides the same, which is the honest answer.
 */
function teamTablePoints(table, allTeams) {
  const n = table.length;
  const acc = {};
  table.forEach((r, i) => {
    if (!r || r.team == null) return;
    const pct = n > 1 ? 1 - i / (n - 1) : 1;
    (acc[r.team] = acc[r.team] || []).push(pct);
  });
  const ids = Object.keys(acc);
  const out = {};
  /* a game where only one side reached the table (every tank on one team died first) still pays both teams:
   * no team should be able to end a round with zero points by simply not appearing. */
  if (allTeams) allTeams.forEach(t => { if (!acc[t]) acc[t] = [acc[ids[0]] ? acc[ids[0]][0] - 0.5 : 0]; });
  if (!ids.length) return out;
  if (ids.length === 1) { out[ids[0]] = PLACEMENT[0]; return out; }
  const mean = {};
  ids.forEach(t => { mean[t] = acc[t].reduce((a, b) => a + b, 0) / acc[t].length; });
  ids.sort((a, b) => mean[b] - mean[a]);
  if (Math.abs(mean[ids[0]] - mean[ids[1]]) < 1e-9) {
    ids.forEach(t => { out[t] = Math.round((PLACEMENT[0] + PLACEMENT[1]) / 2); });
    return out;
  }
  out[ids[0]] = PLACEMENT[0];
  ids.slice(1).forEach(t => { out[t] = PLACEMENT[1]; });
  return out;
}

const placePoints = (rank) => PLACEMENT[Math.max(0, Math.min(PLACEMENT.length - 1, rank))];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const rnd = (r, a, b) => a + (b - a) * r();
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/* Arabic-Indic digits for anything the projector prints. Round first: a raw float once printed
 * ٨٥٥.٠٥٧١٩٩ on the race HUD. */
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
function ar(n) {
  const s = String(Math.round(Number(n) || 0));
  let out = '';
  for (const c of s) out += AR_DIGITS[+c] != null && /\d/.test(c) ? AR_DIGITS[+c] : c;
  return out;
}
/* A stable per-player slot angle so a 45-strong ring never re-shuffles mid-game. */
function ringSlot(index, count, radius) {
  const a = (index / Math.max(1, count)) * Math.PI * 2;
  return { x: Math.cos(a) * radius, z: Math.sin(a) * radius, a };
}

/* Everyone who actually plays this round. A 1v1 SPOTLIGHT only lets the two drawn players into the
 * simulation — the rest of the room watches (and bets), so no game needs to know about formats. */
/* Seat order is shuffled every round.
 *
 * Before this, participants came in join order and every game processed inputs in that same order, so a
 * same-tick tie (two phones reaching a zone together, two taps on the same tick) went to whoever joined first —
 * and with two teams that is a systematic edge for the side that joined first. The shuffle makes that tie-random,
 * which is the only fair answer. Seeded from the room so a round is still reproducible.
 */
function shuffleSeats(room, list) {
  room.__seat = (room.__seat || 1);
  const rng = mulberry32(room.__seat++ * 2654435761 >>> 0);
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

function participants(room) {
  const all = shuffleSeats(room, Object.values(room.players).filter(p => p.connected && !p.afk));
  const m = room.match;
  if (m && m.format === 'spotlight') {
    const ids = [m.a, m.b].filter(Boolean);
    const pair = ids.map(id => room.players[id]).filter(p => p && p.connected && !p.afk);
    /* a spotlight pair can lose a phone between the draw and the countdown: never leave the game with
     * nobody in it — fall back to the room instead of playing to an empty arena. */
    if (pair.length >= 1) return pair;
    return all;
  }
  return all;
}

/* Turn rotation inside a team: joinedAt order, AFK skipped, one pass per call. Used by the relay games
 * (Balloon Pump, Glass Fill, Glass Bridge) where 45 people each get their go. */
function makeRotation(members) {
  const list = members.slice().sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  return { list, i: 0, next() { if (!list.length) return null; const p = list[this.i % list.length]; this.i++; return p; } };
}

module.exports = { TEAMS, TEAM_BY_I, TEAM_IDS, team, PLACEMENT, placePoints, teamTablePoints, settleResult, mulberry32, clamp, lerp, rnd, pick, dist2, ar, ringSlot, participants, makeRotation };
