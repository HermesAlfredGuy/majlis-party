/**
 * Safe Colour (اللون الآمن) — the floor is a Sadu mosaic of six hexes; a colour is called and you must be
 * on it when the rest drops. Every third call is a trap (cactus): tapping anything drops you.
 * Reference: Hexagon Heat / Searing Spotlights / Shy Guy Says.
 *
 * A tap is a choice, not a reflex duel: the window is the same for everyone and shrinks each round, so
 * the late-arriving tap is judged against the window it was made in, never against another player.
 */
'use strict';
const S = require('../lib/sim');

const ROUNDS = 11;
const CALL_MS = 1250, RESOLVE_MS = 900;
const ZONE_R = 4.9, ZONE_COUNT = 6;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 41);
  const rounds = [];
  let lastZone = 0;
  for (let i = 0; i < ROUNDS; i++) {
    /* Trap rounds are fixed invitations to flinch; never the first round and never twice running. */
    const trap = i > 0 && i % 4 === 3;
    let z = 1 + Math.floor(rng() * ZONE_COUNT);
    while (!trap && z === lastZone) z = 1 + Math.floor(rng() * ZONE_COUNT);
    if (!trap) lastZone = z;
    rounds.push({ kind: trap ? 'trap' : 'colour', zone: trap ? 0 : z, window: Math.max(1500, 3050 - i * 145) });
  }
  const parts = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt).map(p => p.id);
  const st = {
    t: 0, round: -1, rounds, phase: 'call', phaseT: 0, window: 0, done: false, over: false,
    parts, live: {}, zone: {}, tapped: {}, outAt: {}, survive: {}, slots: {},
  };
  for (const id of parts) {
    st.live[id] = true; st.zone[id] = 1 + Math.floor(rng() * ZONE_COUNT); st.tapped[id] = false; st.survive[id] = 0;
  }
  layout(room, st);
  return st;
}

/* Where every player stands: a small cluster inside their chosen hex, laid out from their join order so
 * two players never share a pixel. Recomputed whenever anyone changes zone. */
function layout(room, st) {
  const groups = {};
  for (const id of st.parts) { const z = st.zone[id] || 1; (groups[z] || (groups[z] = [])).push(id); }
  for (const z of Object.keys(groups)) {
    const zx = Math.cos((z - 1) / ZONE_COUNT * Math.PI * 2 - Math.PI / 2) * ZONE_R;
    const zz = Math.sin((z - 1) / ZONE_COUNT * Math.PI * 2 - Math.PI / 2) * ZONE_R;
    groups[z].forEach((id, i) => {
      const k = i, ring = Math.floor(k / 6), idx = k % 6;
      const a = (idx / 6) * Math.PI * 2 + ring * 0.5;
      const r = ring === 0 ? 0 : 0.42 + ring * 0.4;
      st.slots[id] = { x: zx + Math.cos(a) * r, z: zz + Math.sin(a) * r, zone: +z };
    });
  }
}

function startRound(st) {
  st.round++;
  st.phase = 'call'; st.phaseT = 0; st.window = st.rounds[st.round].window;
  for (const id of Object.keys(st.tapped)) st.tapped[id] = false;
}

function onStart(room, st) { if (st.round < 0) startRound(st); }

function onInput(room, st, p, msg) {
  if (st.done || !st.live[p.id] || st.round < 0) return;
  if (st.phase !== 'pick' && st.phase !== 'call') return;
  const z = Number(msg.zone || msg.z || 0);
  if (!(z >= 1 && z <= ZONE_COUNT)) return;
  st.tapped[p.id] = true;
  if (z !== st.zone[p.id]) { st.zone[p.id] = z; layout(room, st); }
}

function resolve(st) {
  const r = st.rounds[st.round];
  for (const id of st.parts) {
    if (!st.live[id]) continue;
    const wrong = r.kind === 'trap' ? st.tapped[id] : st.zone[id] !== r.zone;
    if (wrong) { st.live[id] = false; st.outAt[id] = st.t; }
  }
  st.phase = 'resolve'; st.phaseT = 0;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt; st.phaseT += dt;
  for (const id of st.parts) if (st.live[id]) st.survive[id] += dt;
  const r = st.rounds[Math.max(0, st.round)];
  if (st.phase === 'call') {
    if (st.phaseT >= CALL_MS) { st.phase = 'pick'; st.phaseT = 0; }
  } else if (st.phase === 'pick') {
    if (st.phaseT >= r.window) resolve(st);
  } else if (st.phase === 'resolve') {
    if (st.phaseT >= RESOLVE_MS) {
      const aliveTeams = new Set(st.parts.filter(id => st.live[id]).map(id => room.players[id] && room.players[id].team));
      if (st.round + 1 >= st.rounds.length || (st.round >= 2 && aliveTeams.size <= 1)) { st.done = true; }
      else startRound(st);
    }
  }
  if (!st.done && st.round < 0) startRound(st);
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const byTeam = {};
  for (const id of st.parts) {
    const p = room.players[id]; if (!p) continue;
    const t = byTeam[p.team] || (byTeam[p.team] = { team: p.team, alive: 0, survive: 0, n: 0 });
    t.n++; if (st.live[id]) t.alive++; t.survive += st.survive[id] || 0;
  }
  const table = Object.values(byTeam).sort((a, b) => b.alive - a.alive || b.survive - a.survive || a.team - b.team);
  const teamPoints = {}; table.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const id of st.parts) playerPoints[id] = 8 + Math.round((st.survive[id] || 0) / 1000) * 4;
  let best = null;
  for (const id of st.parts) if (!best || (st.survive[id] || 0) > (st.survive[best] || 0)) best = id;
  const crowns = best ? [{ playerId: best, label: 'حارس اللون', detail: 'آخر من وقف على اللون الآمن' }] : [];
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar} بقي ${win.alive} لاعبين` : 'انتهت الجولة',
    teamPoints, playerPoints, crowns, table,
  };
}

function hostView(room, st) {
  const r = st.rounds[Math.max(0, st.round)] || {};
  const chars = st.parts.map(id => {
    const p = room.players[id]; const s = st.slots[id] || {};
    return {
      id, team: p ? p.team : 1, x: s.x || 0, z: s.z || 0, out: !st.live[id], jump: -1,
      zone: st.zone[id] || 0, outAt: st.outAt[id] || 0,
    };
  });
  return {
    chars,
    game: {
      id: 'colour', round: st.round + 1, rounds: st.rounds.length, phase: st.phase,
      signal: r.kind === 'trap' ? { kind: 'trap', zone: 0 } : { kind: 'colour', zone: r.zone },
      window: r.window || 0, left: st.phase === 'pick' ? Math.max(0, (r.window || 0) - st.phaseT) : 0,
      phaseT: st.phaseT, callMs: CALL_MS, zones: ZONE_COUNT,
    },
    hud: { left: null, alive: st.parts.filter(id => st.live[id]).length },
  };
}

function padView(room, st, p) {
  const r = st.rounds[Math.max(0, st.round)] || {};
  const live = !!st.live[p.id];
  const trap = r.kind === 'trap';
  const call = st.phase === 'call';
  return {
    head: !live ? 'خرجت — شاهد' : trap && call ? '⚠️ لا تتحرك' : call ? `اللون: ${S.team(r.zone || 1).ar}` : trap ? 'لا تلمس شيئاً!' : 'اختر اللون',
    sub: !live ? 'انتظر الجولة القادمة' : trap ? 'فخ! لا تضغط أي لون' : 'اضغط لوناً واحداً',
    controls: { type: 'colours', disabled: !live || st.done, zones: ZONE_COUNT, chosen: st.zone[p.id] || 0, trap: trap && call },
    stats: [{ k: 'الجولة', v: `${S.ar(Math.max(1, st.round + 1))}/${S.ar(st.rounds.length)}` }, { k: 'الحالة', v: live ? 'حيّ' : 'خارج' }],
    meters: [],
    feed: st.phase === 'resolve' ? (live ? '✅ نجوت' : '❌ سقطت') : '',
    team: { i: (p.team || 1) - 1 },
    bot: live && st.phase !== 'resolve' && p.bot ? { kind: 'zone', zone: trap ? 0 : r.zone } : null,
  };
}

module.exports = {
  id: 'colour', name: { ar: 'اللون الآمن', en: 'Safe Colour' }, emoji: '🎨',
  tagline: 'قف على اللون المنادى', how: 'يُنادى لون — المس لونه على هاتفك قبل أن تسقط الأرض. راقب فخ الصبّار.',
  formats: ['team', 'ffa'], durationMs: ROUNDS * (CALL_MS + 2400 + RESOLVE_MS), create, onStart, onInput, tick, over, finish, hostView, padView,
};
