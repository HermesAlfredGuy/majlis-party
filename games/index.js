/**
 * The Majlis Party minigame registry. Every module is a server-authoritative sim with the same contract:
 * create / onStart / onInput / tick / over / finish / hostView / padView. Adding a game is one file + one
 * line here; the party, the wheel, the pads and the host renderer pick it up from this list.
 */
'use strict';
const MODULES = [
  require('./sweep'), require('./arrows'), require('./colour'), require('./sumo'),
  require('./balloon'), require('./glassfill'), require('./skyjets'),
  require('./glassbridge'), require('./lavatanks'), require('./heartdodge'),
  require('./hotdallah'), require('./swordclash'), require('./trace'), require('./boxtower'), require('./luckypick'), require('./wordrace'),
  require('./quickdraw'), require('./spotlightrun'),
  require('./marathon'), require('./qahwa'), require('./tray'), require('./datecatch'),
  require('./darts'), require('./shake'),
];
const BY_ID = {};
for (const g of MODULES) {
  g.formats = g.formats || ['team'];
  g.controls = g.controls || (g.padView ? null : null);
  BY_ID[g.id] = g;
}
function list() {
  return MODULES.map(g => ({
    id: g.id, ar: g.name.ar, en: g.name.en, emoji: g.emoji, tagline: g.tagline, how: g.how,
    formats: g.formats, durationMs: g.durationMs, viewHz: g.viewHz || 0,
  }));
}
module.exports = Object.assign({}, BY_ID, { list, ids: () => MODULES.map(g => g.id), MODULES });
