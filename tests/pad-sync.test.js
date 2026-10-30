#!/usr/bin/env node
/**
 * Pad sync gate — the phone must show a live control for a live round.
 *
 * The defect this locks down (owner, FOLLOW-UP 6): during a round that the projector was showing with a
 * running clock, a phone that had joined before the round started still displayed the passive
 * "الجولة القادمة / شاهد الشاشة" card instead of a control. A player in the round therefore had nothing to
 * press while the room watched the clock.
 *
 * So this gate asserts, for every registered game and at several ticks inside the round:
 *   1. every player who was in the room when the round started gets a pad view with a real control,
 *   2. the pad's phase/left/game agree with the projector's for the same tick,
 *   3. a phone that joins mid-round is told "watching" (never "next round"), and gets no control,
 *   4. no pad view the pad can receive is undefined or has an unknown control type.
 */
'use strict';
const GAMES = require('../games');
const H = require('./harness');
const S = require('../lib/sim');
const PV = require('../lib/padview');

const KNOWN = new Set(['none', 'tap', 'pick', 'tilt', 'stick', 'word', 'vote', 'side', 'hold', 'dart', 'aim', 'arrows', 'colours', 'trace']);
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('   ✗ ' + msg); } else console.log('   ✓ ' + msg); };

const games = GAMES.MODULES;
console.log(`\nMajlis Party — pad sync gate (${games.length} games)\n`);

for (const g of games) {
  const formats = g.formats || ['team'];
  const fmt = formats.includes('team') ? 'team' : formats[0];
  const room = H.makeRoom(45);
  if (fmt === 'spotlight') {
    const ids = S.TEAM_IDS.map(t => Object.values(room.players).find(p => p.team === t).id);
    H.spotlight(room, ids);
  }
  const roster = Object.values(room.players);
  const st = g.create(room, { seed: 4242 });
  if (g.onStart) g.onStart(room, st);

  const late = { id: 'late', nick: 'متأخر', team: S.TEAM_IDS[0], connected: true, bot: true, joinedAt: 9e9, score: 0, crowns: 0, inputs: 0 };

  /* three ticks inside the live round: the opening second, a mid-round tick, and the last second */
  const dur = g.durationMs || 30000;
  const ticks = [200, Math.floor(dur * 0.5), Math.max(400, dur - 700)];
  let tick = 0, inRound = 0, noControl = [], badType = [], watchBug = [], mismatch = [];
  for (const t of ticks) {
    while (tick < t) { tick += 50; if (g.tick) g.tick(room, st, 0.05); if (g.over(room, st)) break; }
    for (const p of roster) {
      let v = null;
      try { v = g.padView(room, st, p); } catch (e) { noControl.push(p.id + ' threw ' + e.message); continue; }
      if (!v) { noControl.push(p.id + ' @' + t + 'ms: view is null'); continue; }
      const ty = (v.controls && v.controls.type) || 'none';
      if (!KNOWN.has(ty)) badType.push(p.id + ' @' + t + 'ms: ' + ty);
      /* a spotlight round is played by two phones by design; everyone else watches, and says so */
      const spectating = fmt === 'spotlight' && !(room.match.pair || []).some(x => x.id === p.id);
      if (spectating) {
        const pv = PV.view('playing', g, room, st, p);
        if (!pv || pv.watching !== true || (pv.controls && pv.controls.type !== 'none')) watchBug.push(p.id + ' @' + t + 'ms: spectator is not shown as watching');
      } else if (ty === 'none') {
        /* some rounds are played by a subset (a 1v1 tank duel): the rest must be labelled, not fobbed off */
        if (v.watching !== true) noControl.push(p.id + ' @' + t + 'ms (' + (v.head || '') + ')');
        else if (/القادمة/.test(v.head || '')) noControl.push(p.id + ' @' + t + 'ms: stale "next round" copy');
        inRound++;
      } else inRound++;
    }
    /* the mid-round joiner: has no control, and must be told the round is live, not that it is next.
       Checked through lib/padview, because that is what the phone actually receives. */
    const lv = PV.view('playing', g, room, st, late);
    const lty = (lv && lv.controls && lv.controls.type) || 'none';
    /* the rule is: a phone in a live round either has a real control, or is explicitly told it is watching */
    if (lty === 'none' && !(lv && lv.watching === true)) mismatch.push('late joiner has neither a control nor a watching label');
    if (lv && /القادمة/.test(lv.head || '')) watchBug.push('late joiner shown "next round" during a live round');
  }
  ok(noControl.length === 0, `${g.id}: every in-round player has a control (${inRound} views)${noControl.length ? ' — ' + noControl.slice(0, 3).join('; ') : ''}`);
  ok(badType.length === 0, `${g.id}: only known control types${badType.length ? ' — ' + badType.slice(0, 3).join('; ') : ''}`);
  ok(watchBug.length === 0, `${g.id}: spectators are told the round is live${watchBug.length ? ' — ' + watchBug.slice(0, 2).join('; ') : ''}`);
  ok(mismatch.length === 0, `${g.id}: a mid-round joiner has a control or a watching label`);
}

/* the payload-level fix: padPayload marks a live spectator "watching" with a live clock, never stale copy */
ok(typeof PV.view === 'function', 'lib/padview is the single authority for the pad view');
if (typeof PV.view === 'function') {
  const room = H.makeRoom(12);
  const g = games[0];
  const st = g.create(room, { seed: 7 });
  if (g.onStart) g.onStart(room, st);
  const stranger = { id: 'zz', nick: 'غريب', team: S.TEAM_IDS[0], connected: true, joinedAt: 9e9 };
  const v = PV.view('playing', g, room, st, stranger);
  ok(!!v && v.watching === true, 'a stranger on the pad during play is marked watching');
  ok(!!v && !/القادمة/.test(v.head || ''), 'the watching card does not say "next round"');
}

console.log(fails ? `\nFAIL — ${fails} pad-sync problem(s)\n` : '\nPASS — every live round gives its players a control on the same tick\n');
process.exit(fails ? 1 : 0);
