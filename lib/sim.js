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
function participants(room) {
  const all = Object.values(room.players).filter(p => p.connected && !p.afk);
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

module.exports = { TEAMS, TEAM_BY_I, TEAM_IDS, team, PLACEMENT, placePoints, mulberry32, clamp, lerp, rnd, pick, dist2, ar, ringSlot, participants, makeRotation };
