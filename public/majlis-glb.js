/* majlis-glb.js — Kenney (CC0) props and avatars, restyled for Majlis Party.
 *
 * Two jobs:
 *   1. dress(scene): the majlis set around the play area — sofas, floor cushions, floor
 *      lamps and a coffee table with a cup, a plate and a melon. Kenney's warm toy palette
 *      is not our palette, so every material is remapped by name (carpet/wood/metal/lamp)
 *      and the models are fitted to real sizes.
 *   2. podium(list): two animated mini-characters on the finale, one per team, body tinted
 *      to the team colour and the head left as the artist drew it.
 *
 * Everything loads once and is cached by url; a failed load must never break the party.
 */
(function () {
  const P = {
    brass: 0xc99441, gold: 0xffc96b, cream: 0xf6ead2, red: 0xa8452f,
    indigo: 0x241a44, wood: 0x2e1d12, ink: 0x120d26, cushion: 0x4a2130,
  };
  const CACHE = new Map();
  /* the GLTFLoader ships as a separate bundle (the one the race app uses); it exposes itself on
     PARTY_GLTF rather than THREE, so hand it over before anything tries to load a model */
  if (typeof THREE !== 'undefined' && !THREE.GLTFLoader && window.PARTY_GLTF && window.PARTY_GLTF.GLTFLoader) {
    THREE.GLTFLoader = window.PARTY_GLTF.GLTFLoader;
  }
  const gltfLoader = (typeof THREE !== 'undefined' && THREE.GLTFLoader) ? new THREE.GLTFLoader() : null;

  function load(url) {
    if (!gltfLoader) return Promise.reject(new Error('no GLTFLoader'));
    if (!CACHE.has(url)) {
      CACHE.set(url, new Promise((res, rej) => {
        gltfLoader.load(url, g => res(g), undefined, e => rej(e));
      }).catch(e => { console.warn('majlis-glb: could not load', url, e && e.message); return null; }));
    }
    return CACHE.get(url);
  }

  /* Kenney materials are named, which is the cleanest way to restyle them: carpet, wood,
     metal and lamp mean the same thing across the whole furniture kit. */
  function restyle(root, flat) {
    root.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = (Array.isArray(o.material) ? mats : mats[0]);
      const apply = m => {
        if (!m) return m;
        const n = (m.name || '').toLowerCase();
        const c = m.clone();
        if (n.includes('carpet') || n.includes('fabric') || n.includes('cloth')) { c.color.setHex(P.cushion); c.roughness = 0.98; c.metalness = 0; }
        else if (n.includes('wood')) { c.color.setHex(P.wood); c.roughness = 0.85; c.metalness = 0.02; }
        else if (n.includes('metal')) { c.color.setHex(P.brass); c.roughness = 0.42; c.metalness = 0.75; }
        else if (n.includes('lamp') || n.includes('light') || n.includes('glass')) {
          c.color.setHex(P.gold); c.emissive = new THREE.Color(0xffb45a); c.emissiveIntensity = 0.85; c.roughness = 0.5;
        } else if (n.includes('default') || !m.name) { c.color.setHex(flat ? P.cushion : P.cream); c.roughness = 0.95; }
        else { c.color.setHex(P.cream); c.roughness = 0.85; }
        if (flat) c.map = null;   /* Kenney's painted colormap is the toy look we are replacing */
        c.__shared = false;
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(apply) : apply(o.material);
      o.castShadow = true; o.receiveShadow = true;
    });
    return root;
  }

  function bbox(o) { const b = new THREE.Box3().setFromObject(o); return b; }

  /* fit by longest horizontal side so a sofa is sofa-sized whatever units the kit used */
  function fit(o, target) {
    const b = bbox(o), size = new THREE.Vector3(); b.getSize(size);
    const long = Math.max(size.x, size.z) || 1;
    const s = target / long;
    o.scale.setScalar(s);
    return s;
  }


  /* a soft contact shadow under every prop: the sun shadow map is spread over 44 units, which
     is too coarse to ground a sofa, and nothing looks pasted-on faster than missing shadow */
  let shadowTex = null;
  function contactTex() {
    if (shadowTex) return shadowTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    rg.addColorStop(0, 'rgba(10,6,18,.62)'); rg.addColorStop(.55, 'rgba(10,6,18,.30)'); rg.addColorStop(1, 'rgba(10,6,18,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(c);
    return shadowTex;
  }
  function contactShadow(root, x, z, w, d, rot) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: contactTex(), transparent: true, depthWrite: false, opacity: 0.9 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot || 0;
    m.position.set(x, 0.045, z);
    root.add(m);
  }

  function place(root, gltf, x, z, rotY, target) {
    const o = gltf.scene.clone(true);
    restyle(o, true);
    if (target) fit(o, target);
    o.position.set(x, 0, z);
    o.rotation.y = rotY || 0;
    const b = bbox(o);
    o.position.y = -b.min.y;              /* sit exactly on the sand */
    root.add(o);
    const size = new THREE.Vector3(); b.getSize(size);
    contactShadow(root, x, z, Math.max(1.2, size.x * 1.25), Math.max(1.2, size.z * 1.25), rotY);
    if (/lamp/.test(gltf.__url || '')) {
      const l = new THREE.PointLight(0xffb45a, 1.6, 12, 2);
      l.position.set(x, Math.max(1.4, size.y * 0.85), z);
      /* a pool of lantern light on the sand: the night has one source, and it is visible */
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32),
        new THREE.MeshBasicMaterial({ color: 0xffb45a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.03, z);
      root.add(l, pool);
    }
    return o;
  }

  /* ------------------------------------------------------------------ dressing */
  const DRESS = [
    /* url, x, z, rotation, target length (m) */
    ['/assets/props/bench.glb', -6.0, -11.4, 0.12, 3.9],
    ['/assets/props/bench.glb', 6.0, -11.4, -0.12, 3.9],
    ['/assets/props/bench.glb', -12.6, -9.4, 0.7, 3.4],
    ['/assets/props/bench.glb', 12.6, -9.4, -0.7, 3.4],
    ['/assets/props/lamp.glb', -16.2, -11.8, 0, 3.4],
    ['/assets/props/lamp.glb', 16.2, -11.8, 0, 3.4],
    ['/assets/props/table.glb', -3.4, -10.4, 0.1, 2.9],
    ['/assets/props/table.glb', 3.4, -10.4, -0.1, 2.9],
  ];
  const TABLE_TOP = [
    ['/assets/food/cup.glb', -3.35, -10.75, 0, 0.22],
    ['/assets/food/plate.glb', -2.7, -10.45, 0, 0.42],
    ['/assets/food/melon.glb', 2.7, -10.45, 0.4, 0.8],
  ];


  /* a woven majlis carpet, drawn here so the floor under the seating belongs to the same
     Sadu language as the cards and the pad (the furniture kit has no rug) */
  function carpetTex() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#2a1c3f'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = '#a8452f'; g.fillRect(0, 0, 512, 58); g.fillRect(0, 454, 512, 58);
    g.fillStyle = '#f6ead2';
    for (let x = 0; x < 512; x += 32) { g.fillRect(x + 12, 22, 8, 14); g.fillRect(x + 12, 476, 8, 14); }
    for (let y = 90; y < 440; y += 70) for (let x = 26; x < 490; x += 70) {
      g.fillStyle = y % 140 === 90 ? '#c99441' : '#8e3a52';
      g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + 20, y); g.lineTo(x, y + 20); g.lineTo(x - 20, y);
      g.closePath(); g.fill();
      g.fillStyle = '#f6ead2'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.6, 1);
    if (t.colorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function carpet(root, x, z, w, h, rot) {
    const tex = carpetTex();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.98, metalness: 0 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot || 0;
    m.position.set(x, 0.035, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  }

  let dressed = false;
  function dress(scene) {
    if (dressed) return;
    dressed = true;
    const root = new THREE.Group(); root.name = 'majlis-dressing';
    scene.add(root);
    carpet(root, -8.6, -13.0, 11.5, 6.4, 0.05);
    carpet(root, 8.6, -13.0, 11.5, 6.4, -0.05);
    carpet(root, 0, -16.0, 15.0, 4.6, 0);
    DRESS.forEach(([url, x, z, r, len]) => {
      load(url).then(g => { if (g) { g.__url = url; place(root, g, x, z, r, len); } });
    });
    /* the table's own props: placed after it so the height is known */
    load('/assets/props/table.glb').then(g => {
      if (!g) return;
      const tableY = (() => {
        const probe = g.scene.clone(true); restyle(probe, true); fit(probe, 1.8);
        const b = bbox(probe); return -b.min.y + (b.max.y - b.min.y);
      })();
      TABLE_TOP.forEach(([url, x, z, r, len]) => {
        load(url).then(p => {
          if (!p) return;
          const o = p.scene.clone(true); restyle(o, true); fit(o, len);
          const b = bbox(o);
          o.position.set(x, tableY - 0.02, z); o.rotation.y = r;
          o.position.y = tableY - b.min.y + 0.01;
          root.add(o);
        });
      });
    });
  }

  /* ------------------------------------------------------------------ avatars */
  const mixers = [];
  let podiumGroup = null;

  function tintBody(obj, hex) {
    obj.traverse(o => {
      if (!o.isMesh) return;
      const isHead = /head/i.test(o.name) || (o.parent && /head/i.test(o.parent.name || ''));
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map(m => {
        if (!m) return m;
        const c = m.clone();
        if (!isHead) {
          /* keep the painted texture (it carries the folds and the sandals) and tint through the
             material colour, so the clothes read as the team's colour instead of a flat blob */
          c.color = new THREE.Color(hex);
          c.roughness = 0.78; c.metalness = 0.03;
        }
        c.__shared = false;
        return c;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
      o.castShadow = true;
    });
  }

  /* confetti in 3D: small quads in the two team colours falling across the podium, so the finale
     has a beat of its own instead of a static card over a static room */
  let confetti = null, confettiT = 0;
  function confettiBurst(scene, hexes) {
    if (confetti) { scene.remove(confetti); confetti = null; }
    const N = 160;
    const geo = new THREE.PlaneGeometry(0.16, 0.24);
    const grp = new THREE.Group(); grp.name = 'confetti';
    const mats = hexes.map(h => new THREE.MeshBasicMaterial({ color: h, side: THREE.DoubleSide }));
    mats.push(new THREE.MeshBasicMaterial({ color: 0xf6ead2, side: THREE.DoubleSide }));
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(geo, mats[i % mats.length]);
      m.position.set((Math.random() - 0.5) * 16, 6 + Math.random() * 9, -2 + Math.random() * 9);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.userData.v = 1.4 + Math.random() * 2.2;
      m.userData.spin = (Math.random() - 0.5) * 6;
      m.userData.sway = Math.random() * 6.28;
      grp.add(m);
    }
    scene.add(grp); confetti = grp; confettiT = 0;
  }

  /* list: [{ url, hex, x, z, rotY, clip, tier }] — tier 1 = winner (higher plinth) */
  function podium(scene, list) {
    clearPodium();
    podiumGroup = new THREE.Group(); podiumGroup.name = 'podium';
    scene.add(podiumGroup);
    confettiBurst(scene, (list || []).map(p => p.hex));
    (list || []).forEach((p, i) => {
      load(p.url).then(g => {
        if (!g || !podiumGroup) return;
        const o = g.scene;
        tintBody(o, p.hex);
        const b = bbox(o), size = new THREE.Vector3(); b.getSize(size);
        const s = (p.tier && p.tier > 1 ? 3.6 : 3.0) / (size.y || 1);    /* the winner is bigger too */
        o.scale.setScalar(s);
        o.position.set(p.x, 0, p.z);
        o.rotation.y = p.rotY != null ? p.rotY : Math.PI;
        const tier = p.tier || (i === 0 ? 1.9 : 0.7);
        const r = p.plinthR || 1.25;
        if (p.plinth !== false) {
          const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.08, tier, 44),
            new THREE.MeshStandardMaterial({ color: 0x1d1533, roughness: 0.5, metalness: 0.5 }));
          disc.position.set(p.x, tier / 2, p.z); disc.receiveShadow = true; disc.castShadow = true;
          const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.06, 8, 52),
            new THREE.MeshStandardMaterial({ color: 0xc99441, roughness: 0.3, metalness: 0.9 }));
          rim.rotation.x = Math.PI / 2; rim.position.set(p.x, tier - 0.02, p.z);
          /* the team's colour floods the sand around its plinth */
          const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 3.2, 48),
            new THREE.MeshBasicMaterial({ color: p.hex, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }));
          pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, 0.07, p.z);
          const glow = new THREE.PointLight(p.hex, 1.5, 11, 2); glow.position.set(p.x, 2.4, p.z + 1.2);
          podiumGroup.add(disc, rim, pool, glow);
          contactShadow(podiumGroup, p.x, p.z, r * 3.4, r * 3.4, 0);
        }
        const bb = bbox(o);
        o.position.y = -bb.min.y + tier;
        podiumGroup.add(o);
        if (p.tier && p.tier > 1) {
          const crownY = o.position.y + (bb.max.y - bb.min.y) + 0.22;
          const crown = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 5),
            new THREE.MeshStandardMaterial({ color: 0xe6bf6a, metalness: 0.9, roughness: 0.25, emissive: 0x6a4a12, emissiveIntensity: 0.8 }));
          crown.position.set(p.x, crownY, p.z);
          const halo = new THREE.PointLight(0xffc96b, 2.2, 7, 2);
          halo.position.set(p.x, crownY, p.z + 0.6);
          podiumGroup.add(crown, halo);
        }
        if (g.animations && g.animations.length) {
          const want = p.clip || 'idle';
          const clip = g.animations.find(a => new RegExp(want, 'i').test(a.name)) || g.animations.find(a => /idle/i.test(a.name)) || g.animations[0];
          const m = new THREE.AnimationMixer(o);
          m.clipAction(clip).play();
          mixers.push(m);
        }
      });
    });
  }

  function clearPodium() {
    mixers.length = 0;
    if (confetti && confetti.parent) { confetti.parent.remove(confetti); confetti = null; }
    if (!podiumGroup) return;
    podiumGroup.parent && podiumGroup.parent.remove(podiumGroup);
    podiumGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.__shared) o.material.dispose(); });
    podiumGroup = null;
  }

  function update(dt) {
    for (const m of mixers) m.update(dt);
    if (confetti) {
      confettiT += dt;
      for (const m of confetti.children) {
        m.position.y -= m.userData.v * dt;
        m.position.x += Math.sin(confettiT * 1.6 + m.userData.sway) * dt * 0.5;
        m.rotation.z += m.userData.spin * dt;
        m.rotation.x += m.userData.spin * 0.6 * dt;
        if (m.position.y < 0.1) { m.position.y = 12 + Math.random() * 3; }
      }
    }
  }

  /* a single animated hero on the play surface: the same modelled rig as the podium, tinted to the
     team, playing its idle emote. Used where one player is the subject instead of a crowd. */
  function hero(parent, opts) {
    const o = opts || {};
    const url = o.url || '/assets/chars/char-a.glb';
    load(url).then(g => {
      if (!g || !parent) return;
      const c = g.scene.clone(true);
      restyle(c);
      tintBody(c, o.hex || 0xf6a93b);
      const bb = bbox(c), size = new THREE.Vector3(); bb.getSize(size);
      const target = o.height || 2.4;
      c.scale.setScalar(target / (size.y || 1));
      c.position.set(o.x || 0, 0, o.z || 0);
      c.rotation.y = o.rotY != null ? o.rotY : 0;
      const b2 = bbox(c);
      c.position.y = -b2.min.y;
      parent.add(c);
      contactShadow(parent, o.x || 0, o.z || 0, 1.5, 1.5, 0);
      if (g.animations && g.animations.length) {
        const clip = g.animations.find(a => /idle/i.test(a.name)) || g.animations[0];
        const m = new THREE.AnimationMixer(c);
        m.clipAction(clip).play();
        const tick = () => { m.update(0.033); if (o.alive === false) return; requestAnimationFrame(tick); };
        tick();
      }
    }).catch(() => {});
  }

  window.MAJLIS_GLB = { dress, podium, clearPodium, update, load, restyle, fit, hero, palette: P };
})();
