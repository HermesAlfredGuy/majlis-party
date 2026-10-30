/**
 * Word Race (سباق الكلمات) — three words, every team racing to type the answer first. The letters arrive
 * scrambled on the phone, the word is NOT shown as a whole anywhere the room can read it, and the first
 * team to send a correct answer takes the round. Typing is the great equaliser: a fast thumb beats a fast link,
 * but a wrong guess costs nothing, so nobody is punished for trying.
 */
'use strict';
const S = require('../lib/sim');

const ROUND_MS = 11000, ROUNDS = 3;
const WORDS = [
  { w: 'فانوس', hint: 'يُضاء في رمضان' }, { w: 'مجلس', hint: 'حيث نجتمع' }, { w: 'دلة', hint: 'القهوة العربية' },
  { w: 'صقر', hint: 'طائر الصحراء' }, { w: 'نخلة', hint: 'شجرة التمر' }, { w: 'سدو', hint: 'نسيج الجدّات' },
  { w: 'عود', hint: 'رائحة المجلس' }, { w: 'خنجر', hint: 'زينة الرجل' }, { w: 'بخور', hint: 'دخان الضيافة' },
  { w: 'مجلّس', hint: 'الوسادة والدكة' },
];

function norm(s) {
  return String(s || '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[إأآا]/g, 'ا').replace(/[ىي]/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\u0621-\u064A]/g, '')
    .trim();
}

function scramble(word, rng) {
  const a = word.split('');
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  const out = a.join('');
  return out === word ? scramble(word, rng) : out;
}

function create(room, opts) {
  const rng = S.mulberry32(opts && opts.seed ? opts.seed : 53);
  const players = S.participants(room).sort((a, b) => a.joinedAt - b.joinedAt);
  const teams = Array.from(new Set(players.map(p => p.team))).sort((a, b) => a - b);
  const pool = WORDS.slice().sort(() => rng() - 0.5).slice(0, ROUNDS);
  const st = { t: 0, done: false, rng, round: 0, phaseT: 0, words: pool, scramble: '', scores: {}, winner: null, solvedBy: {}, attempts: 0, parts: players.map(p => p.id), teams };
  teams.forEach(t => { st.scores[t] = 0; });
  st.scramble = scramble(pool[0].w, rng);
  return st;
}

function onInput(room, st, p, msg) {
  if (st.done || st.winner != null) return;
  if (msg.kind !== 'word' && msg.kind !== 'answer') return;
  st.attempts++;
  const guess = norm(msg.text || msg.word);
  const target = norm(st.words[Math.min(st.round, st.words.length - 1)].w);
  if (!guess || guess !== target) return;
  st.winner = p.team;
  st.solvedBy[p.team] = { id: p.id, nick: p.nick, at: st.phaseT };
  st.scores[p.team] = (st.scores[p.team] || 0) + 1;
}

function tick(room, st, dt) {
  if (st.done) return;
  st.t += dt; st.phaseT += dt;
  if (st.phaseT >= ROUND_MS) {
    st.round++;
    if (st.round >= ROUNDS) { st.done = true; return; }
    st.phaseT = 0; st.winner = null;
    st.scramble = scramble(st.words[st.round].w, st.rng);
  }
}

const over = (room, st) => !!st.done;

function finish(room, st) {
  const table = Object.entries(st.scores).map(([t, v]) => ({ team: +t, value: v })).sort((a, b) => b.value - a.value);
  const teamPoints = {}; table.forEach((r, i) => { teamPoints[r.team] = S.placePoints(i); });
  const playerPoints = {}; for (const id of st.parts) playerPoints[id] = 5 + (st.scores[room.players[id].team] || 0) * 12;
  let best = null;
  for (const t of Object.keys(st.solvedBy)) { const s = st.solvedBy[t]; if (!best || s.at < best.at) best = { ...s, team: +t }; }
  const win = table[0];
  return {
    winnerTeam: win ? win.team : null,
    summary: win ? `${S.team(win.team).ar}: ${S.ar(win.value)}/${S.ar(ROUNDS)}` : 'لا أحد',
    teamPoints, playerPoints,
    crowns: best ? [{ playerId: best.id, label: 'أسرع إصبع', detail: best.nick }] : [],
    table: table.map(r => ({ team: r.team, value: r.value })),
  };
}

function hostView(room, st) {
  return {
    chars: [],
    game: {
      id: 'wordrace', phase: st.winner != null ? 'solved' : 'race', round: Math.min(ROUNDS, st.round + 1), rounds: ROUNDS, scrambled: st.scramble, hint: st.words[Math.min(st.round, st.words.length - 1)].hint,
      winner: st.winner, solvedBy: st.solvedBy, scores: Object.entries(st.scores).map(([t, v]) => ({ team: +t, v })), attempts: st.attempts,
    },
    hud: { left: Math.max(0, Math.ceil((ROUND_MS - st.phaseT) / 1000)), alive: st.parts.length },
  };
}

function padView(room, st, p) {
  const solved = st.winner === p.team;
  return {
    head: st.winner != null ? (solved ? 'أحسنتم! 🎉' : 'فريق آخر سبقكم') : 'رتّب الحروف',
    sub: st.words[Math.min(st.round, st.words.length - 1)].hint,
    controls: { type: 'word', disabled: st.winner != null || st.done, value: '' },
    stats: [{ k: 'الجولة', v: `${S.ar(st.round + 1)}/${S.ar(ROUNDS)}` }, { k: 'نقاطكم', v: S.ar(st.scores[p.team] || 0) }],
    meters: [{ label: 'الوقت', pct: Math.round(Math.max(0, 1 - st.phaseT / ROUND_MS) * 100) }],
    feed: st.scramble,
    team: { i: (p.team || 1) - 1 },
    bot: p.bot && st.winner == null ? { kind: 'word', text: st.words[Math.min(st.round, st.words.length - 1)].w } : null,
  };
}

module.exports = {
  id: 'wordrace', name: { ar: 'سباق الكلمات', en: 'Word Race' }, emoji: '🔤',
  tagline: 'رتّب الحروف واكتبها', how: 'ثلاث كلمات مبعثرة الحروف. الفريق الأول الذي يكتب الكلمة صحيحة يأخذ الجولة.',
  formats: ['team'], durationMs: ROUNDS * ROUND_MS, create, onStart: () => {}, onInput, tick, over, finish, hostView, padView,
};
