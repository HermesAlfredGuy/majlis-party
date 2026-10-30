/* Majlis Party — phone pad. One page, one control set per minigame, all state from the server. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const screen = $('#screen');
  const socket = io({ transports: ['websocket', 'polling'] });
  const params = new URLSearchParams(location.search);
  let state = null, joined = false, me = null, ctlHash = '', sendTimer = null, toastT = null;
  let stick = { active: false, dx: 0, dz: 0, id: null };

  const store = {
    get token() { try { return localStorage.getItem('mj_token') || ''; } catch (e) { return ''; } },
    set token(v) { try { localStorage.setItem('mj_token', v); } catch (e) {} },
    get nick() { try { return localStorage.getItem('mj_nick') || ''; } catch (e) { return ''; } },
    set nick(v) { try { localStorage.setItem('mj_nick', v); } catch (e) {} },
  };
  const code = (params.get('c') || '').trim();

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

  /* ---------------------------------------------------------------- join */
  function joinScreen(msg) {
    screen.innerHTML = '';
    const card = el('div', 'card');
    card.append(el('h1', null, 'مجلس بارتي'), el('div', 'tiny', 'العب من جوالك — لا تحتاج تطبيق'));
    if (msg) card.append(el('div', 'feed', msg));
    const input = el('input'); input.placeholder = 'اسمك'; input.value = store.nick || ''; input.maxLength = 14;
    input.setAttribute('autocomplete', 'nickname'); input.setAttribute('enterkeyhint', 'go');
    const codeIn = el('input'); codeIn.placeholder = 'رمز الغرفة (٤ أرقام)'; codeIn.value = code; codeIn.inputMode = 'numeric'; codeIn.maxLength = 4;
    const go = el('button', 'btn primary', 'دخول · JOIN');
    const submit = () => {
      const nick = input.value.trim() || 'ضيف';
      store.nick = nick;
      go.disabled = true;
      socket.emit('join', { nick, token: store.token, code: codeIn.value.trim() || code }, (res) => {
        if (res && res.ok) {
          joined = true; me = res; store.token = res.token;
          vibrate(20);
        } else {
          go.disabled = false;
          joinScreen(res && res.error === 'code' ? 'الرمز غير صحيح' : 'تعذّر الدخول — حاول مرة أخرى');
        }
      });
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const tips = el('div', 'tiny');
    tips.style.cssText = 'margin-top:16px;display:grid;gap:7px;opacity:.8;line-height:1.65;font-size:14px';
    tips.innerHTML = '<div>· امسح رمز QR من الشاشة — رمز الغرفة يمتلئ وحده</div>'
      + '<div>· فريقان فقط: الفيروز والعنبر — تُوزَّع عليك تلقائياً</div>'
      + '<div>· كل جولة لعبة قصيرة بين ٣٠ و٦٠ ثانية</div>';
    card.append(tips);
    const wrap = el('div'); wrap.style.display = 'grid'; wrap.style.gap = '10px'; wrap.style.marginTop = '12px';
    wrap.append(input, codeIn, go);
    card.append(wrap);
    screen.append(card);
    setTimeout(() => input.focus(), 120);
  }

  /* ---------------------------------------------------------------- panels
   * One build per phase, then patch. The old code wiped #screen on every pad update (5/s), which is exactly the
   * "it keeps refreshing" the owner reported: buttons were replaced while a thumb was on them.
   */
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const ar = (v) => String(v).replace(/[0-9]/g, (d) => AR[+d]);
  /* Arabic counting and Arabic-Indic digits everywhere a person reads a number */
  function arNick(nick) { return String(nick || '').replace(/[0-9]+$/, (m) => ar(m)); }
  function playersAr(n) {
    n = Number(n) || 0;
    if (n === 1) return 'لاعب واحد';
    if (n === 2) return 'لاعبان';
    if (n <= 10) return ar(n) + ' لاعبين';
    return ar(n) + ' لاعباً';
  }

  const E = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const T = (n, v) => { if (n && n.textContent !== String(v)) n.textContent = String(v); return n; };
  const CL = (n, c, on) => { if (n && n.classList.contains(c) !== !!on) n.classList.toggle(c, !!on); return n; };
  const ST = (n, k, v) => { if (n && n.style[k] !== v) n.style[k] = v; return n; };

  /* teams come from the server payload — two of them, not a hard-coded six-colour table */
  let TEAM_ROWS = [{ i: 1, ar: 'الفيروز', hex: '#2fd0b4' }, { i: 2, ar: 'العنبر', hex: '#f6a93b' }];
  const teamName = (i) => (TEAM_ROWS.find(t => t.i === i) || TEAM_ROWS[0] || {}).ar || '';
  const teamHex = (i) => (TEAM_ROWS.find(t => t.i === i) || TEAM_ROWS[0] || {}).hex || '#fff';
  function syncTeams(s) {
    const rows = (s.scoreboard && s.scoreboard.length) ? s.scoreboard.map(t => ({ i: t.i, ar: t.ar, hex: t.hex })) : null;
    if (rows && rows.length) TEAM_ROWS = rows;
  }

  function teamChip(t) {
    const d = $('#dot'); if (!d) return;
    ST(d, 'background', t.hex);
    document.body.style.setProperty('--team', t.hex);
    T($('#teamname'), t.ar); T($('#teamscore'), ar(t.score));
  }

  /* the pad shows the two team totals; rows are built once and their numbers patched */
  function scoresBlock(title, rows, refs) {
    const c = E('div', 'card');
    c.append(E('h2', null, title));
    const lines = rows.map(r => {
      const line = E('div', 'scoreline');
      const a = E('span', 'a');
      const dot = E('i'); ST(dot, 'background', r.hex || r.color || '#fff');
      dot.style.cssText = 'width:11px;height:11px;border-radius:50%;display:inline-block';
      a.append(dot, E('span', null, r.ar || r.name || ''));
      const val = E('b', null, ar(r.score));
      line.append(a, val);
      c.append(line);
      return val;
    });
    if (refs) refs.lines = lines;
    return c;
  }

  let panelKey = null, panelPatch = null;
  function mount(key, build) {
    if (panelKey === key) return false;
    panelKey = key;
    screen.textContent = '';
    const out = build();
    (out.nodes || []).forEach(n => screen.append(n));
    panelPatch = out.patch || null;
    return true;
  }

  function lobbyPanel(s) {
    const refs = {};
    mount('lobby', () => {
      const c = E('div', 'card');
      c.append(E('h1', null, 'مرحباً ' + (s.you.nick || '')), E('div', 'tiny', 'انتظر بدء الحفلة — ستظهر الألعاب على الشاشة'));
      const b = E('div', 'banner'); b.style.marginTop = '12px';
      const team = E('b'); team.style.cssText = 'font-size:22px';
      const teamWrap = E('div'); teamWrap.append(team);
      b.append(E('div', 'tiny', 'فريقك'), teamWrap);
      const sb = scoresBlock('النتائج', s.scoreboard || [], refs);
      c.append(b, sb);
      refs.team = team;
      return { nodes: [c], patch: (st) => {
        T(refs.team, st.team.ar); ST(refs.team, 'color', st.team.hex);
        (st.scoreboard || []).forEach((t, i) => { if (refs.lines[i]) T(refs.lines[i], ar(t.score)); });
      } };
    });
  }

  function wheelPanel(s) {
    const refs = {};
    mount('wheel:' + (s.match && s.match.format === 'spotlight' ? 'spot' : 'team'), () => {
      const c = E('div', 'card'); c.style.textAlign = 'center';
      const spin = E('div', null, '🎡'); spin.style.cssText = 'font-size:64px';
      CL(spin, 'yourturn', false); spin.style.animation = 'glowpulse 1.6s ease-in-out infinite';
      c.append(spin, E('h2', null, 'القرعة تدور…'), E('div', 'tiny', 'شاهد الشاشة — اللعبة القادمة تُختار الآن'));
      if (s.match && s.match.label) c.append(E('div', 'format', s.match.label.ar + ' · ' + s.match.label.en));
      const nodes = [c];
      if (s.match && s.match.format === 'spotlight') nodes.push(betPanel(s, refs));
      return { nodes, patch: (st) => { if (refs.betPatch) refs.betPatch(st); } };
    });
  }

  function slotPanel(s) {
    const refs = {};
    mount('slot:' + ((s.slot && s.slot.reels) ? s.slot.reels.map(r => r.id).join('-') : 'x') + (s.you.spotlight ? ':you' : ''), () => {
      const c = E('div', 'card'); c.style.textAlign = 'center';
      c.append(E('h2', null, 'اختيار النجوم'));
      if (s.you.spotlight) {
        const b = E('div', 'banner yourturn'); b.style.marginTop = '10px';
        b.append(E('div', 'tiny', 'دورك على المسرح'), E('h1', null, 'أنت في الساحة!'), E('div', 'tiny', 'استعد — الجمهور يراهن عليك'));
        c.append(b); vibrate([40, 60, 40]);
      } else {
        c.append(E('div', 'tiny', 'تُختار الأسماء على الشاشة…'));
        refs.bet = E('div', 'feed', ''); c.append(refs.bet);
      }
      const nodes = [c];
      if (s.match && s.match.format === 'spotlight' && !s.you.spotlight) nodes.push(betPanel(s, refs));
      return { nodes, patch: (st) => {
        if (refs.bet) {
          const nick = (st.match && st.match.pair || []).filter(p => p.id === st.you.bet).map(p => p.nick).join('');
          T(refs.bet, nick ? 'رهانك: ' + nick : '');
        }
        if (refs.betPatch) refs.betPatch(st);
      } };
    });
  }

  function betPanel(s, refs) {
    const c = E('div', 'card');
    c.append(E('h2', null, 'من سيفوز؟'), E('div', 'tiny', 'الرهان يمنح فريقك نقاطاً إذا أصبت'));
    const pair = s.match.pair || [];
    const row = E('div', 'grid2');
    const counts = [];
    pair.forEach((p, i) => {
      const b = E('button', 'btn');
      b.style.borderColor = p.hex; b.style.flexDirection = 'column'; b.style.gap = '2px';
      const nick = E('span', null, p.nick);
      const small = E('small', null, '');
      small.style.opacity = '.75';
      b.append(nick, small);
      b.addEventListener('click', () => { socket.emit('bet', { side: i === 0 ? 'a' : 'b' }); vibrate(15); toast('تم الرهان على ' + p.nick); });
      row.append(b); counts.push(small);
    });
    c.append(row);
    refs.betPatch = (st) => {
      const bets = (st.match && st.match.bets) || { a: 0, b: 0 };
      (st.match && st.match.pair || []).forEach((p, i) => {
        if (!counts[i]) return;
        T(counts[i], ar(i === 0 ? bets.a : bets.b) + ' رهان');
      });
      [...row.children].forEach((b, i) => {
        const p = (st.match && st.match.pair || [])[i];
        CL(b, 'gold', !!(p && st.you.bet === p.id));
      });
    };
    return c;
  }

  function announcePanel(s) {
    mount('ann:' + (s.game && s.game.id) + ':' + (s.you.spotlight ? 'you' : 'watch'), () => {
      const c = E('div', 'card');
      c.append(E('div', 'format', s.match && s.match.label ? s.match.label.ar + ' · ' + s.match.label.en : 'TEAM'));
      c.append(E('h1', null, (s.game ? s.game.emoji + ' ' + s.game.ar : 'استعد')));
      if (s.game) c.append(E('div', 'tiny', s.game.en + ' — ' + s.game.tagline));
      if (s.game && s.game.how) { const b = E('div', 'banner'); b.style.marginTop = '10px'; b.append(E('div', null, s.game.how)); c.append(b); }
      if (s.match && s.match.format === 'spotlight') c.append(E('div', 'feed', s.you.spotlight ? 'أنت أحد النجمين — استعد!' : 'شاهد… واراهن على الفائز'));
      if (s.you.afk) c.append(E('div', 'feed', 'أنت خارج اللعبة (AFK) — المس أي زر للعودة'));
      const nodes = [c];
      const refs = {};
      if (s.match && s.match.format === 'spotlight' && !s.you.spotlight) nodes.push(betPanel(s, refs));
      return { nodes, patch: (st) => { if (refs.betPatch) refs.betPatch(st); } };
    });
  }

  function countdownPanel(s) {
    const refs = {};
    mount('cd:' + (s.game && s.game.id), () => {
      const c = E('div', 'card'); c.style.textAlign = 'center';
      const label = E('div', 'tiny', s.game ? s.game.ar : 'استعد');
      const big = E('div'); big.style.cssText = 'font-family:var(--display);font-size:96px;font-weight:800;line-height:1;color:var(--lantern);text-shadow:0 0 40px rgba(255,201,107,.35)';
      const how = E('div', 'tiny', s.game ? s.game.how : '');
      c.append(label, big, how);
      refs.big = big;
      return { nodes: [c], patch: (st) => T(refs.big, ar(Math.max(1, Math.ceil((st.left || 0) / 1000)))) };
    });
  }

  function resultsPanel(s) {
    mount('res:' + ((s.results && s.results.gameId) || '') + ':' + ((s.results && s.results.at) || ''), () => {
      const r = s.results || {};
      const c = E('div', 'card');
      c.append(E('div', 'format', r.formatLabel ? r.formatLabel.ar : ''));
      c.append(E('h2', null, (r.emoji || '') + ' ' + (r.ar || 'النتائج')));
      if (r.summary) c.append(E('div', 'feed', r.summary));
      (r.crowns || []).forEach(k => c.append(E('div', 'tiny', '👑 ' + k.nick + ' — ' + k.label)));
      const tbl = E('div'); tbl.style.marginTop = '8px';
      (r.table || []).slice(0, 2).forEach((row, i) => {
        const line = E('div', 'scoreline');
        const a = E('span', 'a');
        const dot = E('i'); dot.style.cssText = 'width:11px;height:11px;border-radius:50%;display:inline-block;background:' + (row.hex || teamHex(row.team));
        a.append(dot, E('span', null, teamName(row.team)));
        line.append(E('span', 'dim', '#' + ar(i + 1)), a, E('b', null, '+' + ar((r.teamPoints && r.teamPoints[row.team]) || 0)));
        tbl.append(line);
      });
      c.append(tbl);
      c.append(E('div', 'tiny', 'نقاطك: ' + ar(s.you.score || 0) + (s.you.crowns ? ' · تيجان: ' + ar(s.you.crowns) : '')));
      return { nodes: [c] };
    });
  }

  function finalPanel(s) {
    const refs = { lines: [] };
    mount('final', () => {
      const f = s.final || {};
      const you = s.you || {};
      const myTeam = s.team || null;
      const ranked = f.ranked || [];
      const myRank = ranked.findIndex(r => myTeam && r.team === myTeam.i) + 1;
      const champ = ranked[0];

      const c = E('div', 'card fin');
      const top = E('div', 'fin-top');
      const crown = E('div', 'fin-crown', '✦');
      crown.style.color = (champ && teamHex(champ.team)) || 'var(--lantern)';
      const h = E('h1', null, champ ? teamName(champ.team) + ' يفوز' : 'انتهت الحفلة');
      top.append(crown, h);
      if (myTeam) {
        const mine = myRank === 1 ? 'فريقك فاز — ' + teamName(myTeam.i) : (myRank ? 'فريقك في المركز ' + ar(myRank) : '');
        if (mine) top.append(E('div', 'fin-sub', mine));
      }
      refs.h = h;

      /* the player's own night: their points and crowns, the one number they came for */
      const me = E('div', 'fin-me');
      const meScore = E('b', null, ar(you.score || 0));
      const meLbl = E('span', null, 'نقطة لك');
      me.append(meScore, meLbl);
      if (you.crowns) {
        const cr = E('span', 'fin-crowns', '👑'.repeat(Math.min(3, you.crowns)));
        me.append(cr);
      }

      const board = scoresBlock('الفرق', ranked.map((r, i) => ({ ar: teamName(r.team), hex: teamHex(r.team), score: r.score, rank: i + 1 })), refs);

      const cta = E('button', 'btn primary go', 'شاهد الشاشة');
      cta.addEventListener('click', (e) => { e.preventDefault(); vibrate(8); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      const copy = E('button', 'btn ghost tiny-btn', 'انسخ رابط اللعب');
      copy.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(location.origin + '/play');
          T(copy, 'تم النسخ ✓');
        } catch (err) { T(copy, location.origin + '/play'); }
        vibrate(6);
      });
      const acts = E('div', 'fin-acts'); acts.append(cta, copy);

      c.append(top, me, board, acts);
      return { nodes: [c], patch: (st) => {
        const rf = (st.final && st.final.ranked) || [];
        rf.forEach((r, i) => { if (refs.lines[i]) T(refs.lines[i], ar(r.score)); });
        if (st.you) T(meScore, ar(st.you.score || 0));
      } };
    });
  }

  /* ---------------------------------------------------------------- controls */
  function buildControls(v) {
    const k = v.controls || { type: 'none' };
    const hash = JSON.stringify([k.type, k.disabled, k.label, k.en, k.trap, k.dirs, k.emoji, k.axis, k.darts]);
    const wrap = el('div', 'pad');
    wrap.id = 'ctl';
    if (k.type === 'tap') {
      const b = el('button', 'btn primary huge' + (k.disabled ? '' : ''), (k.label || 'اضغط') + '<br><small style="font-size:14px;opacity:.8">' + (k.en || '') + '</small>');
      b.disabled = !!k.disabled;
      const fire = () => { if (k.disabled) return; socket.emit('input', { kind: 'tap' }); vibrate(12); b.style.transform = 'scale(.96)'; setTimeout(() => b.style.transform = '', 90); };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); fire(); });
      wrap.append(b);
    } else if (k.type === 'none') {
      const w = el('div', 'watch');
      w.innerHTML = '<div class="wemoji">' + (k.emoji || '📺') + '</div><div class="wtitle">' + (k.label || 'شاهد الشاشة') + '</div><div class="wsub">' + (k.en || '') + '</div>';
      wrap.append(w);
    } else if (k.type === 'side') {
      const g = el('div'); g.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1';
      [['left', k.left || 'يسار', '←'], ['right', k.right || 'يمين', '→']].forEach(([side, label, arrow]) => {
        const b = el('button', 'btn huge', `<span style="font-size:1.5em;font-weight:900">${arrow}</span><br><span style="font-size:.72em">${label}</span>`);
        b.style.minHeight = '150px';
        b.dataset.side = side;
        b.disabled = !!k.disabled;
        if (k.chosen === side) b.style.background = 'linear-gradient(180deg,#f2e2b0,#c9a03f)';
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault(); if (k.disabled) return;
          socket.emit('input', { kind: 'side', side });
          vibrate(side === 'left' ? 8 : 14);
          g.querySelectorAll('button').forEach(x => { x.style.background = x.dataset.side === side ? 'linear-gradient(180deg,#f2e2b0,#c9a03f)' : ''; });
        });
        g.append(b);
      });
      wrap.append(g);
    } else if (k.type === 'tilt') {
      /* Tilt panel. iOS refuses sensor access without a user gesture, so a phone that has not granted it gets a
       * single "allow motion" button and a drag fallback that sends the very same messages. */
      const box = el('div', 'tiltbox');
      const track = el('div', 'track');
      const puck = el('div', 'puck'); track.append(puck);
      const hint = el('div', 'tiny', k.label || 'أمِل جوالك');
      hint.style.textAlign = 'center';
      const allow = el('button', 'btn', 'السماح بالحركة · Allow motion');
      allow.style.marginTop = '8px';
      const hold = k.axis === 'pour' ? el('button', 'btn primary', 'أو اضغط مطوّلاً للصبّ') : null;
      box.append(track, hint, allow);
      if (hold) box.append(hold);
      const setPuck = (gx) => { puck.style.transform = `translateX(${Math.max(-1, Math.min(1, gx)) * 46}%)`; };
      wrap.append(box);

      const emitTilt = (gx, gy) => { socket.emit('input', { kind: 'tilt', gx, gy }); };
      let gx = 0, gy = 0, on = false, timer = null;
      const startLoop = () => {
        if (timer) return;
        timer = setInterval(() => { if (!k.disabled) emitTilt(gx, gy); }, 80);
      };
      const onOrient = (e) => {
        const gamma = e.gamma || 0, beta = e.beta || 0;
        gx = Math.max(-1, Math.min(1, gamma / 30));
        gy = Math.max(0, Math.min(1, (beta - 25) / 40));
        setPuck(gx);
      };
      const enable = () => {
        const D = window.DeviceOrientationEvent;
        const go = () => { window.addEventListener('deviceorientation', onOrient, true); on = true; allow.style.display = 'none'; startLoop(); emitTilt(0, 0); };
        if (D && typeof D.requestPermission === 'function') {
          D.requestPermission().then(r => { if (r === 'granted') go(); else { hint.textContent = 'المستشعر مرفوض — اسحب المؤشر'; } }).catch(() => { hint.textContent = 'المستشعر غير متاح — اسحب المؤشر'; });
        } else if (D) go(); else hint.textContent = 'اسحب المؤشر للتحكم';
      };
      allow.addEventListener('click', enable);
      /* drag fallback: works on every phone and on a laptop touchpad */
      let dragging = false;
      const fromEvent = (e) => {
        const r = track.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        gx = Math.max(-1, Math.min(1, x)); setPuck(gx); emitTilt(gx, k.axis === 'pour' ? Math.abs(gx) : gy);
      };
      track.addEventListener('pointerdown', (e) => { if (k.disabled) return; dragging = true; track.setPointerCapture(e.pointerId); fromEvent(e); });
      track.addEventListener('pointermove', (e) => { if (dragging && !k.disabled) fromEvent(e); });
      const stopDrag = () => { dragging = false; };
      track.addEventListener('pointerup', stopDrag); track.addEventListener('pointercancel', stopDrag);
      if (hold) {
        hold.addEventListener('pointerdown', (e) => { e.preventDefault(); hold.style.background = 'linear-gradient(180deg,#f2e2b0,#c9a03f)'; emitTilt(0, 1); clearInterval(hold.__t); hold.__t = setInterval(() => emitTilt(0, 1), 100); });
        const rel = () => { hold.style.background = ''; clearInterval(hold.__t); emitTilt(0, 0); };
        hold.addEventListener('pointerup', rel); hold.addEventListener('pointercancel', rel); hold.addEventListener('pointerleave', rel);
      }
      if (k.disabled) { box.style.opacity = '.5'; allow.style.display = 'none'; }
    } else if (k.type === 'dart') {
      /* The phone is the dart: tilt to aim, flick to throw. The throw is decided on the phone and sent as one
       * message, so a slow network can delay the dart but cannot bend it. Drag + swipe do the same thing on a
       * phone with no sensor (or one that refused the permission). */
      const box = el('div', 'dartbox');
      const board = el('div', 'board');
      const ret = el('div', 'ret'); board.append(ret);
      const hint = el('div', 'tiny', k.label || 'أمِل للتصويب · أفلت للرمي');
      hint.style.textAlign = 'center';
      const allow = el('button', 'btn', 'السماح بالحركة · Allow motion');
      allow.style.marginTop = '6px';
      const pop = el('div', 'dartpop', '');
      box.append(board, hint, allow, pop);
      wrap.append(box);

      let ax = 0, ay = 0, sensor = false, lastThrow = 0, peak = 0, armed = false;
      const setAim = (x, y) => {
        ax = Math.max(-1, Math.min(1, x)); ay = Math.max(-1, Math.min(1, y));
        ret.style.transform = `translate(-50%,-50%) translate(${ax * 46}%, ${ay * 46}%)`;
      };
      const throwDart = (power) => {
        const now = Date.now();
        if (k.disabled || now - lastThrow < 950) return;
        lastThrow = now;
        socket.emit('input', { kind: 'dart', x: ax, y: -ay, power: Math.max(0.3, Math.min(1, power)) });
        vibrate(18);
        pop.textContent = power > 0.75 ? 'رمية قوية' : power > 0.5 ? 'رمية' : 'رمية خفيفة';
        pop.classList.remove('go'); void pop.offsetWidth; pop.classList.add('go');
      };
      const onOrient = (e) => {
        const gamma = e.gamma || 0, beta = e.beta || 0;
        setAim(gamma / 34, (beta - 40) / 34);
      };
      const onMotion = (e) => {
        const a = e.accelerationIncludingGravity || e.acceleration;
        if (!a) return;
        const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
        peak = Math.max(peak * 0.9, mag);
        if (mag > 20 && peak > 20 && !armed) { armed = true; throwDart(Math.min(1, (mag - 12) / 26)); }
        if (mag < 14) armed = false;
      };
      const enable = () => {
        const D = window.DeviceOrientationEvent, M = window.DeviceMotionEvent;
        const go = () => {
          if (D) window.addEventListener('deviceorientation', onOrient, true);
          if (M) window.addEventListener('devicemotion', onMotion, true);
          sensor = true; allow.style.display = 'none'; hint.textContent = 'أمِل للتصويب · أفلت للرمي';
        };
        const perm = D && typeof D.requestPermission === 'function' ? D.requestPermission() : Promise.resolve('granted');
        perm.then(r => {
          if (r !== 'granted') { hint.textContent = 'المستشعر مرفوض — اسحب للتصويب وأفلت للرمي'; return; }
          if (M && typeof M.requestPermission === 'function') return M.requestPermission().then(r2 => { if (r2 === 'granted') go(); else hint.textContent = 'اسحب للتصويب'; });
          go();
        }).catch(() => { hint.textContent = 'اسحب للتصويب وأفلت للرمي'; });
      };
      allow.addEventListener('click', enable);
      /* drag to aim, flick to throw: the last 120 ms of pointer travel sets the power */
      let drag = false, pts = [];
      board.addEventListener('pointerdown', (e) => { if (k.disabled) return; drag = true; pts = [{ x: e.clientX, y: e.clientY, t: Date.now() }]; board.setPointerCapture(e.pointerId); });
      board.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const r = board.getBoundingClientRect();
        setAim((e.clientX - (r.left + r.width / 2)) / (r.width / 2), (e.clientY - (r.top + r.height / 2)) / (r.height / 2));
        pts.push({ x: e.clientX, y: e.clientY, t: Date.now() });
        if (pts.length > 12) pts.shift();
      });
      const endDrag = (e) => {
        if (!drag) return; drag = false;
        const now = Date.now();
        const recent = pts.filter(p => now - p.t < 140);
        let v = 0;
        if (recent.length >= 2) {
          const a = recent[0], b = recent[recent.length - 1];
          v = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, b.t - a.t); /* px per ms */
        }
        throwDart(sensor ? 0.75 : 0.35 + Math.min(0.65, v / 2.2));
      };
      board.addEventListener('pointerup', endDrag); board.addEventListener('pointercancel', endDrag);
      if (k.disabled) { box.style.opacity = '.45'; allow.style.display = 'none'; }
    } else if (k.type === 'arrows') {
      const g = el('div', 'arrows');
      [['up', '↑'], ['left', '←'], ['right', '→'], ['down', '↓']].forEach(([d, sym]) => {
        const b = el('button', 'btn arrow ' + d, sym);
        b.disabled = !!k.disabled;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (k.disabled) return; socket.emit('input', { kind: 'arrow', dir: d }); vibrate(8); b.style.transform = 'scale(.94)'; setTimeout(() => b.style.transform = '', 80); });
        g.append(b);
      });
      const mid = el('div', 'arrow mid'); mid.id = 'arrowmid'; g.append(mid);
      wrap.append(g);
    } else if (k.type === 'colours') {
      const g = el('div', 'tiles' + (k.trap ? ' trap' : ''));
      TEAMS.forEach(t => {
        const b = el('button', 'tile' + (k.chosen === t.i ? ' sel' : ''), t.ar);
        b.style.background = t.hex;
        b.disabled = !!k.disabled;
        b.addEventListener('click', () => { if (k.disabled) return; socket.emit('input', { kind: 'zone', zone: t.i }); vibrate(10); });
        g.append(b);
      });
      wrap.append(g);
    } else if (k.type === 'stick') {
      const box = el('div', 'stick');
      const ring = el('div', 'ring');
      box.append(ring, el('div', 'lbl', k.disabled ? 'خرجت' : 'اسحب للحركة'));
      const max = 46;
      const setRing = (dx, dy) => { ring.style.transform = `translate(${dx * max}px, ${dy * max}px)`; };
      const sendMove = (() => {
        let last = 0;
        return (dx, dz) => { const now = Date.now(); if (now - last < 90) return; last = now; socket.emit('input', { kind: 'move', dx, dz }); };
      })();
      const start = (e) => {
        if (k.disabled) return;
        stick.active = true; stick.id = e.pointerId; box.setPointerCapture(e.pointerId);
        if (sendTimer) clearInterval(sendTimer);
        sendTimer = setInterval(() => { if (stick.active && (stick.dx || stick.dz)) sendMove(stick.dx, stick.dz); }, 100);
      };
      const move = (e) => {
        if (!stick.active) return;
        const r = box.getBoundingClientRect();
        let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let dz = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const m = Math.hypot(dx, dz);
        if (m > 1) { dx /= m; dz /= m; }
        if (m < 0.16) { dx = 0; dz = 0; }
        stick.dx = dx; stick.dz = dz; setRing(dx, dz); sendMove(dx, dz);
      };
      const end = () => { stick.active = false; stick.dx = 0; stick.dz = 0; setRing(0, 0); if (sendTimer) clearInterval(sendTimer); socket.emit('input', { kind: 'move', dx: 0, dz: 0 }); };
      box.addEventListener('pointerdown', start); box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end); box.addEventListener('lostpointercapture', end);
      wrap.append(box);
      const dash = el('button', 'btn gold', k.dash ? 'اندفاع ⚡' : 'يُشحن…');
      dash.disabled = !!k.disabled || !k.dash;
      dash.addEventListener('pointerdown', (e) => { e.preventDefault(); if (k.disabled || !k.dash) return; socket.emit('input', { kind: 'dash' }); vibrate(25); });
      wrap.append(dash);
    } else if (k.type === 'hold') {
      const b = el('button', 'btn primary huge', (k.label || 'اضغط') + '<br><small style="font-size:14px;opacity:.8">' + (k.en || '') + '</small>');
      b.disabled = !!k.disabled;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (k.disabled) return; b.setPointerCapture(e.pointerId); socket.emit('input', { kind: 'hold', on: true }); vibrate(10); b.style.background = 'linear-gradient(180deg,#f2e2b0,#c9a03f)'; });
      const up = () => { socket.emit('input', { kind: 'hold', on: false }); b.style.background = ''; };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      wrap.append(b);
    } else if (k.type === 'vote') {
      const g = el('div', 'arrows');
      const sym = { up: '↑', left: '←', right: '→', down: '↓' };
      ['up', 'left', 'right', 'down'].forEach(d => {
        const b = el('button', 'btn arrow ' + d, sym[d]);
        b.disabled = !!k.disabled;
        let t = null;
        const send = () => { if (k.disabled) return; socket.emit('input', { kind: 'vote', dir: d }); };
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); send(); vibrate(8); if (t) clearInterval(t); t = setInterval(send, 140); });
        const stop = () => { if (t) clearInterval(t); t = null; };
        b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop); b.addEventListener('pointerleave', stop);
        g.append(b);
      });
      const mid = el('div', 'arrow mid'); mid.id = 'votemid'; g.append(mid);
      wrap.append(g);
    } else if (k.type === 'pick') {
      const g = el('div'); g.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1';
      (k.options || []).forEach(o => {
        const b = el('button', 'btn huge', `<span style="font-size:1.4em;font-weight:900">${o.label}</span><br><small style="opacity:.75">${o.en || ''}</small>`);
        b.style.background = o.hex || 'rgba(255,255,255,.12)';
        b.style.color = '#08251a';
        b.style.minHeight = '120px';
        b.disabled = !!k.disabled;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (k.disabled) return; socket.emit('input', { kind: 'vote', dir: o.id }); vibrate(14); });
        g.append(b);
      });
      wrap.append(g);
    } else if (k.type === 'word') {
      const inp = el('input'); inp.type = 'text'; inp.placeholder = 'اكتب الكلمة…'; inp.id = 'wordinp';
      inp.autocomplete = 'off'; inp.autocapitalize = 'off'; inp.spellcheck = false;
      inp.style.cssText = 'width:100%;font:900 26px Cairo,sans-serif;padding:16px;border-radius:16px;border:2px solid rgba(224,181,88,.5);background:rgba(255,255,255,.08);color:#f4efe1;text-align:center';
      const send = el('button', 'btn primary big', 'إرسال');
      send.style.minHeight = '64px';
      const go = () => { const v = inp.value.trim(); if (v) { socket.emit('input', { kind: 'word', text: v }); vibrate(10); } };
      send.addEventListener('click', go);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      if (k.disabled) { inp.disabled = true; send.disabled = true; }
      wrap.append(inp, send);
      setTimeout(() => { try { inp.focus(); } catch (e) {} }, 60);
    } else if (k.type === 'trace') {
      const cv = el('canvas'); cv.id = 'tracecv';
      cv.width = 720; cv.height = 720;
      cv.style.cssText = 'width:100%;aspect-ratio:1;border-radius:18px;background:rgba(8,32,24,.6);touch-action:none;border:1px solid rgba(224,181,88,.25)';
      const ctx = cv.getContext('2d');
      const target = k.target || [];
      const paint = (stroke) => {
        ctx.clearRect(0, 0, 720, 720);
        ctx.strokeStyle = 'rgba(224,181,88,.22)'; ctx.lineWidth = 46; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); target.forEach((q, i) => { const X = q[0] * 720, Y = (1 - q[1]) * 720; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,244,214,.75)'; ctx.lineWidth = 8; ctx.setLineDash([18, 14]);
        ctx.beginPath(); target.forEach((q, i) => { const X = q[0] * 720, Y = (1 - q[1]) * 720; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
        ctx.setLineDash([]);
        if (stroke && stroke.length > 1) {
          ctx.strokeStyle = '#7ef0c4'; ctx.lineWidth = 12;
          ctx.beginPath(); stroke.forEach((q, i) => { const X = q[0] * 720, Y = (1 - q[1]) * 720; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
        }
      };
      paint(null);
      let pts = [], drawing = false;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))]; };
      cv.addEventListener('pointerdown', (e) => { e.preventDefault(); if (k.disabled) return; drawing = true; pts = [pos(e)]; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', (e) => { if (!drawing) return; pts.push(pos(e)); if (pts.length % 3 === 0) paint(pts); });
      const finish = () => {
        if (!drawing) return; drawing = false;
        if (pts.length > 6) { socket.emit('input', { kind: 'stroke', pts: pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1) }); vibrate(14); paint(pts); }
      };
      cv.addEventListener('pointerup', (e) => { e.preventDefault(); finish(); });
      cv.addEventListener('pointercancel', finish);
      wrap.append(cv);
    } else if (k.type === 'aim') {
      const lab = el('div', 'tiny', 'الزاوية');
      const rng = el('input'); rng.type = 'range'; rng.min = '12'; rng.max = '82'; rng.step = '1'; rng.value = k.angle || 45; rng.id = 'aimrange';
      rng.style.cssText = 'width:100%;height:44px;accent-color:#e0b558';
      let lastSend = 0;
      rng.addEventListener('input', () => { const now = Date.now(); if (now - lastSend < 70) return; lastSend = now; socket.emit('input', { kind: 'aim', angle: Number(rng.value) }); });
      const angleRow = el('div'); angleRow.style.cssText = 'display:flex;gap:10px;align-items:center';
      angleRow.append(rng, el('b', null, String(k.angle || 45) + '°'));
      rng.addEventListener('input', () => { angleRow.lastElementChild.textContent = rng.value + '°'; });
      const bar = el('div', 'meter'); bar.style.height = '12px'; const fill = el('i'); fill.id = 'aimcharge'; fill.style.width = (k.charge || 0) + '%'; bar.append(fill);
      const fire = el('button', 'btn primary huge', 'اضغط باستمرار للشحن<br><small style="opacity:.8">اترك للإطلاق</small>');
      fire.disabled = !!k.disabled;
      fire.addEventListener('pointerdown', (e) => { e.preventDefault(); if (k.disabled) return; fire.setPointerCapture(e.pointerId); socket.emit('input', { kind: 'hold', on: true }); vibrate(12); });
      const up = () => { socket.emit('input', { kind: 'hold', on: false }); };
      fire.addEventListener('pointerup', up); fire.addEventListener('pointercancel', up); fire.addEventListener('lostpointercapture', up);
      wrap.append(lab, angleRow, bar, fire);
    } else {
      wrap.append(el('div', 'card', '<div class="tiny">انتظر…</div>'));
    }
    return { node: wrap, hash };
  }

  function updatePlayPanel(s) {
    const v = s.view || { head: '', sub: '', controls: { type: 'none' }, stats: [], meters: [], feed: '' };
    T(document.getElementById('phead'), v.head || (s.game ? s.game.ar : ''));
    const sub = document.getElementById('psub');
    if (sub) { T(sub, v.sub || ''); ST(sub, 'display', v.sub ? '' : 'none'); }

    /* stats: one row per key, values patched — never a fresh innerHTML every 200 ms */
    const st = document.getElementById('pstat');
    if (st) {
      const stats = v.stats || [];
      if (st.childElementCount !== stats.length) {
        st.textContent = '';
        stats.forEach(() => {
          const row = E('span');
          const k = E('span', 'dim'); const val = E('b');
          row.append(k, val); st.append(row);
        });
      }
      stats.forEach((x, i) => {
        const row = st.children[i]; if (!row) return;
        T(row.firstChild, x.k); T(row.lastChild, String(x.v));
      });
    }

    /* meters: same idea — the track is built once, the width is the only thing that moves */
    const meters = document.getElementById('pmeters');
    if (meters) {
      const list = v.meters || [];
      if (meters.childElementCount !== list.length) {
        meters.textContent = '';
        list.forEach(() => {
          const row = E('div'); row.style.cssText = 'display:flex;gap:8px;align-items:center;font-size:12px';
          const label = E('span', 'dim');
          const mm = E('div', 'meter'); mm.style.flex = '1';
          const fill = E('i'); mm.append(fill);
          row.append(label, mm); meters.append(row);
        });
      }
      list.forEach((m, i) => {
        const row = meters.children[i]; if (!row) return;
        T(row.firstChild, m.label || m.k || '');
        ST(row.lastChild.firstChild, 'width', Math.max(0, Math.min(100, m.pct)) + '%');
      });
    }

    /* live vote split: four fixed chips, numbers patched */
    const votes = document.getElementById('pvotes');
    if (votes) {
      const vv = v.votes;
      ST(votes, 'display', vv ? 'flex' : 'none');
      if (vv) {
        if (votes.childElementCount !== 4) {
          votes.textContent = '';
          ['left', 'up', 'down', 'right'].forEach(() => {
            const b = E('div');
            b.style.cssText = 'flex:1;padding:4px;border-radius:8px;background:rgba(255,255,255,.07);text-align:center';
            votes.append(b);
          });
        }
        [['left', '←'], ['up', '↑'], ['down', '↓'], ['right', '→']].forEach(([k2, arrow], i) => {
          T(votes.children[i], arrow + ' ' + ar(Math.round(vv[k2] || 0)) + '٪');
        });
      }
    }

    T(document.getElementById('pfeed'), v.feed || '');

    /* live state on the persistent control: disabled flags, chosen tile, charge, dash */
    const k = v.controls || {};
    const ctl = document.getElementById('ctl');
    if (ctl) {
      ctl.querySelectorAll('button').forEach(b => { if (b.dataset.fixed) return; b.disabled = !!k.disabled; });
      if (k.type === 'colours') ctl.querySelectorAll('.tile').forEach((b, i) => CL(b, 'sel', k.chosen === i + 1));
      if (k.type === 'side') ctl.querySelectorAll('button[data-side]').forEach(b => { ST(b, 'background', k.chosen === b.dataset.side ? 'linear-gradient(180deg,var(--lantern-2),var(--brass))' : ''); });
      if (k.type === 'stick') {
        const dash = document.getElementById('dashbtn');
        if (dash) { dash.disabled = !!k.disabled || !k.dash; T(dash, k.dash ? 'اندفاع ⚡' : 'يُشحن…'); }
      }
      if (k.type === 'aim') {
        const rng = document.getElementById('aimrange'), charge = document.getElementById('aimcharge');
        if (rng && document.activeElement !== rng) rng.value = k.angle;
        if (charge) ST(charge, 'width', (k.charge || 0) + '%');
      }
    }
  }


  /* ---------------------------------------------------------------- board + cheer */
  let boardKey = '';
  function boardPanel(s) {
    const b = s.board || {};
    const key = 'board|' + (b.vote ? 'vote' : 'walk');
    if (boardKey !== key) {
      boardKey = key;
      screen.textContent = '';
      const card = E('div', 'card'); card.id = 'playcard';
      card.style.cssText = 'display:flex;flex-direction:column;gap:12px;flex:1';
      const head = E('h1', null, b.vote ? 'الطريق يتفرّع' : 'على اللوحة');
      const sub = E('div', 'tiny', b.vote ? 'صوّتوا — الأغلبية تختار للفريق' : 'رمي النرد الآن… شاهدوا الشاشة');
      sub.style.cssText = 'font-size:14px;opacity:.75;margin-top:-6px';
      const line = E('div', 'starline'); line.id = 'bline';
      card.append(head, sub, line);
      if (b.vote) {
        const wrap = E('div', 'votebig'); wrap.id = 'bvote';
        (b.vote.options || []).forEach(o => {
          const btn = E('button', 'opt');
          const bb = E('b', null, o.ar);
          const ss = E('span', null, o.note || '');
          btn.append(bb, ss); btn.dataset.id = o.id;
          btn.addEventListener('click', () => { socket.emit('vote', { id: o.id }); vibrate(28); paintVote(s); });
          wrap.append(btn);
        });
        card.append(wrap);
      } else {
        const w = E('div', 'banner', '✦');
        w.style.cssText = 'font-size:52px;margin-top:auto';
        card.append(w);
      }
      screen.append(card);
    }
    const bl = document.getElementById('bline');
    if (bl) {
      bl.textContent = '';
      const a = E('span', null, 'الفيروز ✦ ' + ar((b.stars && b.stars[1]) || 0) + ' · ' + ar((b.coins && b.coins[1]) || 0) + ' قطعة');
      const c = E('span', null, 'الرمان ✦ ' + ar((b.stars && b.stars[2]) || 0) + ' · ' + ar((b.coins && b.coins[2]) || 0) + ' قطعة');
      bl.append(a, c);
    }
    paintVote(s);
  }
  function paintVote(s) {
    const b = s.board || {};
    const wrap = document.getElementById('bvote'); if (!wrap || !b.vote) return;
    const mine = (b.vote.mine || null);
    wrap.querySelectorAll('.opt').forEach(o => CL(o, 'sel', o.dataset.id === mine));
    const hits = b.vote.hits || {};
    const total = Math.max(1, (hits.short || 0) + (hits.long || 0));
    wrap.querySelectorAll('.opt').forEach(o => {
      const sp = o.querySelector('span'); if (!sp) return;
      const o0 = (b.vote.options || []).find(x => x.id === o.dataset.id) || {};
      sp.textContent = (o0.note || '') + ' · ' + ar(hits[o.dataset.id] || 0) + ' صوت';
    });
  }

  /* a watching phone still has a thumb: one big golden cheer button, and its count */
  function cheerBar(s) {
    let el = document.getElementById('cheer');
    if (!s.cheer) { if (el) el.remove(); return; }
    if (!el) {
      el = E('div', 'cheerbar'); el.id = 'cheer';
      const em = E('div', 'cemoji', '📣');
      const tx = E('div', 'ctext');
      const b1 = E('b', null, 'شجّع فريقك');
      const b2 = E('span', null, 'اضغط — الجمهور يرفع فريقك');
      tx.append(b1, b2);
      const btn = E('button', 'cbtn', 'شجّع!');
      btn.addEventListener('click', () => {
        socket.emit('cheer');
        vibrate(20);
        el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      });
      el.append(em, tx, btn);
      screen.append(el);
    }
    const sp = el.querySelector('.ctext span');
    if (sp) T(sp, ar(s.cheer.count || 0) + ' تشجيع لفريقك');
  }

  /* ---------------------------------------------------------------- render */
  let lastPhase = '', lastSpot = false, playingSig = '';
  function render() {
    const s = state; if (!s || !joined) return;
    document.body.dataset.phase = s.phase || '';
    document.body.dataset.game = (s.game && s.game.id) || '';
    syncTeams(s);
    teamChip(s.team);
    if (s.you) {
      if (s.you.spotlight && !lastSpot) { toast('أنت في الساحة!'); vibrate([50, 60, 120]); }
      lastSpot = s.you.spotlight;
    }
    if (s.phase === 'playing' && s.view) {
      const sig = (s.mode || '') + '|' + ((s.view.controls && s.view.controls.type) || 'none');
      if (sig !== playingSig) {
        playingSig = sig; panelKey = null; panelPatch = null; screen.textContent = '';
        try {
          const c = E('div', 'card');
          c.id = 'playcard';
          c.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1';
          const head = E('h2', null, s.view.head || (s.game ? s.game.ar : '')); head.id = 'phead';
          const sub = E('div', 'tiny'); sub.id = 'psub';
          const st = E('div', 'stat'); st.id = 'pstat';
          const meters = E('div'); meters.id = 'pmeters'; meters.style.cssText = 'display:grid;gap:6px';
          const votes = E('div'); votes.id = 'pvotes'; votes.style.cssText = 'display:none;gap:6px;font-size:12px;font-weight:700';
          const feed = E('div', 'feed'); feed.id = 'pfeed';
          const ctlWrap = E('div'); ctlWrap.id = 'ctlwrap'; ctlWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;flex:1';
          ctlWrap.append(buildControls(s.view).node);
          c.append(head, sub, st, meters, votes, feed, ctlWrap);
          screen.append(c);
        } catch (e) { screen.textContent = ''; screen.append(E('div', 'card', 'خطأ في العرض')); }
      }
      updatePlayPanel(s);
      cheerBar(s);
      return;
    }
    playingSig = '';
    cheerBar(s);
    const key = s.phase + '|' + (s.mode || '');
    if (s.phase === 'lobby') lobbyPanel(s);
    else if (s.phase === 'wheel') wheelPanel(s);
    else if (s.phase === 'slot') slotPanel(s);
    else if (s.phase === 'announce') announcePanel(s);
    else if (s.phase === 'countdown') countdownPanel(s);
    else if (s.phase === 'board') boardPanel(s);
    else if (s.phase === 'results') resultsPanel(s);
    else if (s.phase === 'final') finalPanel(s);
    else lobbyPanel(s);
    if (panelPatch) panelPatch(s);
    lastPhase = key;
  }

  socket.on('connect', () => { $('#off').classList.remove('on'); if (joined) socket.emit('join', { nick: store.nick, token: store.token }, () => {}); });
  socket.on('disconnect', () => $('#off').classList.add('on'));
  socket.on('pad', (s) => { state = s; if (!joined) { joined = true; } render(); });
  socket.on('lobby', () => { /* pad carries everything a phone needs */ });
  socket.on('kicked', (m) => { joined = false; store.token = ''; joinScreen(m && m.reason === 'kick' ? 'تم إخراجك من الحفلة' : 'انتهت الجلسة'); });

  joinScreen(null);
  setTimeout(() => { if (store.token && !joined) { socket.emit('join', { nick: store.nick || 'ضيف', token: store.token, code }, (r) => { if (r && r.ok) { joined = true; me = r; } else joinScreen(null); }); } }, 250);
})();
