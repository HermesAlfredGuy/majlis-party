/* Majlis Party — projector HUD + admin.
 *
 * DOM RULE (the owner's refresh bug): every phase builds its markup ONCE, then only text, attributes and classes
 * are patched. Nothing inside #hud is replaced while a phase is running — a phone in someone's hand must never
 * have its button torn out from under a thumb. `tests/dom-stability.test.js` enforces this with a MutationObserver.
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const socket = io({ transports: ['websocket', 'polling'] });
  const params = new URLSearchParams(location.search);
  const KEY = (params.get('key') || localStorage.getItem('mj_admin_key') || '').toUpperCase();

  /* ── tiny keyed-DOM helpers: every write is guarded so an unchanged frame touches nothing */
  const E = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const T = (n, v) => { if (n && n.textContent !== String(v)) n.textContent = String(v); return n; };
  const AT = (n, k, v) => { if (n && n.getAttribute(k) !== String(v)) n.setAttribute(k, String(v)); return n; };
  const CL = (n, c, on) => { if (n && n.classList.contains(c) !== !!on) n.classList.toggle(c, !!on); return n; };
  const ST = (n, k, v) => { if (n && n.style[k] !== v) n.style[k] = v; return n; };
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const ar = (v) => String(v).replace(/[0-9]/g, (d) => AR[+d]);
  /* Arabic counting and Arabic-Indic digits everywhere a person reads a number */
  function arNick(nick) { return String(nick || '').replace(/[0-9]+$/, (m) => ar(m)); }
  function playersAr(n) {
    n = Number(n) || 0;
    if (n <= 0) return 'لا أحد بعد';
    if (n === 1) return 'لاعب واحد';
    if (n === 2) return 'لاعبان';
    if (n <= 10) return ar(n) + ' لاعبين';
    return ar(n) + ' لاعباً';
  }


  /* the draw has to be nameable from the back row. The round chip is the one element already proven
     readable at 1600x900, so the drawn game is written into its text (a text write, never a rebuild). */
  let wcName = '', wcTimer = 0, wcKey = '';
  function wheelCall(s) {
    const key = (s.wheel && (s.wheel.index + ':' + s.wheel.target)) || '';
    if (key === wcKey) return;
    wcKey = key; wcName = ''; clearTimeout(wcTimer);
    const g = s.game || {};
    const wait = Math.max(0, 2400 - (s.phaseT || 0));
    wcTimer = setTimeout(() => { wcName = g.ar || ''; paintRound(state); }, wait);
  }
  function wheelCallOff() { clearTimeout(wcTimer); wcKey = ''; wcName = ''; }
  function paintRound(st) {
    if (!st) return;
    T($('#round'), (st.length ? 'الجولة ' + ar((st.idx || 0) + 1) + ' من ' + ar(st.length) : '—') + (wcName ? ' · ' + wcName : ''));
  }

  let state = null, sceneErrAt = 0, lastFrame = performance.now(), adminOpen = params.get('admin') === '1';
  let TEAMS = [{ i: 1, ar: 'الفيروز', en: 'Turquoise', hex: '#2fd0b4', crest: '◆' }, { i: 2, ar: 'العنبر', en: 'Amber', hex: '#f6a93b', crest: '✦' }];
  const T_ = {}; TEAMS.forEach(t => T_[t.i] = t);

  function toast(msg) {
    const t = $('#toast'); T(t, msg); CL(t, 'on', true);
    clearTimeout(t.__t); t.__t = setTimeout(() => CL(t, 'on', false), 2400);
  }
  function send(obj) { socket.emit('admin', Object.assign({ key: KEY }, obj), (r) => { if (!r) return; if (r.ok === false) toast('⚠ ' + (r.error || 'خطأ')); else if (r.text) toast('✔ ' + r.text); }); }

  function syncTeams(list) {
    if (!list || !list.length) return;
    const same = list.length === TEAMS.length && list.every((t, i) => t.i === TEAMS[i].i && t.ar === TEAMS[i].ar && t.hex === TEAMS[i].hex);
    if (same) return;
    TEAMS = list.map(t => ({ i: t.i, ar: t.ar, en: t.en, hex: t.hex, crest: t.crest || '' }));
    TEAMS.forEach(t => T_[t.i] = t);
    boardReady = false;
  }

  /* ───────────────────────────────────────────── scoreboard: built once, then only text/width changes */
  let boardReady = false, boardRefs = {};
  function buildScoreboard() {
    const box = $('#scoreboard');
    box.textContent = '';
    boardRefs = {};
    TEAMS.forEach(t => {
      const card = E('div', 'team'); card.id = 'team' + t.i;
      card.style.setProperty('--hex', t.hex);
      const hem = E('div', 'hem'); hem.style.setProperty('--hem', t.hex);
      const row = E('div', 'row');
      const cr = E('span', 'cr', t.crest || '●');
      const nm = E('span', 'nm', t.ar);
      const sc = E('span', 'sc', '٠');
      row.append(cr, nm, sc);
      const pl = E('div', 'pl', '٠ لاعب');
      const bar = E('div', 'bar'); const fill = E('i');
      bar.append(fill);
      card.append(hem, row, pl, bar);
      box.append(card);
      boardRefs[t.i] = { card, cr, nm, sc, pl, fill };
    });
    boardReady = true;
  }
  function paintScoreboard(s) {
    if (!boardReady) buildScoreboard();
    const b = s.board || {};
    const stars = b.stars || {}, coins = b.coins || {};
    const max = Math.max(1, ...s.teams.map(t => (stars[t.i] || 0)));
    s.teams.forEach(t => {
      const r = boardRefs[t.i]; if (!r) return;
      /* one number per team: golden dallahs. Coins and players ride underneath. */
      T(r.sc, ar(stars[t.i] || 0));
      T(r.pl, '✦ ' + ar(stars[t.i] || 0) + ' دالية · ' + ar(coins[t.i] || 0) + ' قطعة · ' + playersAr(t.players) + (t.afk ? ' · ' + ar(t.afk) + ' غائب' : ''));
      ST(r.fill, 'width', Math.round(((stars[t.i] || 0) / max) * 100) + '%');
      CL(r.card, 'lead', (stars[t.i] || 0) === max && max > 0);
    });
  }

  /* ───────────────────────────────────────────── centre card manager: one build per phase identity */
  let cardKey = null, refs = {};
  function centre(key, build) {
    if (cardKey === key) return refs;
    cardKey = key;
    const root = $('#centre');
    root.textContent = '';
    const frag = build();
    root.append(frag.node);
    refs = frag.refs || {};
    return refs;
  }
  function clearCentre() { if (cardKey !== null) { cardKey = null; refs = {}; $('#centre').textContent = ''; } }

  function lobbyCard(s) {
    const r = centre('lobby:' + s.code + ':' + (s.session || 'standard') + ':' + TEAMS.map(t => t.i).join(), () => {
      const card = E('div', 'card lobbycard');
      const qr = E('div', 'qrbox'); const img = E('img'); img.alt = 'QR'; img.src = '/qr.png?c=' + s.code; qr.append(img);
      const side = E('div', 'lobbyright');
      const tag = E('div', 'tag', 'امسح والعب');
      const h1 = E('h1', null, 'امسح الرمز والعب');
      h1.style.fontSize = 'clamp(24px,2.4vw,42px)';
      const how = E('div', 'how', 'الكاميرا تكفي — أو أدخل الرمز في /play');
      const code = E('div', 'code');
      const cs = E('small', null, 'رمز الغرفة'); code.append(cs, document.createTextNode(ar(s.code)));
      const roster = E('div'); roster.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px';
      const teamEls = TEAMS.map(t => {
        const d = E('div'); d.style.cssText = 'border-radius:16px;padding:8px 12px;border-top:6px solid ' + t.hex + ';background:rgba(26,51,80,.7)';
        const n = E('div', null, t.ar); n.style.cssText = 'font-family:var(--display);font-weight:800;font-size:clamp(14px,1.2vw,20px);color:' + t.hex;
        const c = E('div', null, '٠'); c.style.cssText = 'font-family:var(--num);font-weight:900;font-size:clamp(18px,1.6vw,26px)';
        d.append(n, c); roster.append(d);
        return c;
      });
      /* session length lives here: the host picks before the wheel, the party picks nothing */
      const pick = E('div'); pick.style.cssText = 'display:flex;gap:8px;margin-top:12px;align-items:center';
      const lbl = E('span', null, 'طول الليلة'); lbl.style.cssText = 'font-weight:700;opacity:.75;font-size:clamp(12px,1vw,16px)';
      const mk = (name, label) => {
        const b = E('button', 'btn'); b.textContent = label;
        b.style.cssText = 'padding:9px 16px;border-radius:999px;font:700 clamp(12px,1vw,16px)/1 Tajawal;cursor:pointer;border:2px solid var(--brass);background:' +
          (s.session === name ? 'var(--brass)' : 'transparent') + ';color:' + (s.session === name ? '#2A1A08' : 'var(--lamp)');
        b.addEventListener('click', () => send({ action: 'session', value: name }));
        return b;
      };
      const bShort = mk('short', 'قصيرة · ٥ جولات');
      const bStd = mk('standard', 'كاملة · ٩ جولات');
      pick.append(lbl, bShort, bStd);
      const line = E('div', 'how', '٠ لاعب متصل');
      side.append(tag, h1, how, code, roster, pick, line);
      card.append(qr, side);
      return { node: card, refs: { teamEls, line, code, bShort, bStd } };
    });
    T(r.line, ar(s.players) + ' لاعب متصل · فريقان يُوزّعان تلقائياً');
    s.teams.forEach((t, i) => { if (r.teamEls[i]) T(r.teamEls[i], playersAr(t.players)); });
  }

  function wheelCard(s) {
    const r = centre('wheel', () => {
      const card = E('div', 'card bare wheelcard');
      const tag = E('div', 'tag', 'القرعة · THE WHEEL');
      const h1 = E('h1', null, 'أي لعبة بعد؟');
      const live = E('div', 'how', '');
      live.style.cssText = 'font-family:var(--display);font-weight:800;font-size:clamp(20px,2vw,34px);color:var(--lantern);min-height:1.4em';
      card.append(tag, h1, live);
      return { node: card, refs: { live } };
    });
    /* the pointer position comes from the wheel state; the label follows the slice under it, so the card is live
       without ever being rebuilt */
    const w = s.wheel;
    if (w && w.order && w.order.length) {
      const left = Math.max(0, s.left || 0), dur = 4600;
      const k = Math.min(1, (dur - left) / (dur - 900));
      const ease = 1 - Math.pow(1 - k, 3);
      const idx = Math.min(w.order.length - 1, Math.floor(ease * (w.order.length - 1) + 0.0001));
      const id = w.order[idx];
      const meta = (s.playlist || []).find(p => p.id === id);
      T(r.live, meta ? (meta.emoji || '') + ' ' + meta.ar : '');
    }
  }

  function slotCard(s) {
    const sl = s.slot;
    if (!sl || !sl.reels) return;
    const ids = sl.reels.map(x => x.id).join('-');
    const r = centre('slot:' + ids, () => {
      const card = E('div', 'card bare');
      const tag = E('div', 'tag', 'اختيار النجوم · SLOT');
      const box = E('div', 'slot');
      const sides = sl.reels.map((reel, i) => {
        const t = T_[reel.team] || TEAMS[0];
        const boxR = E('div', 'reelbox');
        const strip = E('div', 'reel');
        reel.frames.forEach(n => strip.append(E('div', null, n)));
        const tagT = E('div', 'teamtag', t.ar);
        tagT.style.color = t.hex;
        boxR.append(strip, tagT);
        if (i === 0) box.append(boxR, E('div', 'vssign', 'VS'));
        else box.append(boxR);
        return strip;
      });
      card.append(tag, box);
      return { node: card, refs: { sides } };
    });
    /* the reels animate by transform only: the strip nodes are never re-created while the names spin */
    const dur = 3800, left = Math.max(0, s.left || dur);
    const rows = sl.reels[0].frames.length;
    const h = Math.min(84, Math.max(52, window.innerHeight * 0.065));
    refs.sides.forEach((strip, i) => {
      const stop = i === 0 ? 900 : 500;
      const total = Math.max(1, dur - stop);
      const k = Math.min(1, Math.max(0, dur - left) / total);
      const idx = (1 - Math.pow(1 - k, 3)) * (rows - 1);
      ST(strip, 'transform', 'translateY(' + (-idx * h) + 'px)');
    });
  }

  function announceCard(s) {
    const g = s.game || {};
    const fmt = s.match ? s.match.label : { ar: 'فريق ضد فريق', en: 'TEAM vs TEAM' };
    const pair = (s.match && s.match.pair) || null;
    const pairSig = pair && s.match.format === 'spotlight' ? pair.map(p => p.id).join() : '';
    centre('ann:' + (g.id || '') + ':' + pairSig, () => {
      const card = E('div', 'card');
      const tag = E('div', 'tag', fmt.ar + ' · ' + fmt.en);
      const h1 = E('h1', null, (g.emoji || '') + ' ' + (g.ar || ''));
      const sub = E('div', null, (g.en || '') + ' — ' + (g.tagline || ''));
      sub.style.cssText = 'opacity:.7;font-weight:700;font-size:clamp(12px,1vw,17px)';
      const how = E('div', 'how', g.how || '');
      const bets = E('div', 'bets');
      const node = card; card.append(tag, h1, sub, how);
      if (pair && pair.length === 2 && s.match.format === 'spotlight') {
        const a = E('span', null, arNick(pair[0].nick) + ' · ' + pair[0].ar); a.style.color = pair[0].hex;
        const b = E('span', null, arNick(pair[1].nick) + ' · ' + pair[1].ar); b.style.color = pair[1].hex;
        const vs = E('b', null, 'VS'); vs.style.color = 'var(--brass)';
        bets.append(a, vs, b); card.append(bets);
      }
      return { node, refs: {} };
    });
  }

  function countdownCard(s) {
    const r = centre('cd:' + (s.game && s.game.id), () => {
      const card = E('div', 'card bare');
      const n = E('div', null, '٣'); n.id = 'count';
      const label = E('div', 'how', (s.game && s.game.ar) || '');
      label.style.cssText = 'font-weight:800;font-size:clamp(16px,1.5vw,26px);color:var(--cream)';
      card.append(n, label);
      return { node: card, refs: { n } };
    });
    /* the number is patched, never rebuilt — a fresh #count every second was part of the refresh bug */
    T(r.n, ar(Math.max(1, Math.ceil((s.left || 0) / 1000))));
    CL(r.n, 'tick', false);
  }

  function valueOf(row) {
    if (typeof row.value === 'number') return ar(Math.round(row.value));
    if (typeof row.value === 'string') return row.value;
    if (row.alive === true) return 'حيّ';
    if (row.alive === false) return 'خرج';
    if (typeof row.alive === 'number') return ar(row.alive) + ' حيّ';
    return '';
  }
  function resultsCard(s) {
    const r0 = s.results;
    if (!r0) return;
    centre('res:' + r0.gameId + ':' + r0.at, () => {
      const card = E('div', 'card res');
      const tag = E('div', 'tag', (r0.formatLabel && r0.formatLabel.ar) || '');
      const h1 = E('h1', null, (r0.emoji || '') + ' ' + (r0.ar || '') + ' — ' + (r0.summary || ''));
      h1.style.fontSize = 'clamp(22px,2.2vw,38px)';
      const body = E('div');
      (r0.table || []).slice(0, 2).forEach((row, i) => {
        const t = T_[row.team] || TEAMS[0];
        const line = E('div', 'row');
        const rank = E('div', null, '#' + ar(i + 1)); rank.style.opacity = '.55';
        const name = E('div', 'name');
        const sw = E('span', 'sw'); sw.style.background = t.hex;
        name.append(sw, E('span', null, t.ar));
        const val = E('div', null, valueOf(row)); val.style.cssText = 'opacity:.75;font-weight:700;font-size:.8em';
        const pts = E('b', null, '+' + ar((r0.teamPoints && r0.teamPoints[row.team]) || 0));
        line.append(rank, name, val, pts);
        body.append(line);
      });
      const bets = E('div', 'bets');
      if (r0.bets) T(bets, 'الرهانات ' + ar(r0.bets.counts.a) + ' × ' + ar(r0.bets.counts.b));
      const crowns = E('div');
      (r0.crowns || []).forEach(c => { const d = E('div', 'crown', '👑 ' + arNick(c.nick) + ' · ' + c.label); crowns.append(d); });
      card.append(tag, h1, body, bets, crowns);
      return { node: card, refs: {} };
    });
  }

  function finalCard(s) {
    const f = s.final; if (!f) return;
    centre('final:' + (f.ranked || []).map(r => r.team + ':' + r.stars + ':' + r.coins).join(','), () => {
      const card = E('div', 'card fincard');
      const tag = E('div', 'tag', 'نهاية الحفلة · FINAL');
      const win = T_[f.winnerTeam] || TEAMS[0];
      const h1 = E('h1', null, '🏆 ' + win.ar + ' يفوز');
      h1.style.color = win.hex;
      const sub = E('div', 'how', 'الدالية الذهبية تقرّر الليلة — النقاط تحدّد النرد فقط');
      /* one row per team: the two numbers that mattered all night */
      const rows = E('div', 'finrows');
      (f.ranked || []).forEach((r, i) => {
        const t = T_[r.team] || TEAMS[0];
        const row = E('div', 'finrow'); row.style.setProperty('--hex', t.hex);
        const pos = E('span', 'fpos', '#' + ar(i + 1));
        const nm = E('span', 'fnm', t.ar);
        const st = E('span', 'fst', '✦ ' + ar(r.stars || 0));
        const co = E('span', 'fco', ar(r.coins || 0) + ' قطعة');
        row.append(pos, nm, st, co);
        rows.append(row);
      });
      const mvp = E('div', 'crown', f.mvp ? '⭐ نجم الحفلة: ' + arNick(f.mvp.nick) + ' — ' + ar(f.mvp.score) + ' نقطة' : '');
      card.append(tag, h1, sub, rows, mvp);
      return { node: card, refs: {} };
    });
  }

  /* ───────────────────────────────────────────── vote rail (Sky Jets): rows built once per game, numbers patched */
  let railKey = '', railRows = [];
  function voteRail(s) {
    const rail = $('#voterail');
    const v = s.view && s.view.game;
    const on = v && v.id === 'skyjets' && s.phase === 'playing';
    if (!on) { if (railKey) { railKey = ''; railRows = []; rail.textContent = ''; } return; }
    const jets = v.jets || [];
    if (railKey !== 'sj') {
      railKey = 'sj'; rail.textContent = ''; railRows = [];
      jets.forEach(() => {
        const row = E('div', 'v');
        const dot = E('i'); const dir = E('span', 'd', '·'); const pct = E('span', 'n', '٠٪'); const voters = E('span', '', '٠');
        voters.style.opacity = '.5'; voters.style.fontSize = '.85em';
        row.append(dot, dir, pct, voters); rail.append(row);
        railRows.push({ row, dot, dir, pct, voters });
      });
    }
    const arrows = { left: '←', right: '→', up: '↑', down: '↓', null: '·' };
    jets.forEach((j, i) => {
      const r = railRows[i]; if (!r) return;
      const t = T_[j.team] || TEAMS[0];
      ST(r.dot, 'background', t.hex);
      T(r.dir, arrows[j.dir] || '·');
      const tot = Object.values(j.split || {}).reduce((a, b) => a + b, 0) || 1;
      const dom = Object.keys(j.split || {}).sort((a, b) => j.split[b] - j.split[a])[0];
      T(r.pct, ar(Math.round(((j.split || {})[dom] || 0) / tot * 100)) + '٪');
      T(r.voters, ar(j.voters || 0) + '🗳');
      ST(r.row, 'opacity', j.alive ? '1' : '.35');
    });
  }

  /* ───────────────────────────────────────────── built-once overlays: dart legend, rule bar */
  let dartBuilt = false, dartLast = null;
  function dartLegend(s) {
    const dl = $('#dartlegend');
    const on = s.mode === 'darts' && ['playing', 'countdown', 'results'].includes(s.phase);   /* never on the finale */
    CL(dl, 'on', on);
    if (!on) return;
    if (!dartBuilt) {
      dartBuilt = true; dl.textContent = '';
      dl.append(E('b', null, 'قيمة الحلقات'));
      [[50, 'الفلّة', '#f6ead2'], [25, 'قريب', '#a8452f'], [20, 'وسط', '#f6ead2'], [15, 'بعيد', '#a8452f'], [10, 'خارجي', '#f6ead2'], [5, 'حافة', '#1a1230']].forEach(([v, k, col]) => {
        const row = E('span');
        const sw = E('i'); sw.style.cssText = 'width:11px;height:11px;border-radius:3px;display:inline-block;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)'; sw.style.background = col;
        const nm = E('span', null, k); nm.style.flex = '1';
        row.append(sw, nm, E('b', null, ar(v))); dl.append(row);
      });
      dartLast = E('div'); dartLast.id = 'dartlast'; dl.append(dartLast);
    }
    const g = s.view && s.view.game;
    const last = s.phase === 'playing' && g && g.recent && g.recent.length ? g.recent[g.recent.length - 1] : null;
    if (dartLast) {
      const txt = last ? (last.pts ? arNick(last.nick) + ' +' + ar(last.pts) : arNick(last.nick) + ' خارج اللوح') : '';
      if (T(dartLast, txt) && txt) { CL(dartLast, 'pop', false); void dartLast.offsetWidth; CL(dartLast, 'pop', true); }
      if (last) dartLast.style.color = last.pts >= 25 ? '#7df0b6' : last.pts ? 'var(--lantern)' : '#ffb4a4';
    }
  }

  let ruleKey = '', ruleBuilt = false, ruleL = null, ruleR = null;
  function ruleBar(s) {
    const rb = $('#rulebar');
    const g = s.view && s.view.game;
    const on = s.mode === 'marathon' && s.phase === 'playing' && g && g.rule;
    CL(rb, 'on', on);
    if (!on) {
      /* outside the phase the bar is hidden; it is allowed to be empty, not rebuilt every tick */
      if (ruleBuilt) { rb.textContent = ''; ruleBuilt = false; ruleL = ruleR = null; ruleKey = ''; }
      return;
    }
    if (!ruleBuilt) {
      rb.textContent = '';
      const left = E('div', 'side left'); left.append(E('b', null, 'يسار'), E('span', null, ''));
      const vs = E('div', 'vs', '|');
      const right = E('div', 'side right'); right.append(E('span', null, ''), E('b', null, 'يمين'));
      rb.append(left, vs, right);
      ruleL = left.lastChild; ruleR = right.firstChild; ruleBuilt = true; ruleKey = '';
    }
    /* a new rule only changes the two side labels: the bar itself is never rebuilt mid-round */
    const key = 'r' + (g.ruleIdx || 0);
    if (ruleKey !== key) {
      ruleKey = key;
      T(ruleL, (g.rule.left || []).join(' · '));
      T(ruleR, (g.rule.right || []).join(' · '));
      if (key !== 'r0') { CL(rb, 'changed', false); void rb.offsetWidth; CL(rb, 'changed', true); }
    }
  }

  let labelText = '';
  function gameLabel(s) {
    const gl = $('#gamelabel');
    const g = s.view && s.view.game;
    let label = '';
    if (s.phase === 'playing' && g && s.mode !== 'darts') {
      if (g.id === 'hotdallah') label = g.holderNick ? '🔥 الدلّة عند ' + g.holderNick : '🔥 الدلّة في اللعب';
      else if (g.id === 'glassbridge') label = g.phase === 'jump' ? 'اقفزوا' : 'صوّتوا: يسار أم يمين';
      else if (g.id === 'boxtower') label = 'اضغط عند الاستقامة';
      else if (g.id === 'luckypick') label = g.revealed ? (g.revealed.hit ? '💥 ' + g.revealed.hit + ' خرجوا' : 'نجا الجميع') : 'اختاروا صندوقاً';
    }
    if (label !== labelText) { labelText = label; T(gl, label || ''); }
    CL(gl, 'on', !!label);
  }

  /* ───────────────────────────────────────────── footer join line: three spans, patched */
  let joinRefs = null;
  function joinLine(s) {
    const box = $('#joinline');
    const on = s.phase !== 'lobby';
    if (!joinRefs) {
      box.textContent = '';
      const url = E('span'); url.style.opacity = '.8';
      const code = E('b'); code.style.color = 'var(--lantern)';
      const who = E('span');
      box.append(url, document.createTextNode(' · '), code, document.createTextNode(' · '), who);
      joinRefs = { url, code, who };
    }
    T(joinRefs.url, on ? 'انضم متأخراً' : '');
    T(joinRefs.code, on ? 'رمز ' + ar(s.code) : '');
    T(joinRefs.who, on ? playersAr(s.players) : '');
  }

  /* ───────────────────────────────────────────── admin panel: built once, then only labels/opacity patched */
  let adminBuilt = false, adminRefs = null, adminListAt = 0;
  const adminRows = new Map();
  function buildAdmin() {
    const box = $('#admin');
    box.textContent = '';
    const head = E('div', 'h', 'الحفلة');
    const acts = E('div', 'grp');
    [['▶ بدء', 'party_start'], ['⏸', 'pause_toggle'], ['⏭', 'skip'], ['⏹', 'end_now'], ['↻', 'restart'],
     ['🎡', 'respin'], ['🎰', 'reroll'], ['🏠', 'lobby'], ['↩', 'undo']].forEach(([label, act]) => {
      const b = E('button', null, label); b.dataset.act = act;
      b.addEventListener('click', () => send({ action: act }));
      acts.append(b);
    });
    const headT = E('div', 'h', 'نقاط');
    const tGrp = E('div', 'grp'); tGrp.id = 'adminteams';
    const headL = E('div', 'h', 'الطول');
    const lGrp = E('div', 'grp');
    [4, 6, 8, 10].forEach(n => {
      const b = E('button', null, ar(n)); b.dataset.len = n;
      b.addEventListener('click', () => send({ action: 'length', value: n }));
      lGrp.append(b);
    });
    const headG = E('div', 'h', 'الألعاب');
    const gGrp = E('div', 'grp'); gGrp.id = 'admingames';
    const headP = E('div', 'h', 'اللاعبون');
    const players = E('div'); players.id = 'adminplayers';
    players.style.cssText = 'display:grid;gap:4px;font-size:11px';
    box.append(head, acts, headT, tGrp, headL, lGrp, headG, gGrp, headP, players);
    adminRefs = { tGrp, gGrp, players, head };
    TEAMS.forEach(t => {
      const b = E('button', null, t.ar); b.style.borderColor = t.hex;
      b.addEventListener('click', () => send({ action: 'points', team: t.i, delta: 10, reason: 'host' }));
      tGrp.append(b);
    });
    adminBuilt = true;
  }
  function paintAdmin(s) {
    if (!adminBuilt) buildAdmin();
    CL($('#admin'), 'on', adminOpen);
    if (!adminOpen) return;
    T(adminRefs.head, 'الحفلة ' + ar(s.idx + 1) + '/' + ar(s.length));
    const pool = (s.playlist || []).map(p => p.id);
    const gGrp = adminRefs.gGrp;
    const games = window.__GAMES || [];
    if (gGrp.childElementCount !== games.length) {
      gGrp.textContent = '';
      games.forEach(g => {
        const b = E('button', null, (g.emoji || '') + ' ' + g.en); b.dataset.game = g.id;
        b.addEventListener('click', () => {
          const cur = (window.__POOL || []).slice();
          const next = cur.includes(g.id) ? cur.filter(x => x !== g.id) : cur.concat([g.id]);
          send({ action: 'enable', ids: next });
        });
        gGrp.append(b);
      });
    }
    window.__POOL = pool;
    [...gGrp.children].forEach(b => ST(b, 'opacity', pool.includes(b.dataset.game) ? '1' : '.4'));
    if (performance.now() - adminListAt > 3000) { adminListAt = performance.now(); refreshPlayers(); }
  }
  function refreshPlayers() {
    socket.emit('admin', { key: KEY, action: 'players' }, (r) => {
      if (!r || !r.players || !adminRefs) return;
      const box = adminRefs.players;
      const keep = new Set();
      r.players.forEach(p => {
        keep.add(p.id);
        let row = adminRows.get(p.id);
        if (!row) {
          const d = E('div'); d.style.cssText = 'display:flex;gap:4px;align-items:center';
          const dot = E('span'); dot.style.cssText = 'width:8px;height:8px;border-radius:50%';
          const nm = E('span'); nm.style.flex = '1';
          const afk = E('button', null, 'AFK'); afk.style.cssText = 'padding:2px 5px;font-size:10px';
          const kick = E('button', null, '✕'); kick.style.cssText = 'padding:2px 5px;font-size:10px';
          afk.addEventListener('click', () => send({ action: 'afk', playerId: p.id, afk: row.afk.dataset.on !== '1' }));
          kick.addEventListener('click', () => send({ action: 'kick', playerId: p.id }));
          d.append(dot, nm, afk, kick); box.append(d);
          row = { d, dot, nm, afk, kick }; adminRows.set(p.id, row);
        }
        if (row.gone) { row.gone = false; row.d.style.display = ''; }
        row.miss = 0;
        const t = T_[p.team] || TEAMS[0];
        ST(row.dot, 'background', t.hex);
        T(row.nm, arNick(p.nick) + (p.afk ? ' · غائب' : ''));
        const on = p.afk ? '1' : '0';
        if (row.afk.dataset.on !== on) { row.afk.dataset.on = on; T(row.afk, p.afk ? '↩' : 'AFK'); }
      });
      /* a player can vanish from the payload for a single refresh (join/kick in flight): a row is
         only dropped after two consecutive misses, so the list never flickers under the operator */
      if (r.players.length) {
        for (const [id, row] of adminRows) {
          if (keep.has(id)) continue;
          row.miss = (row.miss || 0) + 1;
          /* hide rather than destroy: a player who reconnects gets the same row back, and nothing
             under the operator's finger is ever pulled out of the document */
          if (row.miss >= 2 && !row.gone) { row.gone = true; row.d.style.display = 'none'; }
          if (row.miss >= 8) { row.d.remove(); adminRows.delete(id); }
        }
      }
    });
  }
  function toggleAdmin() {
    adminOpen = !adminOpen; CL($('#admin'), 'on', adminOpen);
    if (adminOpen) { buildAdmin(); paintAdmin(state || { idx: -1, length: 0 }); }
  }

  /* ───────────────────────────────────────────── frame */
  let sndPhase = '', sndWheelAt = 0, sndSlotAt = 0;
  function paintSound(s) {
    /* sound follows the phase, not the tick: the wheel ticks once per spin, the reels knock
       once per landing and the finale gets the stinger */
    if (s.phase !== sndPhase) {
      const prev = sndPhase; sndPhase = s.phase;
      const A = window.MAJLIS_AUDIO;
      if (A) {
        if (s.phase !== 'wheel') A.stopWheel();
        if (s.phase === 'wheel' && s.wheel && s.wheel.startedAt !== sndWheelAt) {
          sndWheelAt = s.wheel.startedAt;
          A.wheel(Math.max(2600, (s.left || 5000)));
        }
        if (s.phase === 'slot' && prev === 'wheel') A.reels(2);
        if (s.phase === 'final' && prev !== 'final') A.sting();
      }
    }
    const btn = $('#snd');
    if (btn) {
      const muted = !!(window.MAJLIS_AUDIO && MAJLIS_AUDIO.state.muted);
      if (btn.getAttribute('aria-pressed') !== String(!muted)) {
        btn.setAttribute('aria-pressed', String(!muted));
        btn.textContent = muted ? '🔇 الصوت' : '🔊 الصوت';
      }
    }
  }

  function update(s) {
    state = s;
    document.body.dataset.phase = s.phase || '';
    document.body.dataset.game = (s.game && s.game.id) || '';
    if (s.phase !== 'wheel') wheelCallOff();
    if (s.teams) syncTeams(s.teams);
    if (window.MJ) {
      try { MJ.setGames(s.playlist || []); MJ.setState(s); }
      catch (err) { if (Date.now() - sceneErrAt > 4000) { sceneErrAt = Date.now(); console.error('scene', err && err.message); } }
    }
    const g = s.game;
    const playingish = ['playing', 'announce', 'countdown', 'results'].includes(s.phase);
    T($('#t-ar'), playingish && g ? (g.emoji || '') + ' ' + g.ar : 'مجلس بارتي');
    T($('#t-en'), playingish && g ? g.en : 'MAJLIS PARTY');
    T($('#format'), s.match ? s.match.label.ar : '—');
    T($('#playerschip'), playersAr(s.players || 0));
    const roundTxt = s.phase === 'lobby' ? 'الاستعداد' : (s.length ? 'الجولة ' + ar((s.idx || 0) + 1) + ' من ' + ar(s.length) : '—');
    T($('#round'), roundTxt + (wcName ? ' · ' + wcName : ''));
    let timer = '';
    if (s.phase === 'playing') timer = (s.view && s.view.hud && s.view.hud.left != null) ? s.view.hud.left : '';
    else if (['announce', 'countdown', 'wheel', 'slot', 'results'].includes(s.phase)) timer = Math.ceil((s.left || 0) / 1000);
    T($('#timer'), s.paused ? '⏸' : (timer === '' ? '' : ar(timer)));
    paintScoreboard(s);
    voteRail(s);
    paintSound(s);
    if (s.phase === 'lobby') lobbyCard(s);
    else if (s.phase === 'wheel') { clearCentre(); wheelCall(s); } /* no card on the wheel; a caption chip below it */
    else if (s.phase === 'slot') slotCard(s);
    else if (s.phase === 'announce') announceCard(s);
    else if (s.phase === 'countdown') countdownCard(s);
    else if (s.phase === 'results') resultsCard(s);
    else if (s.phase === 'final') finalCard(s);
    else clearCentre();
    if (s.phase === 'board') { clearCentre(); boardHud(s); const bd = $('#boarddice'); if (bd) bd.style.display = ''; }
    else {
      const bv = $('#boardvote'); if (bv) bv.classList.remove('on');
      const bd = $('#boarddice'); if (bd) bd.style.display = 'none';
      const bl = $('#boardlanding'); if (bl) { bl.textContent = ''; bl.dataset.key = ''; }
    }
    dartLegend(s);
    ruleBar(s);
    gameLabel(s);
    joinLine(s);
    paintAdmin(s);
  }


  /* ───────────────────────────────────────────── the board turn */
  function boardHud(s) {
    const b = s.board || {};
    const vote = $('#boardvote'), opts = $('#boardvoteopts'), vtim = $('#boardvotetimer');
    if (vote) {
      const on = !!(b.vote && !b.vote.result);
      CL(vote, 'on', on);
      if (on) {
        const hits = b.vote.hits || {};
        const total = Math.max(1, (hits.short || 0) + (hits.long || 0));
        if (opts && opts.children.length !== 2) {
          opts.textContent = '';
          b.vote.options.forEach(o => {
            const d = E('div', 'vopt');
            const vt = E('div', 'vt'); const t1 = E('span', null, o.ar); const pc = E('b', null, '٠');
            vt.append(t1, pc);
            const bar = E('i'); const fill = E('u');
            bar.append(fill); d.append(vt, bar);
            d.dataset.id = o.id; opts.append(d);
          });
        }
        if (opts) b.vote.options.forEach(o => {
          const d = opts.querySelector('[data-id="' + o.id + '"]'); if (!d) return;
          const n = hits[o.id] || 0;
          T(d.querySelector('b'), ar(Math.round((n / total) * 100)) + '٪');
          ST(d.querySelector('u'), 'width', Math.round((n / total) * 100) + '%');
        });
        T(vtim, '٦ ثوانٍ · الأغلبية تفوز · ' + ar(s.left ? Math.ceil(s.left / 1000) : 0) + ' ث');
      }
    }
    const dice = $('#boarddice');
    if (dice) {
      const t = b.turn;
      const ds = dice.querySelectorAll('.d');
      if (t && ds.length === 2) {
        [1, 2].forEach((team, i) => {
          const v = Math.max.apply(null, t.dice[team] || [0]);
          T(ds[i], ar(v));
          ds[i].style.borderColor = (TEAMS.find(x => x.i === team) || {}).hex || '#FBF0DA';
        });
      }
      T($('#boarddicelabel'), t ? 'الفائز ' + (TEAMS.find(x => x.i === t.winner) || {}).ar + ' يرمي نردين' : 'النرد');
    }
    const land = $('#boardlanding');
    if (land) {
      const items = (b.landings || []).slice(-3);
      const key = items.map(l => l.team + ':' + l.space + ':' + l.text).join('|');
      if (land.dataset.key !== key) {
        land.dataset.key = key;
        land.textContent = '';
        items.forEach(l => {
          const team = TEAMS.find(x => x.i === l.team) || {};
          const d = E('div'); d.style.setProperty('--hex', team.hex || '#FBF0DA');
          const b1 = E('b', null, team.ar || ''); b1.style.color = team.hex || 'var(--lamp)';
          d.append(b1, document.createTextNode(' ' + (l.text || '')));
          land.append(d);
        });
      }
    }
  }

  /* ───────────────────────────────────────────── socket + loop */
  socket.on('connect', () => {
    socket.emit('host_hello', { admin: !!KEY, key: KEY });
    fetch('/api/games').then(r => r.json()).then(list => { window.__GAMES = list; if (window.MJ) MJ.setGames(list); }).catch(() => {});
  });
  buildScoreboard();
  socket.on('host', update);
  socket.on('hello', (h) => { if (h.games) { window.__GAMES = h.games; if (window.MJ) MJ.setGames(h.games); } });
  socket.on('admin_result', (r) => { if (r && r.ok === false) toast('⚠ ' + (r.error || 'خطأ')); else if (r && r.text) toast('✔ ' + r.text); });

  const sndBtn = $('#snd');
  if (sndBtn) sndBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!window.MAJLIS_AUDIO) return;
    MAJLIS_AUDIO.unlock();
    MAJLIS_AUDIO.setMuted(!MAJLIS_AUDIO.state.muted);
    if (state) paintSound(state);
  });

  document.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'a') toggleAdmin();
    else if (k === 'f') { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
    else if (k === ' ') { e.preventDefault(); send({ action: 'pause_toggle' }); }
    else if (k === 's') send({ action: 'skip' });
    else if (k === 'e') send({ action: 'end_now' });
    else if (k === 'r') send({ action: 'restart' });
    else if (k === 'w') send({ action: 'respin' });
    else if (k === 'k') send({ action: 'reroll' });
    else if (k === 'l') send({ action: 'lobby' });
    else if (k === 'p') send({ action: 'party_start' });
  });

  function loop() {
    const now = performance.now(), dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (window.MJ) { try { MJ.frame(dt); } catch (err) { /* the HUD must survive a bad scene frame */ } }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
