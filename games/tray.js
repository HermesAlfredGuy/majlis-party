/**
 * Tray Balance (توازن الصينية) — the WarioWare "BALANCE!" idea as a calm 36-second round. Your tray tilts with the
 * phone; the finjan on it slides downhill. Nothing accelerates and nothing is hidden: a gust is telegraphed a full
 * half second before it arrives, and a spill only costs you the seconds it takes to get the cup centred again.
 * Score is the time the cup spends inside the green band.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 36000, BAND = 0.22, MAX_TILT = 0.62, DRY_MS = 1100;
const K_SLIDE = 2.1, K_DAMP = 2.2, GUST_EVERY = [2600, 3400], GUST_WARN = 600;

function create(room, opts) {
  const rng = S.mulberry32((opts && opts.seed) || 58);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng, parts: players.map(p => p.id), players: {}, team: {}, gusts: [], spills: 0 };
  for (const p of players) st.players[p.id] = { id: p.id, team: p.team, tilt: 0, cup: (rng() - 0.5) * 0.1, v: 0, inMs: 0, alive: true, wetUntil: 0, spills: 0 };
  for (const t of S.TEAM_IDS) st.team[t] = { team: t, sum: 0, n: 0, spills: 0 };
  let at = 2400 + rng() * 800;
  while (at < DURATION - 1200) { st.gusts.push({ at, dir: rng() < 0.5 ? -1 : 1, power: 1.9 + rng() * 1.3 }); at += GUST_EVERY[0] + rng() * (GUST_EVERY[1] - GUST_EVERY[0]); }
  return st;
}

function onInput(room, st, p, msg) {
  const q = st.players[p.id]; if (!q || st.done) return;
  if (msg.kind === 'tilt') {
    const gx = Number(msg.gx);
    q.tilt = isFinite(gx) ? S.clamp(gx, -1, 1) : 0;
  } else if (msg.kind === 'move') {
    const dx = Number(msg.dx); q.tilt = isFinite(dx) ? S.clamp(dx, -1, 1) : 0;
  }
}

function tick(room, st, dt) {
  if (st.done) return;
  const s = dt / 1000;
  st.t += dt;
  for (const g of st.gusts) {
    if (!g.fired && st.t >= g.at) { g.fired = true; for (const id of st.parts) { const q = st.players[id]; if (q) q.v += g.dir * g.power; } }
  }
  for (const id of st.parts) {
    const q = st.players[id]; if (!q) continue;
    if (st.t < q.wetUntil) { q.v = 0; q.cup *= 0.9; continue; }
    /* the cup slides downhill, the phone tilt is the slope, the damped spring is the lip of the tray */
    q.v += (q.tilt * MAX_TILT * K_SLIDE - q.cup * 2.2 - q.v * K_DAMP) * s;
    q.cup += q.v * s;
    if (Math.abs(q.cup) > 1) {
      q.spills++; st.spills++; q.wetUntil = st.t + DRY_MS; q.cup = (q.cup > 0 ? 1 : -1) * 0.15; q.v = 0;
    } else if (Math.abs(q.cup) < BAND) q.inMs += dt;
  }
  if (st.t >= DURATION) {
    for (const id of st.parts) { const q = st.players[id]; const T = st.team[q.team]; if (!T) continue; T.sum += q.inMs; T.n++; T.spills += q.spills; }
    st.done = true;
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const rows = S.TEAM_IDS.map(t => {
    const T = st.team[t];
    return { team: t, value: T.n ? Math.round(T.sum / T.n / 100) / 10 : 0, spills: T.spills, n: T.n };
  }).filter(r => r.n > 0);
  rows.sort((a, b) => b.value - a.value);
  const teamPoints = {}; rows.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const id of st.parts) { const q = st.players[id]; if (q) playerPoints[id] = 8 + Math.round(q.inMs / 400); }
  const top = st.parts.slice().sort((a, b) => st.players[b].inMs - st.players[a].inMs)[0];
  const win = rows[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${win.value} ث في المنطقة` : 'انتهى الوقت',
    teamPoints, playerPoints,
    crowns: top ? [{ playerId: top, label: 'يد ثابتة', detail: (st.players[top].inMs / 1000).toFixed(1) + ' ث' }] : [],
    table: rows.map(r => ({ team: r.team, value: r.value, detail: r.spills + ' فوضى' })),
  };
}

function hostView(room, st) {
  const coming = st.gusts.find(g => !g.fired && g.at - st.t < GUST_WARN);
  const teams = S.TEAM_IDS.map(t => {
    let best = null;
    for (const id of st.parts) {
      const q = st.players[id]; if (!q || q.team !== t) continue;
      if (!best || Math.abs(q.cup) < Math.abs(best.cup)) best = q;
    }
    return { team: t, tilt: best ? Math.round(best.tilt * 100) / 100 : 0, cup: best ? Math.round(best.cup * 100) / 100 : 0, wet: best ? st.t < best.wetUntil : false, inMs: best ? best.inMs : 0 };
  });
  return {
    game: { id: 'tray', band: BAND, teams, gust: coming ? { dir: coming.dir, in: Math.round((coming.at - st.t) / 100) / 10 } : null, phase: 'balance', spills: st.spills },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)) },
  };
}

function padView(room, st, p) {
  const q = st.players[p.id];
  if (!q) return { head: 'الجولة القادمة', controls: { type: 'none' }, stats: [], team: { i: (p.team || 1) - 1 } };
  const coming = st.gusts.find(g => !g.fired && g.at - st.t < GUST_WARN);
  let hint = null;
  if (p.bot) {
    /* bots differ in how well they correct — the sim should show six different results, not six clones */
    const n = (parseInt(String(p.id).replace(/\D/g, ''), 10) || 5);
    const gain = 0.45 + ((n * 53) % 9) / 9 * 0.75;
    const wob = ((n * 31) % 7) / 7 - 0.5;
    hint = { kind: 'tilt', gx: S.clamp((-q.cup * 2.4 - q.v * 1.1) * gain + wob * 0.25, -1, 1) };
  }
  const pct = Math.round((q.inMs / Math.max(1, st.t)) * 100);
  return {
    head: st.t < q.wetUntil ? 'فوضى! امسكها' : 'ثبّت الصينية',
    sub: coming ? (coming.dir > 0 ? 'ريح من اليسار ←' : 'ريح من اليمين →') : 'أمِل عكس انزلاق الفنجان',
    controls: { type: 'tilt', axis: 'balance', disabled: st.done, invert: false, label: 'أمِل للتوازن' },
    stats: [{ k: 'في المنطقة', v: S.ar(pct) + '٪' }, { k: 'فوضى', v: S.ar(q.spills) }],
    meters: [{ k: 'الفنجان', pct: Math.round((q.cup + 1) * 50), band: [Math.round((0.5 - BAND) * 100), Math.round((0.5 + BAND) * 100)] }],
    feed: st.t < q.wetUntil ? '💧 انزلق الفنجان' : coming ? '💨 ريح قادمة' : '',
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'tray', name: { ar: 'توازن الصينية', en: 'Tray Balance' }, emoji: '🍵',
  tagline: 'لا تسقط الفنجان', how: 'الصينية تميل مع جوالك والفنجان ينزلق. أمِل عكس الانزلاق، واحترس من الريح بعد إشعارها.',
  formats: ['team', 'ffa', 'spotlight'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
