/** Renders the three art-direction frames (A/B/C) for DESIGN.md. Static mocks: no sockets, no engine. */
'use strict';
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'design');

const body = (v) => `
<div class="wrap">
  <header>
    <div class="lock">
      <div class="crest">${v.crest}</div>
      <div><div class="ar">مجلس بارتي</div><div class="en">MAJLIS PARTY</div></div>
    </div>
    <div class="phase">مرحلة اللعب</div>
    <div class="timer">٣٢</div>
  </header>

  <main>
    <div class="wheel">
      <div class="ring">${['سهام','قهوة','تمر','صينية','ماراثون','جسر'].map((n, i) =>
        `<span style="transform:rotate(${i * 60}deg) translateY(-118px) rotate(-${i * 60}deg)">${n}</span>`).join('')}</div>
      <div class="hub">الذهب<br><b>٢٤٠</b></div>
      <div class="needle"></div>
    </div>

    <div class="card">
      <div class="kicker">سهام المجلس</div>
      <h1>الجولة الثالثة</h1>
      <p>أمِل جوالك للتصويب وأفلته لترمي — ثلاث سهام لكل لاعب</p>
      <div class="qr"><div class="qrsq"></div><div class="qrside"><div class="lbl">امسح للدخول</div><div class="code">٤٨٢٧</div><div class="tiny">majlis.party/play</div></div></div>
    </div>
  </main>

  <section class="teams">
    <div class="team a">
      <div class="hem"></div>
      <div class="row"><span class="tcrest">◆</span><span class="nm">فريق الفيروز</span><span class="sc">٣٢٠</span></div>
      <div class="bar"><i style="width:72%"></i></div>
      <div class="pl">١٨ لاعباً</div>
    </div>
    <div class="team b">
      <div class="hem"></div>
      <div class="row"><span class="tcrest">✦</span><span class="nm">فريق العنبر</span><span class="sc">٢٨٠</span></div>
      <div class="bar"><i style="width:58%"></i></div>
      <div class="pl">١٧ لاعباً</div>
    </div>
  </section>
</div>`;

const fonts = `
@font-face{font-family:Baloo;src:url(/vendor/baloo-800-arabic.woff2) format('woff2');font-weight:800;unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Baloo;src:url(/vendor/baloo-800-latin.woff2) format('woff2');font-weight:800}
@font-face{font-family:Baloo;src:url(/vendor/baloo-600-arabic.woff2) format('woff2');font-weight:600;unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Tajawal;src:url(/vendor/tajawal-700-arabic.woff2) format('woff2');font-weight:700;unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Tajawal;src:url(/vendor/tajawal-700-latin.woff2) format('woff2');font-weight:700}
@font-face{font-family:Tajawal;src:url(/vendor/tajawal-400-arabic.woff2) format('woff2');font-weight:400;unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Tajawal;src:url(/vendor/tajawal-400-latin.woff2) format('woff2');font-weight:400}
`;

const shared = `
*{box-sizing:border-box}
html,body{height:100%;margin:0;font-family:Tajawal,system-ui,sans-serif}
.wrap{height:100vh;padding:3vh 3vw;display:flex;flex-direction:column;gap:2.4vh}
header{display:flex;align-items:center;justify-content:space-between}
.lock{display:flex;align-items:center;gap:14px}
.crest{width:56px;height:56px;border-radius:16px;display:grid;place-items:center;font-size:28px}
.ar{font-family:Baloo,sans-serif;font-weight:800;font-size:38px;line-height:1}
.en{font-size:12px;letter-spacing:.28em;font-weight:700;opacity:.72;margin-top:4px}
.phase{font-family:Tajawal;font-weight:700;font-size:16px;padding:9px 20px;border-radius:999px}
.timer{font-family:Baloo;font-weight:800;font-size:40px;min-width:96px;text-align:center;padding:6px 14px;border-radius:18px}
main{flex:1;display:grid;grid-template-columns:1.05fr 1fr;gap:3vw;align-items:center}
.wheel{position:relative;display:grid;place-items:center;height:100%}
.ring{position:relative;width:330px;height:330px;border-radius:50%;display:grid;place-items:center}
.ring span{position:absolute;font-family:Tajawal;font-weight:700;font-size:15px}
.hub{text-align:center;font-family:Tajawal;font-weight:700;font-size:14px}
.hub b{display:block;font-family:Baloo;font-weight:800;font-size:34px;margin-top:2px}
.needle{position:absolute;top:6px;width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent}
.card{padding:26px 28px;border-radius:26px}
.kicker{font-family:Tajawal;font-weight:700;font-size:14px;letter-spacing:.12em;margin-bottom:6px}
.card h1{font-family:Baloo;font-weight:800;font-size:44px;margin:0 0 8px;line-height:1.1}
.card p{font-size:17px;line-height:1.6;margin:0 0 16px}
.qr{display:flex;gap:16px;align-items:center}
.qrsq{width:104px;height:104px;border-radius:12px;background:
  repeating-conic-gradient(#000 0 25%, transparent 0 50%) 0 0/22px 22px, #fff}
.code{font-family:Baloo;font-weight:800;font-size:34px;line-height:1}
.lbl{font-size:13px;font-weight:700;opacity:.75}
.tiny{font-size:12px;opacity:.6;margin-top:4px}
.teams{display:grid;grid-template-columns:1fr 1fr;gap:1.6vw}
.team{position:relative;border-radius:22px;padding:16px 20px 18px;overflow:hidden}
.hem{position:absolute;inset-inline:0;top:0;height:8px}
.row{display:flex;align-items:center;gap:14px}
.tcrest{font-size:26px}
.nm{font-family:Baloo;font-weight:800;font-size:30px;flex:1}
.sc{font-family:Baloo;font-weight:800;font-size:46px;font-variant-numeric:tabular-nums}
.bar{height:5px;border-radius:99px;margin-top:12px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:99px}
.pl{font-size:13px;font-weight:700;opacity:.7;margin-top:8px}
`;

const A = `
:root{--night:#14102b;--night2:#1d1740;--night3:#2a2154;--brass:#c99441;--lantern:#ffc96b;--cream:#f6ead2;--a:#2fd0b4;--b:#f6a93b}
body{background:
  radial-gradient(900px 620px at 62% 34%, rgba(255,201,107,.18), transparent 70%),
  radial-gradient(1200px 800px at 50% 120%, #241a4d, transparent 70%),
  var(--night);color:var(--cream)}
.crest{background:linear-gradient(160deg,var(--brass),#8d6626);color:#1a1230;box-shadow:0 0 0 1.5px rgba(255,201,107,.5),0 12px 30px rgba(0,0,0,.45)}
.en{color:var(--lantern)}
.phase{background:rgba(201,148,65,.16);border:1.5px solid rgba(201,148,65,.55);color:var(--lantern)}
.timer{background:radial-gradient(circle at 50% 30%,#ffd894,#e2a63f);color:#251a06;box-shadow:0 0 50px rgba(255,201,107,.45),0 10px 30px rgba(0,0,0,.45)}
.ring{background:conic-gradient(from -20deg,var(--night3) 0 60deg,#372a63 60deg 120deg,var(--night3) 120deg 180deg,#372a63 180deg 240deg,var(--night3) 240deg 300deg,#372a63 300deg);
  box-shadow:0 0 0 8px var(--brass),0 0 0 12px #6d4f1e,0 30px 70px rgba(0,0,0,.55),inset 0 0 60px rgba(0,0,0,.5)}
.ring span{color:var(--cream);text-shadow:0 2px 6px #000}
.hub{border-radius:50%;width:120px;height:120px;display:grid;place-items:center;background:radial-gradient(circle,#2c2358,#191338);box-shadow:0 0 0 3px var(--brass),0 0 30px rgba(255,201,107,.3);color:var(--cream)}
.needle{border-top:22px solid var(--lantern);filter:drop-shadow(0 0 12px rgba(255,201,107,.8))}
.card{background:linear-gradient(180deg,rgba(42,33,84,.92),rgba(23,18,48,.96));border:1.5px solid rgba(201,148,65,.45);
  box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06)}
.kicker{color:var(--lantern)}
.card h1{color:var(--cream)}
.card p{color:rgba(246,234,210,.82)}
.team{background:linear-gradient(180deg,rgba(42,33,84,.9),rgba(23,18,48,.94));border:1.5px solid rgba(201,148,65,.38);box-shadow:0 22px 60px rgba(0,0,0,.5)}
.team.a .hem{background:repeating-linear-gradient(90deg,var(--a) 0 14px,#1b1636 14px 22px,var(--cream) 22px 26px,#1b1636 26px 34px)}
.team.b .hem{background:repeating-linear-gradient(90deg,var(--b) 0 14px,#1b1636 14px 22px,var(--cream) 22px 26px,#1b1636 26px 34px)}
.team.a{box-shadow:0 22px 60px rgba(0,0,0,.5),0 0 0 1px rgba(47,208,180,.35)}
.team.b{box-shadow:0 22px 60px rgba(0,0,0,.5),0 0 0 1px rgba(246,169,59,.35)}
.team.a .tcrest,.team.a .sc{color:var(--a)} .team.b .tcrest,.team.b .sc{color:var(--b)}
.team.a .bar{background:rgba(47,208,180,.18)} .team.a .bar i{background:var(--a)}
.team.b .bar{background:rgba(246,169,59,.18)} .team.b .bar i{background:var(--b)}
`;

const B = `
:root{--ink:#151312;--red:#b3382e;--cream:#f2e6cc;--brass:#c99441;--a:#2fd0b4;--b:#f6a93b}
body{background:linear-gradient(180deg,#1b1817,#100e0d);color:var(--cream)}
body:before{content:'';position:fixed;inset-inline:0;top:0;height:18px;background:repeating-linear-gradient(90deg,var(--red) 0 40px,#0d0b0a 40px 52px,var(--cream) 52px 60px,#0d0b0a 60px 72px);opacity:.95}
.crest{background:var(--cream);color:var(--red);border:2px solid var(--red)}
.en{color:var(--brass)}
.phase{background:transparent;border:2px solid var(--cream);color:var(--cream);letter-spacing:.06em}
.timer{background:var(--red);color:var(--cream);border:2px solid var(--cream)}
.ring{background:conic-gradient(from -20deg,#1f1b19 0 60deg,#2a2522 60deg 120deg,#1f1b19 120deg 180deg,#2a2522 180deg 240deg,#1f1b19 240deg 300deg,#2a2522 300deg);
  box-shadow:0 0 0 8px var(--red),0 0 0 12px var(--cream),0 0 0 16px #0d0b0a,0 30px 60px rgba(0,0,0,.6)}
.ring span{color:var(--cream);font-weight:700}
.hub{border-radius:50%;width:120px;height:120px;display:grid;place-items:center;background:var(--cream);color:#1b1817;box-shadow:0 0 0 4px var(--red)}
.needle{border-top:22px solid var(--cream)}
.card{background:var(--cream);color:#1b1817;border:3px solid var(--red);box-shadow:12px 12px 0 rgba(179,56,46,.9),0 30px 60px rgba(0,0,0,.5)}
.kicker{color:var(--red)}
.card h1{color:#1b1817}
.card p{color:#4a3f38}
.team{background:var(--cream);color:#1b1817;border:3px solid #1b1817;box-shadow:8px 8px 0 #0d0b0a}
.team.a .hem{background:repeating-linear-gradient(90deg,var(--a) 0 18px,#1b1817 18px 26px)}
.team.b .hem{background:repeating-linear-gradient(90deg,var(--b) 0 18px,#1b1817 18px 26px)}
.team.a .tcrest,.team.a .sc{color:#0f7d6b} .team.b .tcrest,.team.b .sc{color:#a35c00}
.team.a .bar{background:#e3d5b8} .team.a .bar i{background:#0f7d6b}
.team.b .bar{background:#e3d5b8} .team.b .bar i{background:#a35c00}
.pl{color:#5b4d43}
`;

const C = `
:root{--g:#ffb968;--brown:#221a16;--cream:#f3e4c9;--brass:#b98a44;--a:#2fd0b4;--b:#f6a93b}
body{background:
  repeating-linear-gradient(45deg,rgba(0,0,0,.08) 0 6px,transparent 6px 12px),
  radial-gradient(700px 460px at 70% 20%, rgba(255,185,104,.24), transparent 70%),
  radial-gradient(900px 700px at 20% 90%, rgba(255,140,60,.14), transparent 70%), #1a1310;color:var(--cream)}
.crest{background:linear-gradient(160deg,#8a5c2a,#4a2f14);color:#ffd9a0;border:2px solid var(--brass);border-radius:50%}
.en{color:var(--g)}
.phase{background:rgba(185,138,68,.2);border:1.5px solid var(--brass);color:#ffd9a0}
.timer{background:radial-gradient(circle at 50% 35%,#ffd9a0,#e09b45);color:#2a1a08;box-shadow:0 0 60px rgba(255,185,104,.5)}
.ring{background:radial-gradient(circle,#3a2a1e,#241a14);box-shadow:0 0 0 10px var(--brass),0 0 0 14px #4a2f14,0 40px 80px rgba(0,0,0,.6),inset 0 0 70px rgba(0,0,0,.6)}
.ring span{color:#ffd9a0}
.hub{border-radius:50%;width:120px;height:120px;display:grid;place-items:center;background:radial-gradient(circle,#4a3524,#2a1d14);box-shadow:0 0 0 3px var(--brass),0 0 40px rgba(255,185,104,.35)}
.needle{border-top:22px solid var(--g)}
.card{background:linear-gradient(180deg,rgba(60,43,30,.92),rgba(32,23,18,.96));border:2px solid var(--brass);border-radius:26px;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.kicker{color:var(--g)}
.card p{color:rgba(243,228,201,.8)}
.team{background:linear-gradient(180deg,rgba(58,42,30,.92),rgba(30,22,17,.95));border:2px solid rgba(185,138,68,.6)}
.team.a .hem{background:repeating-linear-gradient(90deg,var(--a) 0 12px,#2a1d14 12px 20px,#f3e4c9 20px 24px,#2a1d14 24px 32px)}
.team.b .hem{background:repeating-linear-gradient(90deg,var(--b) 0 12px,#2a1d14 12px 20px,#f3e4c9 20px 24px,#2a1d14 24px 32px)}
.team.a .tcrest,.team.a .sc{color:var(--a)} .team.b .tcrest,.team.b .sc{color:var(--b)}
.team.a .bar{background:rgba(47,208,180,.16)} .team.a .bar i{background:var(--a)}
.team.b .bar{background:rgba(246,169,59,.16)} .team.b .bar i{background:var(--b)}
`;

fs.mkdirSync(OUT, { recursive: true });
[['a', A, '✦'], ['b', B, '◈'], ['c', C, '☾']].forEach(([k, css, crest]) => {
  fs.writeFileSync(path.join(OUT, `frame-${k}.html`),
`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>frame ${k}</title><style>${fonts}${shared}${css}</style></head>
<body>${body({ crest })}</body></html>`);
});
console.log('frames written to', OUT);
