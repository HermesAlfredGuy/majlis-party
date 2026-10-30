/**
 * Majlis Party (مجلس بارتي) — the party server.
 *
 * One projector, 20-45 phones, TWO teams, a playlist of short minigames. This is a SEPARATE process from the
 * Asir race server: the party runs its own phase machine, wheel, slot and formats (team / 1v1 spotlight /
 * free-for-all). Teams are exactly two — the owner's correction, after six proved to give nobody a side.
 *
 *   /          landing (QR + links)
 *   /host      projector
 *   /play      phone pad
 *   /admin     phone admin (key)  ·  the host page also carries a keyboard admin panel
 *   /api/state JSON snapshot (tests and monitoring)
 *
 * Phases: lobby → wheel → [slot] → announce → countdown → playing → results → board → (next | final)
 *
 * The BOARD is the party game: after every minigame both teams roll, walk the sixteen-space rug road, bank
 * coins and golden dallahs, and a fork is decided by the phones. Stars win the night; points only set the dice.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { Server } = require('socket.io');
const QR = require('qrcode');
const S = require('./lib/sim');
const B = require('./lib/board');
const PICK = require('./lib/picker');
const GAMES = require('./games');

const PORT = Number(process.env.PORT || 9520);
const ADMIN_KEY = String(process.env.ADMIN_KEY || '').toUpperCase();
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const ROOT = __dirname;
const PUB = path.join(__dirname, 'public');

const DUR = { wheel: 6200, slot: 3800, announce: 4000, countdown: 3000, results: 8500, board: 9000, vote: 11000 };
const FORMAT_LABEL = {
  team: { ar: 'فريق ضد فريق', en: 'TEAM vs TEAM', short: 'TEAM' },
  spotlight: { ar: 'نجم واحد', en: '1v1 SPOTLIGHT', short: '1v1' },
  ffa: { ar: 'كلٌّ لنفسه', en: 'FREE-FOR-ALL', short: 'FFA' },
};
const TICK = 50, PAD_HZ = 5;
const SESSIONS = { short: 5, standard: 9 };
const DEFAULT_LEN = SESSIONS.standard;

function lanIP() {
  if (PUBLIC_URL) return PUBLIC_URL;
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) for (const i of ifs[name]) if (i.family === 'IPv4' && !i.internal) return 'http://' + i.address + ':' + PORT;
  return 'http://localhost:' + PORT;
}
const CODE = String(process.env.JOIN_CODE || (1000 + Math.floor(Math.random() * 9000))).slice(0, 4);

const room = {
  code: CODE, phase: 'lobby', at: Date.now(), mode: null, gameState: null, idx: -1,
  pool: GAMES.ids(), playlist: [], results: [], final: null, paused: false,
  players: {}, bySocket: new Map(), tokens: new Map(), hosts: new Set(), admins: new Set(),
  scores: {}, history: [], seq: 0, startedAt: 0, awards: [], pickCount: {}, lastPair: [],
  match: null, wheel: null, slot: null, settings: { length: DEFAULT_LEN, formats: true, session: 'standard' },
  board: B.fresh(), pickPool: [], lastWinner: null, cheers: { 1: 0, 2: 0 },
};
for (const t of S.TEAM_IDS) room.scores[t] = 0;

const log = (m) => console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + m);
const cleanNick = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || 'لاعب';
const connected = () => Object.values(room.players).filter(p => p.connected);
const active = () => connected().filter(p => !p.afk);
const teamCount = (i) => connected().filter(p => p.team === i).length;
function autoTeam() {
  let best = S.TEAM_IDS[0], n = Infinity;
  for (const i of S.TEAM_IDS) { const c = teamCount(i); if (c < n) { n = c; best = i; } }
  return best;
}
function newPlayer(nick, bot) {
  const id = crypto.randomBytes(5).toString('hex');
  const token = crypto.randomBytes(12).toString('hex');
  const p = {
    id, token, nick, team: autoTeam(), score: 0, connected: true, bot: !!bot, afk: false,
    games: 0, crowns: 0, joinedAt: Date.now(), lastInputTs: 0, inputs: 0, idleGames: 0, bet: null,
  };
  room.players[id] = p; room.tokens.set(token, id);
  room.pickCount[id] = room.pickCount[id] || 0;
  return p;
}
function shuffled(a, rng) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

/* ------------------------------------------------------------------ party flow */
function phaseLeft(now) {
  const d = DUR[room.phase];
  return d ? Math.max(0, d - (now - room.at)) : 0;
}
function poolMeta() {
  return room.pool.filter(id => GAMES[id]).map(id => ({ id, ar: GAMES[id].name.ar, en: GAMES[id].name.en, emoji: GAMES[id].emoji }));
}
function beginParty(opts) {
  opts = opts || {};
  if (opts.playlist && opts.playlist.length) room.pool = opts.playlist.filter(id => GAMES[id]);
  if (!room.pool.length) room.pool = GAMES.ids();
  if (opts.length) room.settings.length = Math.max(1, Math.min(20, Number(opts.length)));
  room.playlist = []; room.results = []; room.final = null; room.idx = -1; room.history = [];
  room.awards = []; room.lastPair = []; room.match = null; room.wheel = null; room.slot = null;
  room.board = B.fresh(); room.pickPool = active().map(p => p.id); room.lastWinner = null;
  room.cheers = { 1: 0, 2: 0 };
  room.startedAt = Date.now();
  for (const t of S.TEAM_IDS) room.scores[t] = 0;
  Object.values(room.players).forEach(p => { p.score = 0; p.games = 0; p.crowns = 0; p.bet = null; p.idleGames = 0; });
  for (const k of Object.keys(room.pickCount)) room.pickCount[k] = 0;
  openWheel();
}

/* Weighted draw: never repeat the last four games, and rotate the format so the show breathes. */
function drawGame() {
  const recent = room.playlist.slice(-4);
  let candidates = room.pool.filter(id => !recent.includes(id));
  if (!candidates.length) candidates = room.pool.slice();
  const lastFormat = room.match ? room.match.format : null;
  const withAlt = candidates.filter(id => (GAMES[id].formats || ['team']).some(f => f !== lastFormat));
  if (withAlt.length) candidates = withAlt;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
function drawFormat(game) {
  const opts = (game.formats || ['team']).slice();
  if (!room.settings.formats) return opts.includes('team') ? 'team' : opts[0];
  const count = { team: 0, spotlight: 0, ffa: 0 };
  for (const r of room.results) if (r.format) count[r.format] = (count[r.format] || 0) + 1;
  const last = room.match ? room.match.format : null;
  let usable = opts.filter(f => f !== last);
  if (!usable.length) usable = opts;
  const min = Math.min.apply(null, usable.map(f => count[f] || 0));
  const tie = usable.filter(f => (count[f] || 0) === min);
  return tie[Math.floor(Math.random() * tie.length)];
}
function drawPair() {
  /* one pool per session (lib/picker): everyone gets a turn before anyone repeats, and the order inside the
     pool is random so nobody can predict or game it */
  const { pair, pool } = PICK.draw(active(), room.pickPool, Math.random);
  room.pickPool = pool;
  if (!pair || pair.length < 2) return null;
  const [a, b] = pair;
  room.pickCount[a.id] = (room.pickCount[a.id] || 0) + 1;
  room.pickCount[b.id] = (room.pickCount[b.id] || 0) + 1;
  room.lastPair = [a.id, b.id];
  return [a, b];
}
function openWheel(forceId) {
  if (room.idx + 1 >= room.settings.length) { finishParty(); return; }
  room.idx++;
  room.mode = forceId && GAMES[forceId] ? forceId : drawGame();
  if (!room.mode) { finishParty(); return; }
  room.playlist.push(room.mode);
  const g = GAMES[room.mode];
  const format = drawFormat(g);
  room.match = { format, a: null, b: null, bets: {}, called: 0, pair: null };
  room.gameState = null; room.slot = null; room.paused = false;
  if (format === 'spotlight') {
    const pair = drawPair();
    if (pair) {
      room.match.a = pair[0].id; room.match.b = pair[1].id;
      room.match.pair = pair.map(p => ({ id: p.id, nick: p.nick, team: p.team }));
      room.slot = buildSlot(pair);
    } else room.match.format = 'team';
  }
  const order = shuffled(room.pool.slice(), Math.random);
  room.wheel = { target: room.mode, order, index: order.indexOf(room.mode), angles: order.length, startedAt: Date.now() };
  room.phase = 'wheel'; room.at = Date.now(); room.seq++;
  log(`wheel → ${room.mode} (${room.match.format}) #${room.idx + 1}/${room.settings.length}`);
  broadcastLobby();
}

/* Slot machine: ONE REEL PER TEAM. Two teams means two reels, and each reel lands on that team's drawn player —
 * real roster names cycle first, so the hall sees its own nicknames spinning, not random letters. */
function buildSlot(pair) {
  const frames = (p) => {
    const mates = active().filter(q => q.team === p.team && q.id !== p.id).map(q => q.nick);
    const out = [];
    for (let i = 0; i < 14; i++) out.push(mates.length ? mates[i % mates.length] : '—');
    out[out.length - 1] = p.nick;
    return out;
  };
  const reelOf = (p, i) => ({ side: i === 0 ? 'a' : 'b', id: p.id, nick: p.nick, team: p.team, frames: frames(p) });
  const reels = [reelOf(pair[0], 0), reelOf(pair[1], 1)];
  return { reels, a: reels[0], b: reels[1], at: Date.now(), teams: reels.map(r => r.team) };
}
function startPlaying() {
  const g = GAMES[room.mode];
  room.phase = 'playing'; room.at = Date.now(); room.paused = false;
  try { room.gameState = g.create(room, { seed: (Date.now() % 100000) + room.idx * 97 }); }
  catch (e) { console.error('create failed', room.mode, e); room.gameState = null; }
  if (room.gameState && g.onStart) g.onStart(room, room.gameState);
  room.match.called++;
  Object.values(room.players).forEach(p => { p.inputs = 0; });
  room.seq++;
  log(`playing ${room.mode} (${room.match.format}) with ${active().length} players`);
}
function endPlaying(force) {
  const g = GAMES[room.mode];
  let res = {};
  try { res = S.settleResult(room, g.finish(room, room.gameState) || {}); } catch (e) { console.error('finish failed', room.mode, e); }
  const teamPoints = Object.assign({}, res.teamPoints || {});
  let betInfo = null;
  if (room.match && room.match.format === 'spotlight' && res.winnerTeam) {
    const counts = { a: 0, b: 0 }, correct = { a: 0, b: 0 };
    for (const p of Object.values(room.players)) {
      if (!p.bet || !p.connected) continue;
      const side = p.bet === room.match.a ? 'a' : p.bet === room.match.b ? 'b' : null;
      if (!side) continue;
      counts[side]++;
      const winner = side === 'a' ? room.players[room.match.a] : room.players[room.match.b];
      if (winner && winner.team === res.winnerTeam) { correct[side]++; teamPoints[p.team] = (teamPoints[p.team] || 0) + 12; p.score += 20; }
    }
    betInfo = { counts, correct };
  }
  for (const k of Object.keys(teamPoints)) room.scores[k] = (room.scores[k] || 0) + teamPoints[k];
  for (const [pid, n] of Object.entries(res.playerPoints || {})) { const p = room.players[pid]; if (p) { p.score += n; p.games++; } }
  const crowns = (res.crowns || []).map(c => {
    const p = room.players[c.playerId]; if (p) p.crowns++;
    return { nick: p ? p.nick : '—', team: p ? p.team : 1, label: c.label, detail: c.detail || '' };
  });
  const entry = {
    gameId: room.mode, ar: g.name.ar, en: g.name.en, emoji: g.emoji, format: room.match ? room.match.format : 'team',
    formatLabel: FORMAT_LABEL[room.match ? room.match.format : 'team'],
    pair: room.match && room.match.pair ? room.match.pair : null,
    winnerTeam: res.winnerTeam || null, summary: res.summary || '', table: res.table || [],
    teamPoints, crowns, bets: betInfo, forced: !!force, at: Date.now(),
  };
  room.results.push(entry); room.history.push(entry);
  room.awards.push({ type: 'game', entry });
  if (res.winnerTeam) {
    room.lastWinner = res.winnerTeam;
    room.board.coins[res.winnerTeam] += 6;
    for (const t of S.TEAM_IDS) if (t !== res.winnerTeam) room.board.coins[t] += 3;
  }
  for (const p of Object.values(room.players)) {
    if (!p.connected) continue;
    if (p.inputs === 0) p.idleGames = (p.idleGames || 0) + 1; else p.idleGames = 0;
    if (p.idleGames >= 2 && !p.afk) { p.afk = true; log(`afk: ${p.nick}`); }
  }
  room.phase = 'results'; room.at = Date.now(); room.seq++;
  log(`results ${room.mode}: ${entry.summary}`);
  broadcastLobby();
}
function finishParty() {
  const bd = room.board;
  const ranked = S.TEAM_IDS.slice().sort((a, b) =>
    (bd.stars[b] - bd.stars[a]) || (bd.coins[b] - bd.coins[a]) || (room.scores[b] - room.scores[a]) || (bd.pos[b] - bd.pos[a]));
  const mvp = Object.values(room.players).sort((a, b) => b.score - a.score)[0];
  room.final = {
    ranked: ranked.map(i => ({
      team: i, score: room.scores[i], players: connected().filter(p => p.team === i).length,
      stars: bd.stars[i], coins: bd.coins[i], pos: bd.pos[i],
    })),
    winnerTeam: ranked[0],
    mvp: mvp ? { nick: mvp.nick, score: mvp.score, team: mvp.team } : null,
    games: room.results.length,
  };
  room.phase = 'final'; room.at = Date.now(); room.seq++;
  log(`final: team ${ranked[0]} with ${room.scores[ranked[0]]} points`);
  broadcastLobby();
}

/* ------------------------------------------------------------------ the board */
function enterBoard() {
  const b = room.board;
  const winner = room.lastWinner || (room.results[room.results.length - 1] || {}).winnerTeam || S.TEAM_IDS[0];
  B.rollTurn(b, winner, Math.random);
  const landings = [];
  for (const t of S.TEAM_IDS) { B.move(b, t, b.turn.steps[t]); landings.push(B.land(b, t)); }
  b.landings = landings;
  b.done = false;
  const forks = landings.filter(l => l.kind === 'fork');
  b.vote = forks.length ? {
    options: [{ id: 'short', ar: 'الطريق المختصر', note: '٣ خطوات − ٢ قطعة' }, { id: 'long', ar: 'السوق الطويل', note: '٥ خطوات' }],
    hits: { short: 0, long: 0 }, teams: forks.map(f => f.team), at: Date.now(), result: null,
  } : null;
  for (const p of Object.values(room.players)) p.voteChoice = null;
  room.phase = 'board'; room.at = Date.now(); room.seq++;
  log(`board: ${landings.map(l => 'T' + l.team + ' +' + b.turn.steps[l.team] + ' → ' + l.kind).join(' | ')}`);
  broadcastLobby();
}
function resolveVote() {
  const b = room.board;
  if (!b.vote || b.vote.result) return null;
  b.vote.result = B.voteResult(b, b.vote.hits);
  for (const t of b.vote.teams) { const l = B.applyFork(b, t, b.vote.result.choice); b.landings.push(l); }
  broadcastLobby();
  return b.vote.result;
}
function endBoard() {
  resolveVote();
  room.board.done = true;
  openWheel();
}

/* ------------------------------------------------------------------ views */
function teamsView() {
  return S.TEAMS.map(t => ({
    i: t.i, hex: t.hex, dark: t.dark, ar: t.ar, en: t.en, crest: t.crest || '',
    score: room.scores[t.i] || 0,
    players: connected().filter(p => p.team === t.i).length,
    afk: connected().filter(p => p.team === t.i && p.afk).length,
  }));
}
function gameMeta() {
  if (!room.mode) return null;
  const g = GAMES[room.mode];
  return { id: g.id, ar: g.name.ar, en: g.name.en, emoji: g.emoji, tagline: g.tagline, how: g.how, formats: g.formats, viewHz: g.viewHz || 0 };
}
const joinURL = () => lanIP() + '/play?c=' + room.code;
function matchView() {
  const m = room.match; if (!m) return null;
  const pair = m.pair ? m.pair.map(p => ({ id: p.id, nick: p.nick, team: p.team, hex: S.team(p.team).hex, ar: S.team(p.team).ar })) : null;
  const bets = { a: 0, b: 0 };
  for (const p of Object.values(room.players)) {
    if (p.bet === m.a) bets.a++; else if (p.bet === m.b) bets.b++;
  }
  return { format: m.format, label: FORMAT_LABEL[m.format] || FORMAT_LABEL.team, pair, bets, open: ['wheel', 'slot', 'announce', 'countdown'].includes(room.phase) };
}
function hostPayload(now) {
  const g = room.mode && GAMES[room.mode];
  let view = null;
  if (room.phase === 'playing' && room.gameState && g) { try { view = g.hostView(room, room.gameState); } catch (e) { view = null; } }
  const last = room.results[room.results.length - 1] || null;
  return {
    phase: room.phase, mode: room.mode, game: gameMeta(), left: phaseLeft(now), phaseT: now - room.at,
    paused: room.paused, view, teams: teamsView(), players: connected().length, activeN: active().length,
    playlist: poolMeta(), idx: room.idx, length: room.settings.length, results: last, final: room.final,
    match: matchView(), wheel: room.phase === 'wheel' ? room.wheel : null,
    slot: (room.phase === 'slot' || (room.phase === 'announce' && room.match && room.match.format === 'spotlight')) ? room.slot : null,
    board: {
      coins: room.board.coins, stars: room.board.stars, pos: room.board.pos,
      turn: room.board.turn, vote: room.board.vote, landings: room.board.landings || [],
      log: room.board.log.slice(-4), cheers: room.cheers,
    },
    session: room.settings.session, seq: room.seq, code: room.code, joinUrl: joinURL(), t: now,
    recent: room.history.slice(-8).map(r => ({ gameId: r.gameId, ar: r.ar, format: r.format, winnerTeam: r.winnerTeam })),
  };
}
function padPayload(p, now) {
  const g = room.mode && GAMES[room.mode];
  let view = null;
  if (room.phase === 'playing' && room.gameState && g) { try { view = g.padView(room, room.gameState, p); } catch (e) { view = null; } }
  const ai = S.team(p.team);
  const last = room.results[room.results.length - 1] || null;
  const m = room.match;
  const pairIds = m && m.pair ? m.pair.map(x => x.id) : [];
  return {
    phase: room.phase, mode: room.mode, game: gameMeta(), left: phaseLeft(now), paused: room.paused,
    team: { i: ai.i, hex: ai.hex, ar: ai.ar, en: ai.en, score: room.scores[ai.i] || 0 },
    view, match: matchView(),
    you: { nick: p.nick, score: p.score, crowns: p.crowns, afk: !!p.afk, spotlight: pairIds.includes(p.id) && m.format === 'spotlight', bet: p.bet || null },
    results: (room.phase === 'results' || room.phase === 'final') ? last : null,
    final: room.phase === 'final' ? room.final : null, players: connected().length,
    slot: room.phase === 'slot' ? room.slot : null,
    board: room.phase === 'board' ? {
      stars: room.board.stars, coins: room.board.coins, pos: room.board.pos,
      vote: room.board.vote ? { options: room.board.vote.options, hits: room.board.vote.hits, teams: room.board.vote.teams, mine: p.voteChoice || null } : null,
    } : null,
    /* a phone with nothing to press is a dead phone: cheering is always available while a round runs */
    cheer: (room.phase === 'playing' && (!view || view.watching || !view.controls || !view.controls.type || view.controls.type === 'none' || view.controls.disabled))
      ? { team: p.team, count: room.cheers[p.team] || 0, mine: p.cheers || 0 } : null,
    scoreboard: S.TEAMS.map(t => ({ i: t.i, hex: t.hex, ar: t.ar, score: room.scores[t.i] || 0 })).sort((a, b) => b.score - a.score),
  };
}

/* ------------------------------------------------------------------ http */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' };
function send(res, code, body, type = 'text/html; charset=utf-8') { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(body); }
function serve(res, base, rel) {
  const full = path.join(base, rel.replace(/^\/+/, ''));
  if (!full.startsWith(base)) return send(res, 403, 'no');
  fs.readFile(full, (e, buf) => e ? send(res, 404, 'not found') : send(res, 200, buf, MIME[path.extname(full).toLowerCase()] || 'application/octet-stream'));
}
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  if (p === '/api/state') return send(res, 200, JSON.stringify(hostPayload(Date.now())), MIME['.json']);
  if (p === '/api/games') return send(res, 200, JSON.stringify(GAMES.list()), MIME['.json']);
  if (p === '/qr.svg' || p === '/qr.png') {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
    const fhost = req.headers['x-forwarded-host'] || req.headers.host || '';
    const base = PUBLIC_URL ? PUBLIC_URL : (!fhost || /^(localhost|127\.|0\.0\.0\.0)/.test(String(fhost)) ? lanIP() : proto + '://' + fhost);
    const target = base.replace(/\/+$/, '') + '/play?c=' + room.code;
    if (p === '/qr.png') { const buf = await QR.toBuffer(target, { width: 720, margin: 1, color: { dark: '#20183a', light: '#f6ead2' } }); return send(res, 200, buf, 'image/png'); }
    const svg = await QR.toString(target, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#20183a', light: '#f6ead2' } });
    res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' }); return res.end(svg);
  }
  if (p === '/play' || p === '/play/') return serve(res, PUB, 'play.html');
  if (p === '/host' || p === '/host/') return serve(res, PUB, 'host.html');
  if (p === '/admin' || p === '/admin/') return serve(res, PUB, 'admin.html');
  if (p === '/' || p === '/index.html') return serve(res, PUB, 'index.html');
  /* the party's own webfonts live beside its pages; everything else under /vendor (three.js) comes from the
     shared public tree */
  if (/^\/vendor\/(baloo|tajawal)-/.test(p)) return serve(res, PUB, p.replace('/vendor/', 'vendor/'));
  if (p.startsWith('/vendor/') || p.startsWith('/textures/') || p.startsWith('/models/')) return serve(res, path.join(ROOT, 'public'), p);
  return serve(res, PUB, p);
});

const io = new Server(server, { cors: { origin: '*' }, pingInterval: 20000, pingTimeout: 25000, maxHttpBufferSize: 5e5 });

function adminCommand(msg) {
  const a = msg.action;
  const out = (r) => Object.assign({ ok: true }, r || {});
  if (a === 'party_start') { beginParty({ playlist: msg.playlist, length: msg.length }); return out({ text: 'party started', pool: room.pool }); }
  if (a === 'pause_toggle') { room.paused = !room.paused; broadcastLobby(); return out({ paused: room.paused }); }
  if (a === 'formats') {
    /* every round is TEAM vs TEAM when this is off — a hall of 40 phones does not want two of them duelling */
    room.settings.formats = msg.on !== false;
    broadcastLobby(); return out({ formats: room.settings.formats });
  }
  if (a === 'skip') {
    if (room.phase === 'playing') endPlaying(true);
    else { room.phase = 'results'; room.at = Date.now() - DUR.results; }
    return out({ text: 'skipped', phase: room.phase, mode: room.mode });
  }
  if (a === 'end_now') { if (room.phase === 'playing') endPlaying(true); return out({ text: 'ended' }); }
  if (a === 'restart') {
    if (!room.mode) return out({ ok: false, error: 'no game' });
    room.phase = 'countdown'; room.at = Date.now(); room.gameState = null; room.seq++;
    return out({ text: 'restarting ' + room.mode });
  }
  if (a === 'respin') { if (room.phase === 'wheel') { openWheel(); return out({ text: 'respun' }); } return out({ ok: false, error: 'not on the wheel' }); }
  if (a === 'pick') {
    if (!GAMES[msg.id]) return out({ ok: false, error: 'unknown game' });
    if (room.phase === 'playing') endPlaying(true);
    room.idx = Math.max(-1, room.idx - 1);
    openWheel(msg.id);
    return out({ text: 'picked ' + msg.id });
  }
  if (a === 'reroll') {
    if (!room.match || room.match.format !== 'spotlight') return out({ ok: false, error: 'not a spotlight' });
    const pair = drawPair(); if (!pair) return out({ ok: false, error: 'not enough players' });
    room.match.a = pair[0].id; room.match.b = pair[1].id;
    room.match.pair = pair.map(p => ({ id: p.id, nick: p.nick, team: p.team }));
    room.slot = buildSlot(pair);
    if (room.phase !== 'slot' && room.phase !== 'announce') room.phase = 'slot';
    room.at = Date.now(); broadcastLobby(); return out({ text: 'rerolled' });
  }
  if (a === 'session_set') { room.settings.session = SESSIONS[msg.value] ? msg.value : 'standard'; room.settings.length = SESSIONS[room.settings.session]; broadcastLobby(); return out({ text: room.settings.session }); }
  if (a === 'lobby') { room.phase = 'lobby'; room.mode = null; room.gameState = null; room.final = null; room.at = Date.now(); room.seq++; broadcastLobby(); return out({ text: 'lobby' }); }
  if (a === 'points') {
    const t = Number(msg.team), d = Math.round(Number(msg.delta) || 0);
    if (!S.TEAM_IDS.includes(t) || !d) return out({ ok: false, error: 'bad team/delta' });
    room.scores[t] = Math.max(0, (room.scores[t] || 0) + d);
    room.awards.push({ type: 'admin', team: t, delta: d, reason: String(msg.reason || '').slice(0, 40), at: Date.now() });
    broadcastLobby(); return out({ text: `team ${t} ${d > 0 ? '+' : ''}${d}`, scores: room.scores });
  }
  if (a === 'undo') {
    const last = room.awards.pop();
    if (!last) return out({ ok: false, error: 'nothing to undo' });
    if (last.type === 'admin') room.scores[last.team] = Math.max(0, (room.scores[last.team] || 0) - last.delta);
    else if (last.type === 'game') for (const [k, v] of Object.entries(last.entry.teamPoints || {})) room.scores[k] = Math.max(0, (room.scores[k] || 0) - v);
    room.results.pop(); broadcastLobby(); return out({ text: 'undone' });
  }
  if (a === 'afk') {
    const p = room.players[msg.playerId]; if (!p) return out({ ok: false, error: 'no player' });
    p.afk = msg.afk !== false; p.idleGames = p.afk ? 2 : 0;
    broadcastLobby(); return out({ text: (p.afk ? 'AFK ' : 'back ') + p.nick });
  }
  if (a === 'kick') {
    const p = room.players[msg.playerId]; if (!p) return out({ ok: false, error: 'no player' });
    p.connected = false; p.kicked = true;
    const ks = p.socketId && io.sockets.sockets.get(p.socketId);
    if (ks) { ks.emit('kicked', { reason: 'kick' }); ks.disconnect(true); }
    broadcastLobby(); return out({ text: 'kicked ' + p.nick });
  }
  if (a === 'move_team') {
    const p = room.players[msg.playerId]; if (!p) return out({ ok: false, error: 'no player' });
    const t = Number(msg.team); if (!S.TEAM_IDS.includes(t)) return out({ ok: false, error: 'bad team' });
    p.team = t; broadcastLobby(); return out({ text: p.nick + ' → team ' + t });
  }
  if (a === 'rebalance') {
    const all = connected().sort((a, b) => a.joinedAt - b.joinedAt);
    all.forEach((p, i) => { p.team = S.TEAM_IDS[i % S.TEAM_IDS.length]; });
    broadcastLobby(); return out({ text: 'rebalanced ' + all.length });
  }
  if (a === 'clear_players') {
    const n = Object.keys(room.players).length;
    for (const [sid] of room.bySocket) { const s = io.sockets.sockets.get(sid); if (s) { s.emit('kicked', { reason: 'reset' }); s.disconnect(true); } }
    room.players = {}; room.tokens = new Map(); room.bySocket = new Map(); room.pickCount = {};
    for (const t of S.TEAM_IDS) room.scores[t] = 0;
    room.phase = 'lobby'; room.mode = null; room.gameState = null; room.results = []; room.idx = -1; room.final = null; room.playlist = [];
    broadcastLobby(); return out({ text: 'cleared ' + n });
  }
  if (a === 'enable') {
    const list = (msg.ids || []).filter(id => GAMES[id]);
    if (!list.length) return out({ ok: false, error: 'empty pool' });
    room.pool = list; broadcastLobby(); return out({ text: 'pool ' + list.length });
  }
  if (a === 'length') { room.settings.length = Math.max(1, Math.min(20, Number(msg.value) || SESSIONS.standard)); broadcastLobby(); return out({ text: 'length ' + room.settings.length }); }
  if (a === 'session') {
    const name = SESSIONS[msg.value] ? msg.value : 'standard';
    room.settings.session = name; room.settings.length = SESSIONS[name];
    broadcastLobby(); return out({ text: 'session ' + name + ' (' + room.settings.length + ' games)' });
  }
  if (a === 'roll') {
    if (room.phase !== 'board') return out({ ok: false, error: 'no board turn' });
    if (room.board.vote && !room.board.vote.result) resolveVote(); else room.at = Date.now() - DUR.board;
    return out({ text: 'board advanced' });
  }
  if (a === 'board') { if (room.phase === 'playing') endPlaying(true); enterBoard(); return out({ text: 'board opened' }); }
  /* force the fork vote (a team may not land on space 8 in a demo); also how the vote is demoed at a party */
  if (a === 'fork') {
    if (room.phase !== 'board') { if (room.phase === 'playing') endPlaying(true); enterBoard(); }
    room.board.vote = {
      options: [{ id: 'short', ar: 'الطريق المختصر', note: '٣ خطوات − ٢ قطعة' }, { id: 'long', ar: 'السوق الطويل', note: '٥ خطوات' }],
      hits: { short: 0, long: 0 }, teams: [1, 2], at: Date.now(), result: null,
    };
    for (const p of Object.values(room.players)) p.voteChoice = null;
    room.phase = 'board'; room.at = Date.now(); room.seq++; broadcastLobby();
    return out({ text: 'fork vote open' });
  }
  if (a === 'players') return out({ players: Object.values(room.players).map(p => ({ id: p.id, nick: p.nick, team: p.team, connected: p.connected, afk: p.afk, score: p.score, bot: p.bot })) });
  if (a === 'state') return out({ state: hostPayload(Date.now()) });
  return out({ ok: false, error: 'unknown ' + a });
}

io.on('connection', (socket) => {
  socket.on('host_hello', (msg) => {
    socket.join('hosts'); room.hosts.add(socket.id);
    if (msg && msg.admin && (!ADMIN_KEY || String(msg.key || '').toUpperCase() === ADMIN_KEY)) room.admins.add(socket.id);
    socket.emit('hello', { code: room.code, joinUrl: joinURL(), games: poolMeta(), admin: room.admins.has(socket.id) });
    socket.emit('host', hostPayload(Date.now()));
  });
  socket.on('join', (msg, ack) => {
    msg = msg || {};
    /* the code is shown on the projector in Arabic-Indic digits: accept either form from the pad */
    const typed = String(msg.code || '').trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    if (typed && typed !== room.code) return ack && ack({ ok: false, error: 'code' });
    let p = null;
    if (msg.token && room.tokens.has(msg.token)) p = room.players[room.tokens.get(msg.token)];
    if (p) {
      if (p.socketId && room.bySocket.has(p.socketId)) room.bySocket.delete(p.socketId);
      p.connected = true; p.socketId = socket.id; p.kicked = false; p.afk = false; room.bySocket.set(socket.id, p);
    } else {
      let nick = cleanNick(msg.nick), i = 2;
      while (Object.values(room.players).some(q => q.connected && q.nick === nick)) nick = cleanNick(msg.nick) + ' ' + (i++);
      p = newPlayer(nick, msg.bot);
      p.socketId = socket.id; room.bySocket.set(socket.id, p);
    }
    socket.data.pid = p.id;
    ack && ack({ ok: true, playerId: p.id, token: p.token, nick: p.nick, team: p.team, phase: room.phase });
    socket.emit('hello', { code: room.code, joinUrl: joinURL() });
    socket.emit('pad', padPayload(p, Date.now()));
    broadcastLobby();
  });
  socket.on('bet', (msg) => {
    const p = room.bySocket.get(socket.id); if (!p || !room.match || room.match.format !== 'spotlight') return;
    if (!['wheel', 'slot', 'announce', 'countdown'].includes(room.phase)) return;
    const side = (msg || {}).side;
    const target = side === 'a' ? room.match.a : side === 'b' ? room.match.b : null;
    if (!target) return;
    p.bet = target; p.inputs++;
    broadcastLobby();
  });
  socket.on('vote', (msg) => {
    const p = room.bySocket.get(socket.id); if (!p) return;
    const b = room.board;
    if (room.phase !== 'board' || !b.vote || b.vote.result) return;
    const id = String((msg || {}).id || '');
    if (!b.vote.options.some(o => o.id === id)) return;
    if (p.voteChoice === id) return;
    if (p.voteChoice) b.vote.hits[p.voteChoice] = Math.max(0, (b.vote.hits[p.voteChoice] || 0) - 1);
    p.voteChoice = id; p.inputs++;
    b.vote.hits[id] = (b.vote.hits[id] || 0) + 1;
    broadcastLobby();
  });
  socket.on('cheer', () => {
    const p = room.bySocket.get(socket.id); if (!p) return;
    const now = Date.now();
    if (p.__cheerAt && now - p.__cheerAt < 120) return;
    p.__cheerAt = now; p.cheers = (p.cheers || 0) + 1; p.inputs++; p.lastInputTs = now;
    if (p.afk) { p.afk = false; p.idleGames = 0; }
    room.cheers[p.team] = (room.cheers[p.team] || 0) + 1;
  });
  socket.on('select_team', (msg) => {
    const p = room.bySocket.get(socket.id); if (!p || room.phase === 'playing') return;
    const t = Number((msg || {}).team); if (!S.TEAM_IDS.includes(t)) return;
    p.team = t; broadcastLobby();
  });
  socket.on('input', (msg) => {
    const p = room.bySocket.get(socket.id); if (!p || !msg) return;
    const now = Date.now();
    if (p.__last && now - p.__last < 6) { p.__flood = (p.__flood || 0) + 1; if (p.__flood > 120) return; } else p.__flood = 0;
    p.__last = now; p.lastInputTs = now; p.inputs++;
    if (p.afk) { p.afk = false; p.idleGames = 0; }
    if (msg.kind === 'rtt') return;
    if (room.phase !== 'playing' || room.paused || !room.mode) return;
    const g = GAMES[room.mode]; if (!g || !room.gameState) return;
    try { g.onInput(room, room.gameState, p, msg); } catch (e) { console.error('onInput', room.mode, e.message); }
  });
  socket.on('admin', (msg, ack) => {
    msg = msg || {};
    if (ADMIN_KEY && String(msg.key || '').toUpperCase() !== ADMIN_KEY) { if (typeof ack === 'function') ack({ ok: false, error: 'key' }); return; }
    let r;
    try { r = adminCommand(msg); } catch (e) { r = { ok: false, error: e.message }; }
    if (typeof ack === 'function') ack(r);
    io.to('hosts').emit('host', hostPayload(Date.now()));
    socket.emit('admin_result', r);
  });
  socket.on('disconnect', () => {
    room.hosts.delete(socket.id); room.admins.delete(socket.id);
    const p = room.bySocket.get(socket.id);
    if (p) { p.connected = false; p.disconnectedAt = Date.now(); room.bySocket.delete(socket.id); broadcastLobby(); }
  });
});

function broadcastLobby() {
  io.emit('lobby', { phase: room.phase, players: connected().length, teams: teamsView(), code: room.code, joinUrl: joinURL() });
  io.to('hosts').emit('host', hostPayload(Date.now()));
  for (const p of Object.values(room.players)) if (p.connected && p.socketId) io.to(p.socketId).emit('pad', padPayload(p, Date.now()));
}

/* ------------------------------------------------------------------ clock */
let lastHost = 0, lastPad = 0;
setInterval(() => {
  const now = Date.now();
  if (!room.paused && room.phase !== 'lobby' && room.phase !== 'final') {
    if (room.phase === 'wheel' && now - room.at >= DUR.wheel) {
      if (room.match && room.match.format === 'spotlight' && room.slot) { room.phase = 'slot'; room.at = now; room.seq++; }
      else { room.phase = 'announce'; room.at = now; room.seq++; }
    } else if (room.phase === 'slot' && now - room.at >= DUR.slot) { room.phase = 'announce'; room.at = now; room.seq++; }
    else if (room.phase === 'announce' && now - room.at >= DUR.announce) { room.phase = 'countdown'; room.at = now; room.seq++; }
    else if (room.phase === 'countdown' && now - room.at >= DUR.countdown) startPlaying();
    else if (room.phase === 'playing') {
      const g = GAMES[room.mode];
      if (g && room.gameState) {
        try { g.tick(room, room.gameState, TICK); } catch (e) { console.error('tick', room.mode, e.message); }
        let done = false;
        try { done = !!g.over(room, room.gameState); } catch (e) { done = false; }
        if (done) endPlaying(false);
      }
    } else if (room.phase === 'results' && now - room.at >= DUR.results) enterBoard();
    else if (room.phase === 'board') {
      const b = room.board;
      if (b.vote && !b.vote.result) {
        if (now - room.at >= DUR.vote) { resolveVote(); room.at = now; }
      } else if (now - room.at >= DUR.board) endBoard();
    }
  }
  const hz = (room.mode && GAMES[room.mode] && GAMES[room.mode].viewHz) || 15;
  if (room.hosts.size && now - lastHost >= 1000 / hz) { lastHost = now; io.to('hosts').emit('host', hostPayload(now)); }
  if (now - lastPad >= 1000 / PAD_HZ) { lastPad = now; padLoop(now); }
}, TICK);

function padLoop(now) {
  for (const p of Object.values(room.players)) {
    if (!p.connected || !p.socketId || p.kicked) continue;
    let payload;
    try { payload = padPayload(p, now); } catch (e) { continue; }
    io.to(p.socketId).emit('pad', payload);
  }
}
setInterval(() => {
  const now = Date.now(); let changed = false;
  for (const p of Object.values(room.players)) {
    if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > 20000 && !p.afk) { p.afk = true; changed = true; }
  }
  if (changed) broadcastLobby();
}, 5000);
setInterval(() => {
  const now = Date.now(); let swept = 0;
  for (const [id, p] of Object.entries(room.players)) {
    if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > 10 * 60 * 1000) { delete room.players[id]; room.tokens.delete(p.token); swept++; }
  }
  if (swept) { log(`swept ${swept} ghosts`); broadcastLobby(); }
}, 60000);

server.listen(PORT, () => {
  try { fs.writeFileSync(path.join(os.tmpdir(), 'majlis-party-' + PORT + '.pid'), String(process.pid)); } catch (e) {}
  const url = lanIP();
  log('🎪 Majlis Party — مجلس بارتي');
  log(`host     : ${url}/host`);
  log(`players  : ${url}/play   code ${room.code}`);
  log(`admin    : ${url}/admin  key ${ADMIN_KEY || 'open'}`);
  log(`games    : ${GAMES.list().map(g => g.emoji + ' ' + g.en).join('  ·  ')}`);
  log(`port     : ${PORT}`);
});

process.on('uncaughtException', e => console.error('[uncaught] ' + ((e && e.stack) || e)));
process.on('unhandledRejection', e => console.error('[unhandled] ' + ((e && e.stack) || e)));
process.on('SIGTERM', () => process.exit(0));

module.exports = { room, io, PORT, hostPayload, padPayload, beginParty, openWheel };
