/* majlis-audio.js — the party's own sound: a tick while the wheel turns, a knock as each
 * reel lands, and a short stinger on the finale. Sounds are CC0 (Kenney casino-audio and
 * music-jingles); nothing here is synthesised.
 *
 * Phones and projectors both block autoplay until the page has been touched once, so the
 * module reports `blocked` and the operator's first click (or the footer toggle) unlocks it.
 */
(function () {
  const BASE = '/assets/sfx/';
  const state = {
    muted: localStorage.getItem('mj_sound') === 'off',
    blocked: false,
    unlocked: false,
  };
  const pools = {};

  function pool(name) {
    if (!pools[name]) {
      const a = new Audio(BASE + name);
      a.preload = 'auto';
      a.volume = 0.5;
      pools[name] = [a];
    }
    return pools[name];
  }

  function play(name, vol) {
    if (state.muted) return null;
    const p = pool(name);
    let el = p.find(x => x.paused || x.ended);
    if (!el) { el = p[0].cloneNode(); p.push(el); }
    el.volume = vol == null ? 0.5 : vol;
    el.currentTime = 0;
    const r = el.play();
    if (r && r.catch) r.catch(() => { state.blocked = true; });
    else if (r === undefined && el.paused) state.blocked = true;
    state.unlocked = true;
    return el;
  }

  /* a wheel that slows down: ticks get further apart as the disc loses speed */
  let spinTimer = null;
  function wheel(spinMs) {
    stopWheel();
    if (state.muted) return;
    const total = spinMs || 4200;
    let t = 0, gap = 42;
    const tick = () => {
      play('tick.ogg', 0.28);
      t += gap;
      gap *= 1.13;                       /* exponential slow-down reads as friction */
      if (t < total - gap) spinTimer = setTimeout(tick, gap);
      else spinTimer = null;
    };
    spinTimer = setTimeout(tick, 60);
  }
  function stopWheel() { if (spinTimer) { clearTimeout(spinTimer); spinTimer = null; } }

  function reels(n) {
    if (state.muted) return;
    for (let i = 0; i < (n || 2); i++) setTimeout(() => play('tick.ogg', 0.4), 260 + i * 380);
  }

  function sting() { if (state.muted) return; play('stinger.ogg', 0.55); }

  function unlock() {
    if (state.unlocked || state.muted) return;
    const a = new Audio(BASE + 'tick.ogg');
    a.volume = 0.001;
    const r = a.play();
    if (r && r.then) r.then(() => { state.unlocked = true; state.blocked = false; }).catch(() => {});
  }

  function setMuted(m) {
    state.muted = !!m;
    localStorage.setItem('mj_sound', state.muted ? 'off' : 'on');
    if (state.muted) stopWheel();
    return state.muted;
  }

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  window.MAJLIS_AUDIO = { wheel, stopWheel, reels, sting, setMuted, unlock, state };
})();
