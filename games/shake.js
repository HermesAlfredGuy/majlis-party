/**
 * Shake the Laban (هزّوا العلبة) — the can must not burst.
 *
 * The phone is a Laban can: shake it (a burst of taps) to build pressure, and the pressure decays on its own.
 * Reach 100 before the other team and the lid flies off in your favour; overshoot the safety line (the red band
 * at 88) and it bursts, you lose most of your pressure and the round carries on. Every phone shows where the
 * line is and how much pressure it has, so the game is a judgement call, not a reflex.
 *
 * DeviceMotion: the game accepts either taps or `motion` messages (the phone's accelerometer) as a shake, so a
 * real phone can shake the can while a browser without motion permission still plays with taps. That is the
 * rule the owner asked for — never depend on motion hardware alone.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 38000, TARGET = 100, BURST = 88, SHAKE = 4.2, DECAY = 9, BURST_LOSS = 55, GRACE = 2200;

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 77);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng, parts: players.map(p => p.id), win: null, winAt: 0, bursts: {}, last: {} };
  st.press = {}; st.pressAt = {};
  players.forEach(p => { st.press[p.id] = 0; st.pressAt[p.id] = -GRACE; });
  return st;
}

/* a burst is a run of shakes; the phone tells us when it starts a shake */
function onInput(room, st, p, msg) {
  if (st.done) return;
  if (msg.kind !== 'tap' && msg.kind !== 'motion' && msg.kind !== 'shake') return;
  if (st.press[p.id] == null) return;
  if (st.t - st.pressAt[p.id] > 700) st.bursts[p.id] = (st.bursts[p.id] || 0) + 1;
  st.pressAt[p.id] = st.t;
  st.press[p.id] = Math.min(BURST + 12, st.press[p.id] + SHAKE);
  if (st.press[p.id] > BURST && !st.burstDone && st.t - st.pressAt[p.id] < 700) {
    st.bursts[p.id] = (st.bursts[p.id] || 0);
    st.burstDone = false;
  }
}

const teamBest = (room, st, t) => {
  let best = null, bestP = null;
  for (const id of st.parts) {
    const p = room.players[id];
    if (!p || p.team !== t) continue;
    const v = st.press[id] || 0;
    if (best == null || v > best) { best = v; bestP = id; }
  }
  return { v: best || 0, id: bestP };
};

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  const s = dt / 1000;
  for (const id of st.parts) {
    const since = st.t - (st.pressAt[id] != null ? st.pressAt[id] : -GRACE);
    if (st.press[id] > 0) st.press[id] = Math.max(0, st.press[id] - DECAY * s * (since > 260 ? 1.7 : 1));
    if (st.press[id] > BURST && since > 200) {
      st.press[id] = BURST - BURST_LOSS;
      st.bursts[id] = (st.bursts[id] || 0);
      st.burstDone = true;
      st.pressAt[id] = st.t + 500;   /* a burst locks the phone for a beat so the burst is readable */
    }
  }
  for (const t of S.TEAM_IDS) {
    const b = teamBest(room, st, t);
    if (b.v >= TARGET && !st.win) { st.win = t; st.winAt = st.t; st.done = true; }
  }
  if (st.t >= DURATION) st.done = true;
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const table = S.TEAM_IDS.map(t => {
    const b = teamBest(room, st, t);
    return { team: t, value: Math.round(b.v), best: b.v };
  }).sort((a, b) => b.value - a.value);
  const byTeam = {};
  for (const id of st.parts) {
    const p = room.players[id]; if (!p) continue;
    const T = byTeam[p.team] || (byTeam[p.team] = { team: p.team, score: 0, best: 0, n: 0 });
    T.n++;
    T.score += st.press[id] || 0;
    T.best = Math.max(T.best, st.press[id] || 0);
  }
  const teams = Object.values(byTeam).sort((a, b) => b.score - a.score);
  const top = table[0];
  return {
    winnerTeam: st.win != null ? st.win : (table[0] && table[1] ? table[0].value === table[1].value ? null : table[0].team : null),
    teamPoints: S.teamTablePoints(table),
    playerPoints: (() => {
      const out = {};
      for (const id of st.parts) {
        const p = room.players[id]; if (!p) continue;
        out[id] = Math.round((st.press[id] || 0) * 1.2 + (st.bursts[id] || 0) * 2);
      }
      return out;
    })(),
    crowns: top ? [{ playerId: (teamBest(room, st, top.team).id), label: 'أقوى هزّة' }] : [],
    table,
    summary: st.win != null ? `وصلت ${S.team(st.win).ar} إلى ${S.ar(TARGET)}٪` : `انتهى الوقت عند ${S.ar(Math.round(table[0] ? table[0].value : 0))}٪`,
  };
}

function hostView(room, st) {
  const rows = S.TEAM_IDS.map(t => {
    const b = teamBest(room, st, t);
    return { team: t, press: Math.round(b.v), burst: (b.id != null && st.burstDone && st.press[b.id] > 0 && st.press[b.id] > BURST) ? 1 : 0 };
  });
  return {
    chars: [],
    game: { id: 'shake', phase: 'press', press: rows, burst: BURST, target: TARGET, burstLine: BURST, win: st.win },
  };
}

function padView(room, st, p) {
  const press = st.press[p.id] || 0;
  const locked = st.pressAt[p.id] > st.t;
  const hint = p.bot ? { kind: 'tap' } : null;
  const overLine = press > BURST;
  return {
    head: 'هزّوا العلبة',
    sub: `${S.ar(Math.round(press))}٪ — الخط عند ${S.ar(TARGET)}٪`,
    controls: { type: 'tap', label: locked ? 'استعد…' : 'اهزّ!', en: locked ? '' : 'SHAKE', disabled: !!locked },
    stats: [{ k: 'الضغط', v: S.ar(Math.round(press)) + '٪' }, { k: 'المدّة', v: S.ar(Math.max(0, Math.round((DURATION - st.t) / 1000))) + 's' }],
    meters: [{ k: 'العلبة', pct: Math.min(100, press), target: BURST }],
    feed: overLine ? 'أووووش!' : (st.burstDone && locked ? 'انفجرت!' : ''),
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'shake', name: { ar: 'هزّوا العلبة', en: 'Shake the Laban' }, emoji: '🥛',
  tagline: 'قبل أن تنفجر', how: 'اهزّوا العلبة حتى تصل إلى ١٠٠٪ — تجاوزوا خط الأمان وستنفجر وتتبعتكم. الشاشة تعرض لكم أي علبة أقرب إلى الهدف.',
  formats: ['team'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
