const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = process.argv[2] || '/opt/data/cache/scratch/mp5';
const SECS = Number(process.argv[3] || 100);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  await p.goto('http://127.0.0.1:9520/host', { waitUntil: 'networkidle' });
  const seen = new Set(); const t0 = Date.now(); let n = 0;
  while ((Date.now() - t0) / 1000 < SECS) {
    await p.waitForTimeout(700);
    const st = await p.evaluate(() => ({ ph: document.body.dataset.phase || '', gm: document.body.dataset.game || '', pl: (document.querySelector('#playerschip') || {}).textContent || '' }));
    const key = st.ph === 'playing' ? 'playing:' + st.gm : st.ph;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    await p.waitForTimeout(900);
    const f = path.join(OUT, String(n++).padStart(2, '0') + '-' + key.replace(/[^a-z0-9]/gi, '-') + '.png');
    await p.screenshot({ path: f });
    console.log('shot', f, st.pl);
  }
  console.log('errors', JSON.stringify([...new Set(errs)].slice(0, 5)));
  await b.close();
})();
