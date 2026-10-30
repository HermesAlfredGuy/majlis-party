/**
 * Majlis Marathon Sort (فرز الماراثون) — the WarioWare idea, at a calm pace. Runners come down the road one at
 * a time and the room sends each one to the LEFT or the RIGHT gate. The rule is on screen the whole round and
 * changes twice, announced in advance. No acceleration: every runner gets the same 3.2 s window, so a slow
 * thumb is never punished — a wrong gate is. In team format a team's answer is the majority of its members.
 */
'use strict';
const S = require('../lib/sim');

const DURATION = 47000, RUNNERS = 12, WINDOW = 3200, LEAD = 3000;
const TYPES = [
  { id: 'camel', ar: 'جمل', en: 'CAMEL', emoji: '🐪' },
  { id: 'falcon', ar: 'صقر', en: 'FALCON', emoji: '🦅' },
  { id: 'goat', ar: 'ماعز', en: 'GOAT', emoji: '🐐' },
  { id: 'horse', ar: 'حصان', en: 'HORSE', emoji: '🐎' },
];
const TYPE = {}; for (const t of TYPES) TYPE[t.id] = t;
/* Three readable rules; rule 0 runs for the first five runners, then 1, then 2. */
const RULES = [
  { left: ['camel', 'goat'], right: ['falcon', 'horse'] },
  { left: ['falcon'], right: ['camel', 'goat', 'horse'] },
  { left: ['horse', 'falcon'], right: ['camel', 'goat'] },
];
const CHANGE_AT = [5, 9];
const ruleText = (r) => ({ left: r.left.map(id => TYPE[id].emoji + ' ' + TYPE[id].ar), right: r.right.map(id => TYPE[id].emoji + ' ' + TYPE[id].ar) });
const sideOf = (rule, type) => (rule.left.includes(type) ? 'left' : 'right');

function create(room, opts) {
  const rng = S.mulberry32((opts && opts.seed) || 77);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const st = { t: 0, done: false, rng, parts: players.map(p => p.id), players: {}, run: [], idx: -1, resolved: 0, team: {} };
  for (const p of players) st.players[p.id] = { id: p.id, team: p.team, ans: null, correct: 0, wrong: 0, streak: 0 };
  for (const t of S.TEAM_IDS) st.team[t] = { team: t, correct: 0, answers: 0, last: {}, streak: 0, best: 0 };
  /* runners: the type is drawn from the rule that owns that slot, so every rule is exercised */
  for (let i = 0; i < RUNNERS; i++) {
    const ri = i < CHANGE_AT[0] ? 0 : i < CHANGE_AT[1] ? 1 : 2;
    const pool = RULES[ri].left.concat(RULES[ri].right);
    const type = pool[Math.floor(rng() * pool.length) % pool.length];
    st.run.push({ i, ri, type, side: sideOf(RULES[ri], type), x: (rng() - 0.5) * 0.5, resolved: false, bounce: 0, right: 0, wrong: 0 });
  }
  return st;
}

const curRun = (st) => (st.idx >= 0 && st.idx < st.run.length ? st.run[st.idx] : null);
const curRule = (st) => RULES[st.idx >= 0 ? st.run[Math.min(st.idx, st.run.length - 1)].ri : 0];

function resolve(room, st, r) {
  if (r.resolved) return;
  r.resolved = true; st.resolved++;
  /* individual tally */
  for (const id of st.parts) {
    const q = st.players[id]; const p = room.players[id];
    if (!q || q.ans == null) { q.streak = 0; continue; }
    if (q.ans === r.side) { q.correct++; q.streak++; r.right++; } else { q.wrong++; q.streak = 0; r.wrong++; }
  }
  /* team answer = the majority of that team's thumbs */
  for (const t of S.TEAM_IDS) {
    const T = st.team[t];
    const votes = { left: 0, right: 0 };
    let n = 0;
    for (const id of st.parts) { const q = st.players[id]; if (!q || q.team !== t || q.ans == null) continue; votes[q.ans]++; n++; }
    if (!n) { T.streak = 0; continue; }
    const side = votes.right > votes.left ? 'right' : votes.left > votes.right ? 'left' : null;
    T.last = { side, split: votes };
    if (side === r.side) { T.correct++; T.answers++; T.streak++; T.best = Math.max(T.best, T.streak); }
    else { T.answers++; T.streak = 0; r.bounce = side ? side : 'split'; }
  }
  for (const id of st.parts) { const q = st.players[id]; if (q) q.ans = null; }
}

function onInput(room, st, p, msg) {
  if (st.done) return;
  const q = st.players[p.id]; if (!q) return;
  const r = curRun(st); if (!r || r.resolved) return;
  const side = msg.kind === 'side' ? msg.side : (msg.kind === 'vote' ? msg.dir : null);
  if (side !== 'left' && side !== 'right') return;
  q.ans = side;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt;
  const idx = Math.floor((st.t - LEAD) / WINDOW);
  if (idx !== st.idx) {
    if (st.idx >= 0 && st.idx < st.run.length) resolve(room, st, st.run[st.idx]);
    st.idx = idx;
    if (idx >= 0 && idx < st.run.length) { const r = st.run[idx]; r.openedAt = st.t; }
  }
  if (st.t >= DURATION) { if (st.idx >= 0 && st.idx < st.run.length) resolve(room, st, st.run[st.idx]); st.done = true; }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const rows = S.TEAM_IDS.map(t => {
    const T = st.team[t];
    return { team: t, value: Math.round((T.answers ? T.correct / T.answers : 0) * 100), correct: T.correct, answers: T.answers, best: T.best };
  }).filter(r => r.answers > 0);
  rows.sort((a, b) => b.correct - a.correct || b.value - a.value);
  const teamPoints = {}; rows.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {};
  for (const id of st.parts) { const q = st.players[id]; if (q) playerPoints[id] = 10 + q.correct * 6; }
  /* the sharpest thumb of the night */
  const top = st.parts.slice().sort((a, b) => st.players[b].correct - st.players[a].correct)[0];
  const win = rows[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${win.correct}/${win.answers} بوابة صحيحة` : 'انتهى الطريق',
    teamPoints, playerPoints,
    crowns: top ? [{ playerId: top, label: 'عين الصقر', detail: `${st.players[top].correct} من ${st.resolved}` }] : [],
    table: rows.map(r => ({ team: r.team, value: r.correct, detail: r.answers + ' جولة' })),
  };
}

function hostView(room, st) {
  const r = curRun(st);
  const rule = curRule(st);
  const next = st.idx >= 0 && CHANGE_AT.includes(st.idx + 1) ? ruleText(RULES[st.run[st.idx + 1].ri]) : null;
  return {
    game: {
      id: 'marathon', phase: r ? (r.resolved ? 'gate' : 'run') : 'lead',
      rule: ruleText(rule), ruleIdx: r ? r.ri : 0,
      next: next ? { at: CHANGE_AT.includes(st.idx + 1) ? st.idx + 1 : null, rule: next } : null,
      runner: r ? { type: r.type, emoji: TYPE[r.type].emoji, ar: TYPE[r.type].ar, side: r.side, x: r.x, prog: Math.min(1, Math.max(0, (st.t - LEAD - (st.idx * WINDOW)) / WINDOW)), bounce: r.bounce, right: r.right, wrong: r.wrong } : null,
      teams: S.TEAM_IDS.map(t => ({ team: t, correct: st.team[t].correct, streak: st.team[t].streak, last: st.team[t].last })),
      index: st.idx, total: st.run.length,
    },
    hud: { left: Math.max(0, Math.ceil((DURATION - st.t) / 1000)), runners: st.resolved + '/' + st.run.length },
  };
}

function padView(room, st, p) {
  const q = st.players[p.id];
  if (!q) return { head: 'الجولة القادمة', controls: { type: 'none' }, stats: [], team: { i: (p.team || 1) - 1 } };
  const r = curRun(st);
  const rule = curRule(st);
  let hint = null;
  if (p.bot && r && !r.resolved) {
    /* bots are honest but not perfect: 88 % right, and they answer like a thumb, 400–900 ms after the runner shows */
    const seed = (r.i * 7919 + (parseInt(String(p.id).replace(/\D/g, ''), 10) || 1) * 31) % 100;
    const good = seed < 62;
    const side = good ? r.side : (r.side === 'left' ? 'right' : 'left');
    if (!q.ans && st.t - (r.openedAt || 0) > 400 + (seed % 5) * 90) hint = { kind: 'side', side };
  }
  return {
    head: r ? `${TYPE[r.type].emoji} ${TYPE[r.type].ar}` : 'استعد…',
    sub: `يسار: ${ruleText(rule).left.join('، ')} — يمين: ${ruleText(rule).right.join('، ')}`,
    controls: { type: 'side', disabled: !r || r.resolved || st.done, left: 'يسار', right: 'يمين', chosen: q.ans },
    stats: [{ k: 'صحيح', v: S.ar(q.correct) }, { k: 'خطأ', v: S.ar(q.wrong) }, { k: 'متسلسل', v: S.ar(q.streak) }],
    meters: [], feed: q.streak >= 3 ? '🔥 ' + S.ar(q.streak) + ' متتالية' : '',
    team: { i: (p.team || 1) - 1 },
    bot: hint,
  };
}

module.exports = {
  id: 'marathon', name: { ar: 'فرز الماراثون', en: 'Majlis Marathon Sort' }, emoji: '🐪',
  tagline: 'أي بوابة؟', how: 'حيوان واحد في كل مرة. أرسله إلى البوابة الصحيحة حسب القاعدة على الشاشة — القاعدة تتغيّر مرتين، والسرعة ثابتة.',
  formats: ['team', 'ffa'], durationMs: DURATION, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
