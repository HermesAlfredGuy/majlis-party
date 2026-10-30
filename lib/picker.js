/**
 * The fair picker.
 *
 * Every round that puts players in the arena draws from one pool: everyone who has not had a turn this
 * session. The draw inside that pool is randomised, so the order is not predictable from join order or team,
 * and nobody comes back until the pool is empty. Late joiners enter the pool; players who left are dropped.
 *
 * Pure function over data so tests can drive 45 bots through a whole session and count.
 */
'use strict';

/** players: array of {id, team, connected, afk} · pool: array of ids · rng: () => [0,1) */
function draw(players, pool, rng) {
  const r = rng || Math.random;
  const live = players.filter(p => p.connected !== false);
  if (live.length < 2) return { pair: null, pool: pool || [] };
  const ids = new Set(live.map(p => p.id));
  let next = (pool || []).filter(id => ids.has(id));
  if (next.length < 2) next = live.map(p => p.id);

  /* shuffle a copy of the pool, then take a pair from different teams when possible */
  const sh = next.slice();
  for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = sh[i]; sh[i] = sh[j]; sh[j] = t; }
  const byId = new Map(live.map(p => [p.id, p]));
  const a = byId.get(sh[0]);
  if (!a) return { pair: null, pool: next };
  let b = sh.slice(1).map(id => byId.get(id)).find(p => p && p.team !== a.team) || byId.get(sh[1]) || null;
  if (!b) return { pair: null, pool: next };
  return { pair: [a, b], pool: next.filter(id => id !== a.id && id !== b.id) };
}

module.exports = { draw };
