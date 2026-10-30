/**
 * The rug road: one definition of where the 16 spaces sit, shared by the style frames and the projector.
 *
 * Coordinates are 0..1 in board space (x → right, y → down). The road starts at the bottom-right corner
 * (the near side of the majlis) and snakes away from the camera: right→left, up, left→right, up, and so on,
 * so the eye can follow it without a legend. Space 16 is the trophy at the top-right.
 *
 * `KINDS` is the content of each landing; the server owns the effects, this file owns the picture.
 */
'use strict';

const COLS = [0.855, 0.615, 0.375, 0.135];
const ROWS = [0.845, 0.605, 0.365, 0.125];

const POINTS = [];
for (let r = 0; r < 4; r++) {
  const xs = r % 2 === 0 ? COLS : COLS.slice().reverse();
  for (let c = 0; c < 4; c++) POINTS.push({ x: xs[c], y: ROWS[r], row: r });
}

/* the polyline that joins them, with rounded corners */
function routeD(pad) {
  pad = pad || 0;
  const p = POINTS.map(q => ({ x: q.x * 100, y: q.y * 100 }));
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if (i % 4 === 0) {
      /* row change: go up the side, then turn */
      d += ` L${a.x} ${b.y} L${b.x} ${b.y}`;
    } else {
      d += ` L${b.x} ${b.y}`;
    }
  }
  return d;
}

const KINDS = [
  'coin', 'coin', 'star', 'coin',
  'chaos', 'coin', 'shop', 'fork',
  'coin', 'star', 'event', 'coin',
  'coin', 'chaos', 'coin', 'goal'
];

/* a golden dallah buys a star; chaos cards are one-line events; the fork is the phone vote */
const GLYPH = { coin: '◆', star: '✦', chaos: '؟', shop: '🏺', fork: '⇄', event: '🎲', goal: '🏆' };
const LABEL = { coin: 'قطع', star: 'دالية ذهبية', chaos: 'بطاقة حظ', shop: 'دكان', fork: 'مفترق', event: 'حدث', goal: 'الخِتام' };

const API = { POINTS, KINDS, GLYPH, LABEL, routeD, COLS, ROWS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.BOARD = API;
