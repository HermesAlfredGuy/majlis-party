/**
 * The pad's view of a live round, in one place so the server and the test agree.
 *
 * A phone must never be told "the next round is coming" while the projector is counting down a round that
 * is already running: that was a real defect, seen on a phone during a live spotlight round. So this module
 * is the single authority for what a phone gets during `playing`:
 *
 *   - a player in the round gets the game's own view, control and all;
 *   - anyone else gets `watching: true` with live copy (`الجولة جارية`) and no control;
 *   - a game that throws yields a watching card rather than a blank screen.
 */
'use strict';

function view(phase, game, room, gameState, p) {
  if (phase !== 'playing' || !gameState || !game) return null;
  let v = null;
  try { v = game.padView(room, gameState, p); } catch (e) { v = null; }
  /* if the round keeps a roster and this phone is not on it, this phone is watching — whatever control a
     game may hand out optimistically to an id it has never seen */
  const roster = gameState.players || gameState.p || null;
  if (roster && p && !roster[p.id]) {
    v = v || { stats: [], team: { i: (p.team || 1) - 1 } };
    v.controls = { type: 'none' };
  }
  const none = !v || !v.controls || !v.controls.type || v.controls.type === 'none';
  /* a disabled control is not a control: a phone that joined mid-round gets a "disabled jump" button from
     some games, which reads as a broken control during a round it is only watching */
  const dead = !!(v && v.controls && v.controls.disabled);
  if (!none && !dead && v.watching !== true) return v;
  v = v || { stats: [], team: { i: (p && p.team || 1) - 1 } };
  v.watching = true;
  v.head = 'الجولة جارية';
  v.sub = (game.name && game.name.ar ? game.name.ar : '') + ' — شاهد الشاشة';
  v.controls = { type: 'none' };
  return v;
}

module.exports = { view };
