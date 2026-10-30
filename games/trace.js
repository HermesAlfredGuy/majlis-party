/**
 * Trace Race (ارسم الخط) — everyone gets the same line to trace with a finger: a falcon's wing, a palm
 * frond, a crescent. The phone sends the stroke when the finger lifts, so one packet at the end scores the
 * whole attempt — nothing here depends on latency. Coverage and accuracy, not raw speed, decide the points.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 34000, MAX_PTS = 96;
const SHAPES = ['falcon', 'palm', 'crescent'];
const SHAPE_AR = { falcon: 'جناح الصقر', palm: 'سعفة النخل', crescent: 'الهلال' };

function shape(name) {
  const pts = [];
  if (name === 'falcon') {
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([0.1 + t * 0.8, 0.5 - Math.sin(t * Math.PI) * 0.34 + Math.sin(t * 9) * 0.012]); }
  } else if (name === 'palm') {
    for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([0.12 + t * 0.76, 0.82 - t * 0.62]); }
    for (let k = 1; k <= 4; k++) {
      const bx = 0.12 + k * 0.19;
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([bx + t * 0.1, (0.82 - ((bx - 0.12) / 0.76) * 0.62) - t * 0.18 + Math.sin(t * Math.PI) * 0.06]); }
    }
  } else {
    for (let i = 0; i <= 44; i++) { const a = Math.PI * 0.72 + (i / 44) * Math.PI * 1.06; pts.push([0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.34]); }
  }
  return pts;
}

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 17);
  const name = SHAPES[Math.floor(rng() * SHAPES.length)];
  const target = shape(name);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  return { t: 0, done: false, name, target, strokes: {}, scores: {}, parts: players.map(p => p.id), rng };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function scoreStroke(source, pts) {
  if (!pts || pts.length < 6) return 0;
  let cover = 0, dev = 0;
  for (const t of source) {
    let best = 9;
    for (let i = 0; i < pts.length; i += 2) {
      const d = dist(t, pts[i]);
      if (d < best) best = d;
    }
    if (best < 0.055) cover++;
    dev += best;
  }
  const coverage = cover / source.length;
  const meanDev = dev / source.length;
  const score = Math.max(0, Math.min(100, coverage * 78 + Math.max(0, 1 - meanDev * 5.2) * 22));
  return Math.round(score * 10) / 10;
}

function onInput(room, st, p, msg) {
  if (st.done || !st.parts.includes(p.id)) return;
  if (msg.kind !== 'stroke') return;
  const raw = Array.isArray(msg.pts) ? msg.pts.slice(0, MAX_PTS) : [];
  const pts = raw.map(q => [S.clamp(Number(q[0]) || 0, 0, 1), S.clamp(Number(q[1]) || 0, 0, 1)]);
  if (pts.length < 6) return;
  st.strokes[p.id] = pts;
  st.scores[p.id] = scoreStroke(st.target, pts);
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  if (st.t >= DURATION) st.done = true;
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const byTeam = {};
  let bestId = null, bestV = -1;
  for (const id of st.parts) {
    const p = room.players[id]; if (!p) continue;
    const v = st.scores[id] || 0;
    if (v > bestV) { bestV = v; bestId = id; }
    const T = byTeam[p.team] || (byTeam[p.team] = { team: p.team, sum: 0, n: 0, top: 0 });
    T.sum += v; T.n++; T.top = Math.max(T.top, v);
  }
  const table = Object.values(byTeam).map(T => ({ team: T.team, value: T.n ? Math.round((T.sum / T.n) * 10) / 10 : 0, top: Math.round(T.top) })).sort((a, b) => b.value - a.value);
  const teamPoints = {}; table.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {}; for (const id of st.parts) playerPoints[id] = Math.round(st.scores[id] || 0);
  const win = table[0];
  const crowns = bestId ? [{ playerId: bestId, label: 'أدقّ يد', detail: `${Math.round(bestV)}٪` }] : [];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar} — ${win.value}٪` : 'انتهى الرسم',
    teamPoints, playerPoints, crowns, table,
  };
}

function hostView(room, st) {
  return {
    chars: [],
    game: {
      id: 'trace', phase: st.done ? 'done' : 'draw', name: st.name, shapeAr: SHAPE_AR[st.name], target: st.target.map(q => [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]),
      done: Object.keys(st.scores).length, total: st.parts.length, live: st.parts.filter(id => st.strokes[id]).length,
      top: Object.entries(st.scores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => ({ id, nick: room.players[id] ? room.players[id].nick : '', v: Math.round(v) })),
    },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), alive: st.parts.length },
  };
}

function padView(room, st, p) {
  const mine = st.parts.includes(p.id);
  return {
    head: mine ? '' : 'شاهد الرسم',
    sub: SHAPE_AR[st.name] || '',
    controls: mine ? { type: 'trace', disabled: st.done, target: st.target } : { type: 'none' },
    stats: mine ? [{ k: 'النتيجة', v: st.scores[p.id] != null ? `${Math.round(st.scores[p.id])}٪` : '—' }] : [],
    meters: [],
    feed: mine && st.scores[p.id] != null ? 'وصلت رسمتك ✓ اقدر تعيدها' : '',
    team: { i: (p.team || 1) - 1 },
    bot: p.bot ? { kind: 'stroke', pts: st.target.map(q => [q[0] + (st.rng() - 0.5) * 0.03, q[1] + (st.rng() - 0.5) * 0.03]) } : null,
  };
}

module.exports = {
  id: 'trace', name: { ar: 'ارسم الخط', en: 'Trace Race' }, emoji: '✍️',
  tagline: 'ارسم الشكل بأصبعك', how: 'يظهر شكل على جوالك — ارسمه بأصبعك بأكبر دقة. الدقة والتغطية تحدّد النقاط، والسرعة لا تعاقب أحداً.',
  formats: ['ffa', 'team'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
