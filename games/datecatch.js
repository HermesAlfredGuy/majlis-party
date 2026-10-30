/**
 * Date Catch (اصطياد التمر) — the WarioWare "CATCH!" idea as a calm 40-second round. Dates drop at a steady rhythm;
 * you tilt the phone to slide your basket under them. The fall rate never changes and the next date is always
 * visible before you need to move, so a good catcher wins by reading the queue, not by twitching.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 40000, FALL_MS = 3200, EVERY = 1150, CATCH_W = 0.36, SPEED = 1.45, LANE = 1.0;

function create(room, opts) {
  const rng = S.mulberry32((opts && opts.seed) || 29);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng, parts: players.map(p => p.id), players: {}, team: {}, dates: [], nextAt: 700, caught: 0, dropped: 0, seq: 0 };
  for (const p of players) st.players[p.id] = { id: p.id, team: p.team, x: 0, vx: 0, catches: 0, misses: 0, streak: 0, flash: 0 };
  for (const t of S.TEAM_IDS) st.team[t] = { team: t, catches: 0, n: 0, best: 0 };
  return st;
}

function onInput(room, st, p, msg) {
  const q = st.players[p.id]; if (!q || st.done) return;
  /* tilt is a velocity, not a position: leaning the phone slides the basket, and letting go leaves it where it
   * is. Treating it as an absolute position made the basket jump to the tilt value and miss everything. */
  if (msg.kind === 'tilt') {
    const gx = Number(msg.gx);
    q.vx = isFinite(gx) ? S.clamp(gx, -1, 1) : 0;
  } else if (msg.kind === 'move') {
    const dx = Number(msg.dx); q.vx = isFinite(dx) ? S.clamp(dx, -1, 1) : 0;
  }
}

function tick(room, st, dt) {
  if (st.done) return;
  const s = dt / 1000;
  st.t += dt;
  /* steady, announced rhythm: one date every 1.15 s, no acceleration, capped so the round ends cleanly */
  while (st.t >= st.nextAt && st.nextAt < DURATION - 400) {
    st.dates.push({ id: ++st.seq, x: Math.round((st.rng() * 1.6 - 0.8) * 100) / 100, born: st.nextAt, landed: false });
    st.nextAt += EVERY;
  }
  for (const id of st.parts) { const q = st.players[id]; if (q) q.x = S.clamp(q.x + (q.vx || 0) * SPEED * s, -LANE, LANE); }
  for (const d of st.dates) {
    if (d.landed) continue;
    if (st.t - d.born < FALL_MS) continue;
    d.landed = true;
    for (const id of st.parts) {
      const q = st.players[id]; if (!q) continue;
      if (Math.abs(q.x - d.x) <= CATCH_W) { q.catches++; q.streak++; q.flash = st.t + 500; st.caught++; }
      else { q.misses++; q.streak = 0; st.dropped++; }
    }
  }
  st.dates = st.dates.filter(d => !d.landed || st.t - d.born < FALL_MS + 500);
  if (st.t >= DURATION) {
    for (const id of st.parts) { const q = st.players[id]; const T = st.team[q.team]; if (!T) continue; T.catches += q.catches; T.n++; T.best = Math.max(T.best, q.catches); }
    st.done = true;
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const rows = S.TEAM_IDS.map(t => {
    const T = st.team[t];
    return { team: t, value: T.n ? Math.round((T.catches / T.n) * 10) / 10 : 0, best: T.best, n: T.n };
  }).filter(r => r.n > 0);
  rows.sort((a, b) => b.value - a.value || b.best - a.best);
  const teamPoints = {}; rows.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const id of st.parts) { const q = st.players[id]; if (q) playerPoints[id] = 8 + q.catches * 5; }
  const top = st.parts.slice().sort((a, b) => st.players[b].catches - st.players[a].catches)[0];
  const win = rows[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${win.value} تمرة للاعب` : 'طارت التمور',
    teamPoints, playerPoints,
    crowns: top ? [{ playerId: top, label: 'يد التمر', detail: `${st.players[top].catches} تمرة` }] : [],
    table: rows.map(r => ({ team: r.team, value: r.value, detail: r.best + ' أفضل لاعب' })),
  };
}

function hostView(room, st) {
  const teams = S.TEAM_IDS.map(t => {
    let x = 0, n = 0, best = 0;
    for (const id of st.parts) { const q = st.players[id]; if (!q || q.team !== t) continue; x += q.x; n++; best = Math.max(best, q.catches); }
    return { team: t, x: n ? Math.round((x / n) * 100) / 100 : 0, catches: st.team[t].catches, best, n };
  });
  return {
    game: {
      id: 'datecatch', lane: LANE, fall: FALL_MS, every: EVERY, phase: 'catch',
      dates: st.dates.filter(d => !d.landed).map(d => ({ x: d.x, p: Math.min(1, Math.max(0, (st.t - d.born) / FALL_MS)) })),
      teams, caught: st.caught,
    },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)) },
  };
}

function padView(room, st, p) {
  const q = st.players[p.id];
  if (!q) return { head: 'الجولة القادمة', controls: { type: 'none' }, stats: [], team: { i: (p.team || 1) - 1 } };
  /* the next date to land, from this player's point of view */
  const next = st.dates.filter(d => !d.landed && st.t - d.born < FALL_MS).sort((a, b) => (FALL_MS - (st.t - a.born)) - (FALL_MS - (st.t - b.born)))[0];
  let hint = null;
  if (p.bot && next) hint = { kind: 'tilt', gx: S.clamp((next.x - q.x) * 3.2, -1, 1) };
  return {
    head: st.t < q.flash ? '💛 التمرة في السلة' : 'حرّك السلة',
    sub: next ? `التمرة القادمة ${next.x < -0.25 ? 'يسار' : next.x > 0.25 ? 'يمين' : 'وسط'}` : 'استعد…',
    controls: { type: 'tilt', axis: 'slide', disabled: st.done, invert: false, label: 'أمِل لتحريك السلة' },
    stats: [{ k: 'التمر', v: S.ar(q.catches) }, { k: 'فات', v: S.ar(q.misses) }, { k: 'متسلسل', v: S.ar(q.streak) }],
    meters: [{ k: 'السلة', pct: Math.round((q.x + 1) * 50) }],
    feed: q.streak >= 3 ? '🔥 ' + S.ar(q.streak) + ' على التوالي' : '',
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'datecatch', name: { ar: 'اصطياد التمر', en: 'Date Catch' }, emoji: '🌴',
  tagline: 'لا تفوّت تمرة', how: 'التمور تنزل بإيقاع ثابت. أمِل جوالك لتحرّك سلتك تحتها — كل تمرة في السلة نقطة.',
  formats: ['team', 'ffa', 'spotlight'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
