/**
 * Test harness: a fake room of N bots and a driver that plays any registered minigame exactly the way a
 * phone would — it reads padView and turns the `bot` hint into input messages. If a game's pad view cannot
 * tell a player what to do, this loop produces no inputs and the test fails: that is the point.
 */
'use strict';
const S = require('../lib/sim');

function makeRoom(n, opts) {
  opts = opts || {};
  const players = {};
  for (let i = 0; i < n; i++) {
    const id = 'p' + i;
    players[id] = { id, nick: 'Bot' + (i + 1), team: S.TEAM_IDS[i % S.TEAM_IDS.length], connected: true, bot: true, joinedAt: 1000 + i, score: 0, crowns: 0, inputs: 0 };
  }
  const room = { players, scores: {}, match: opts.match || { format: 'team' }, results: [], code: '0000' };
  for (const t of S.TEAM_IDS) room.scores[t] = 0;
  return room;
}

function spotlight(room, ids) {
  room.match = { format: 'spotlight', a: ids[0], b: ids[1], pair: [{ id: ids[0], nick: room.players[ids[0]].nick, team: room.players[ids[0]].team }, { id: ids[1], nick: room.players[ids[1]].nick, team: room.players[ids[1]].team }] };
  return room;
}

/* Play one game to completion with dt ticks. Returns real host frames + finish() output. */
function play(game, room, opts) {
  opts = opts || {};
  const dt = 50;
  const st = game.create(room, { seed: opts.seed || 12345 });
  if (game.onStart) game.onStart(room, st);
  const frames = [];
  let t = 0, inputs = 0, hostErr = null;
  const badViews = [];
  const maxMs = (opts.maxMs || (game.durationMs || 60000) + 12000);
  const lastSend = {};
  while (t < maxMs) {
    t += dt;
    if (game.over(room, st)) break;
    for (const id of Object.keys(room.players)) {
      const p = room.players[id];
      let view = null;
      try { view = game.padView(room, st, p); } catch (e) { throw new Error(game.id + ' padView: ' + e.message); }
      if (!view || !view.bot) continue;
      const h = view.bot;
      const key = id + ':' + h.kind;
      const since = t - (lastSend[key] || -1e9);
      if (h.kind === 'tap' && since > 120) { game.onInput(room, st, p, { kind: 'tap' }); inputs++; lastSend[key] = t; }
      else if (h.kind === 'arrow' && since > 260) { game.onInput(room, st, p, { kind: 'arrow', dir: h.dir }); inputs++; lastSend[key] = t; }
      else if (h.kind === 'zone' && since > 400) { game.onInput(room, st, p, { kind: 'zone', zone: h.zone }); inputs++; lastSend[key] = t; }
      else if (h.kind === 'vote' && since > 160) { game.onInput(room, st, p, { kind: 'vote', dir: h.dir }); inputs++; lastSend[key] = t; }
      else if (h.kind === 'side' && since > 260) { game.onInput(room, st, p, { kind: 'side', side: h.side }); inputs++; lastSend[key] = t; }
      else if (h.kind === 'dart' && since > 1200) { game.onInput(room, st, p, { kind: 'dart', x: h.x, y: h.y, power: h.power }); inputs++; lastSend[key] = t; }
    }
    /* continuous games get their own cadence */
    for (const id of Object.keys(room.players)) {
      const p = room.players[id];
      let view = null;
      try { view = game.padView(room, st, p); } catch (e) { continue; }
      /* a pad view that literally says "undefined" (or NaN) is a data bug the player would see */
      const txt = JSON.stringify(view);
      if (txt.includes('undefined') || txt.includes('NaN')) {
        const bad = (txt.match(/.{0,30}(undefined|NaN).{0,20}/) || [''])[0];
        if (!badViews.includes(bad)) badViews.push(bad);
      }
      if (view && view.bot) {
        if (view.bot.kind === 'move' && t % 200 === 0) { game.onInput(room, st, p, { kind: 'move', dx: view.bot.dx, dz: view.bot.dz }); inputs++; }
        if (view.bot.kind === 'dash' && t % 300 === 0) { game.onInput(room, st, p, { kind: 'dash' }); inputs++; }
        if (view.bot.kind === 'aim') {
          game.onInput(room, st, p, { kind: 'aim', angle: view.bot.angle });
          if (view.bot.hold && !p.__aiming) { game.onInput(room, st, p, { kind: 'hold', on: true }); p.__aiming = true; }
          if (view.bot.fire && p.__aiming) { game.onInput(room, st, p, { kind: 'hold', on: false }); p.__aiming = false; }
          inputs++;
        }
        if (view.bot.kind === 'pick' && t % 400 === 0) { game.onInput(room, st, p, { kind: 'pick', id: view.bot.id, box: Number(view.bot.id) }); inputs++; }
        if (view.bot.kind === 'stroke' && !p.__stroked) { game.onInput(room, st, p, { kind: 'stroke', pts: view.bot.pts }); p.__stroked = true; inputs++; }
        if (view.bot.kind === 'word' && t % 900 === 0) { game.onInput(room, st, p, { kind: 'word', text: view.bot.text }); inputs++; }
        if (view.bot.kind === 'tilt' && t % 120 === 0) { game.onInput(room, st, p, { kind: 'tilt', gx: view.bot.gx, gy: view.bot.gy }); inputs++; }
        if (view.bot.kind === 'hold') {
          /* two flavours: the relay games say "hold until the meter passes X", newer games hand the bot an
           * explicit on/off. Read whichever the game provides instead of assuming the relay shape. */
          const on = view.bot.on != null ? !!view.bot.on : (view.frac != null ? view.frac < view.bot.until : false);
          game.onInput(room, st, p, { kind: 'hold', on });
          inputs++;
        }
      }
    }
    game.tick(room, st, dt);
    if (t % 1000 === 0) {
      try {
        const hv = game.hostView(room, st);
        if (!hv || (typeof hv !== 'object')) hostErr = 'empty hostView';
        else frames.push(hv);
      } catch (e) { hostErr = 'hostView: ' + e.message; }
    }
  }
  if (!game.over(room, st)) game.tick(room, st, dt);
  const result = game.finish(room, st);
  return { st, frames, result, inputs, ms: t, hostErr, ended: !!st.done, badViews };
}

module.exports = { makeRoom, spotlight, play };
