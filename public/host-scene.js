/* Majlis Party — projector renderer.
 *
 * One majlis at dusk: sand arena, Sadu border, tent canopies, brass lanterns, two team banners, and up to
 * 45 chunky characters drawn with four instanced meshes (body, head, ghutra, shadow blob) so a full room
 * costs four draw calls. Every minigame is a "stage" that adds its own props on the same floor; the HUD is
 * DOM so Arabic type stays crisp at projector size.
 */
(function () {
  'use strict';
  /* Two teams, and every prop is built one-per-team: two coffee trays, two lanes, two jets. */
  const TEAMS = [
    { i: 1, ar: 'الفيروز', en: 'Turquoise', hex: '#2fd0b4', dark: '#0c5a4e' },
    { i: 2, ar: 'العنبر', en: 'Amber', hex: '#f6a93b', dark: '#7a4712' },
  ];
  const TEAM = {}; TEAMS.forEach(t => TEAM[t.i] = t);
  /* the Safe-Colour game paints six Sadu hexes; those are palette colours, not team colours */
  const PALETTE = ['#2fd0b4', '#f6a93b', '#b3382e', '#f6ead2', '#2a2154', '#7d5bb0'].map((hex, i) => ({ i: i + 1, hex }));
  const $ = (s) => document.querySelector(s);
  /* canvas textures bake whatever font is loaded at build time — pull the display faces in first */
  if (document.fonts && document.fonts.load) {
    document.fonts.load('800 40px Baloo').catch(() => {});
    document.fonts.load('700 30px Tajawal').catch(() => {});
    document.fonts.ready.then(() => { if (stageId === 'wheel') { stageId = ''; wheel = null; } }).catch(() => {});
  }
  let state = null, charCount = 0, stage = null, stageId = '';
  const C = { seq: 0 };

  /* ------------------------------------------------------------------ three */
  const canvas = $('#c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(0, 9.5, 16.5);
  camera.lookAt(0, 1.4, 0);

  const clock = new THREE.Clock();

  /* palette of the majlis at dusk */
  const COL = { sand: 0xc9a174, sandDeep: 0x8c6a45, tent: 0xf0e7d2, ink: 0x120d26, gold: 0xe6bf6a, sky: 0x120d26 };

  function makeTex(w, h, draw, repeat) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }

  /* sand: warm base, soft dune blotches and fine grain — no long strokes, they tile into "planks" */
  const sandTex = makeTex(512, 512, (g, w, h) => {
    g.fillStyle = '#c9a174'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 18 + Math.random() * 54;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const warm = Math.random() < 0.5;
      gr.addColorStop(0, warm ? 'rgba(226,199,158,.22)' : 'rgba(140,104,68,.16)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    for (let i = 0; i < 7000; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,212,.09)' : 'rgba(96,68,40,.10)';
      g.fillRect(x, y, 1.4, 1.4);
    }
  }, [9, 9]);

  /* Sadu weave: the border pattern. Cream ground, red/green diamonds and thin navy lines. */
  const saduTex = makeTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#2b2140'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    for (let x = 0; x < w; x += 64) {
      g.fillStyle = x % 128 === 0 ? '#a8452f' : '#12553a';
      g.beginPath(); g.moveTo(x + 32, 18); g.lineTo(x + 56, 64); g.lineTo(x + 32, 110); g.lineTo(x + 8, 64); g.closePath(); g.fill();
      g.fillStyle = 'rgba(239,228,201,.9)';
      g.beginPath(); g.moveTo(x + 32, 44); g.lineTo(x + 44, 64); g.lineTo(x + 32, 84); g.lineTo(x + 20, 64); g.closePath(); g.fill();
      g.fillStyle = '#e6bf6a'; g.fillRect(x + 2, 28, 4, 72);
    }
  }, [7, 1]);

  const stripeTex = makeTex(512, 256, (g, w, h) => {
    g.fillStyle = '#2b2140'; g.fillRect(0, 0, w, h);
    const bands = [[0, 26, '#a8452f'], [40, 10, '#241a44'], [58, 6, '#e6bf6a'], [72, 18, '#1a1230'], [98, 26, '#3a2b63'], [132, 8, '#a8452f'], [148, 22, '#e6bf6a'], [178, 14, '#1a1230'], [200, 26, '#a8452f']];
    for (const [y, hh, col] of bands) { g.fillStyle = col; g.fillRect(0, y, w, hh); }
    for (let x = 0; x < w; x += 22) { g.fillStyle = 'rgba(239,228,201,.14)'; g.fillRect(x, 0, 3, h); }
  }, [6, 1]);

  /* ------------------------------------------------------------------ environment */
  function buildSky() {
    const geo = new THREE.SphereGeometry(320, 40, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x041a14) }, mid: { value: new THREE.Color(0x1d4a35) }, low: { value: new THREE.Color(0xd08d4c) }, sun: { value: new THREE.Color(0xffd9a0) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sun;',
        'void main(){',
        '  float h = normalize(vP).y;',
        '  vec3 c = mix(low, mid, smoothstep(-0.02, 0.22, h));',
        '  c = mix(c, top, smoothstep(0.2, 0.72, h));',
        '  float d = distance(normalize(vP), normalize(vec3(-0.55, 0.06, -1.0)));',
        '  c += sun * 0.55 * exp(-d * 3.0) + sun * 0.18 * exp(-d * 9.0);',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n'),
    });
    scene.add(new THREE.Mesh(geo, mat));
  }

  function duneSilhouette(z, height, color, seed) {
    const shape = new THREE.Shape();
    shape.moveTo(-160, 0);
    for (let x = -160; x <= 160; x += 4) {
      const y = height * (0.55 + 0.45 * Math.sin(x / 34 + seed) * Math.cos(x / 71 - seed)) + 0.6;
      shape.lineTo(x, Math.max(0.2, y));
    }
    shape.lineTo(160, 0); shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, fog: false }));
    mesh.position.set(0, 0, z);
    scene.add(mesh);
    return mesh;
  }

  function buildGround() {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(46, 72), new THREE.MeshStandardMaterial({ map: sandTex, color: 0x2b2138, roughness: 1, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -0.02;
    scene.add(floor);

    /* the arena: a Sadu border ring, slightly raised, so the play area reads from the back row */
    const border = new THREE.Mesh(new THREE.RingGeometry(12.35, 13.05, 128), new THREE.MeshStandardMaterial({ map: saduTex, roughness: .95, side: THREE.DoubleSide }));
    border.rotation.x = -Math.PI / 2; border.position.y = 0.015; border.receiveShadow = true;
    scene.add(border);

    const inner = new THREE.Mesh(new THREE.CircleGeometry(12.35, 96), new THREE.MeshStandardMaterial({ map: sandTex, color: 0x352a45, roughness: 1 }));
    inner.rotation.x = -Math.PI / 2; inner.position.y = 0.012; inner.receiveShadow = true;
    scene.add(inner);

    duneSilhouette(-46, 7.0, 0x1e1740, 1.2);
    duneSilhouette(-72, 11.0, 0x161032, 2.7);
    duneSilhouette(-110, 16.0, 0x0d0a20, 0.4);
  }

  function buildMajlis() {
    const grp = new THREE.Group();
    /* tent wall behind the arena: two panels meeting at a shallow angle, Sadu band across the top */
    const mat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: .92, side: THREE.DoubleSide });
    const wallL = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.4), mat);
    wallL.position.set(-9.4, 3.4, -16.5); wallL.rotation.y = Math.PI * 0.16; grp.add(wallL);
    const wallR = wallL.clone(); wallR.position.x = 9.4; wallR.rotation.y = -Math.PI * 0.16; grp.add(wallR);

    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2f2344, roughness: .9, side: THREE.DoubleSide });
    const canopy = new THREE.Mesh(new THREE.PlaneGeometry(34, 5.2), canopyMat);
    canopy.position.set(0, 7.1, -14.2); canopy.rotation.x = -0.42; grp.add(canopy);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: .8 });
    for (const x of [-15, -5.2, 5.2, 15]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 7.6, 8), poleMat);
      pole.position.set(x, 3.8, -16.1); pole.castShadow = true; grp.add(pole);
    }
    /* brass lanterns: emissive cores + a soft sprite glow (no extra lights, so the GPU stays free) */
    const glowTex = makeTex(128, 128, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      rg.addColorStop(0, 'rgba(255,206,130,.95)'); rg.addColorStop(.35, 'rgba(255,180,90,.45)'); rg.addColorStop(1, 'rgba(255,160,70,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0x8a6a34, emissive: 0xffb45a, emissiveIntensity: 1.6, roughness: .5, metalness: .6 });
    const lanterns = [];
    for (let i = 0; i < 7; i++) {
      const x = -12 + i * 4;
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.55, 8), lanternMat);
      l.position.set(x, 5.5 + Math.sin(i * 1.7) * 0.5, -12.6);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc987, transparent: true, opacity: .85, depthWrite: false }));
      glow.scale.set(2.6, 2.6, 1); glow.position.copy(l.position); l.userData.glow = glow;
      l.userData.base = l.position.y;
      grp.add(l); grp.add(glow); lanterns.push(l);
    }
    grp.userData.lanterns = lanterns;

    /* the majlis seating: a cushioned ring facing the arena, built here rather than imported, so the
       furniture reads as one Sadu set instead of a furniture pack wearing our colours */
    const seatA = new THREE.MeshStandardMaterial({ color: 0x4a2130, roughness: .96 });
    const seatB = new THREE.MeshStandardMaterial({ color: 0x2b2150, roughness: .96 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xc99441, metalness: .7, roughness: .35 });
    const SEATS = 22;
    for (let i = 0; i < SEATS; i++) {
      const a = -2.05 + (i / (SEATS - 1)) * 4.10;      /* around the back of the room, clear of the camera */
      const rad = 15.4;
      const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.42, 0.95), i % 2 ? seatB : seatA);
      seat.position.set(x, 0.21, z); seat.rotation.y = a; seat.receiveShadow = true; seat.castShadow = true;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.72, 0.22), i % 2 ? seatB : seatA);
      back.position.set(x + Math.sin(a) * 0.42, 0.72, z + Math.cos(a) * 0.42); back.rotation.y = a; back.castShadow = true;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.06, 0.06), trim);
      edge.position.set(x - Math.sin(a) * 0.48, 0.44, z - Math.cos(a) * 0.48); edge.rotation.y = a;
      grp.add(seat, back, edge);
    }

    scene.add(grp);
    return grp;
  }

  function buildBanners() {
    const grp = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x5d4025, roughness: .8 });
    TEAMS.forEach((t, i) => {
      const a = Math.PI * i + Math.PI / 2;
      const x = Math.sin(a) * 13.9, z = Math.cos(a) * 13.9;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.6, 6), poleMat);
      pole.position.set(x, 2.3, z); pole.castShadow = true; grp.add(pole);
      const tex = makeTex(256, 160, (g, w, h) => {
        g.fillStyle = t.hex; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(0,0,0,.16)'; for (let k = 0; k < 5; k++) g.fillRect(0, 18 + k * 28, w, 8);
        g.fillStyle = 'rgba(20,16,43,.85)'; g.font = '800 46px Baloo, Tajawal, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(t.ar, w / 2, h / 2 + 4);
      });
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .95 }));
      cloth.position.set(x, 3.9, z); cloth.rotation.y = a + Math.PI;
      grp.add(cloth);
    });
    scene.add(grp);
  }

  function buildLights() {
    scene.add(new THREE.HemisphereLight(0xffcf9a, 0x241a3d, 0.26));
    const sun = new THREE.DirectionalLight(0xffc27a, 0.62);
    sun.position.set(-22, 17, -26); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22; sun.shadow.camera.right = 22; sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 90; sun.shadow.bias = -0.0012;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9d8ce0, 0.3); fill.position.set(14, 9, 12); scene.add(fill);
    /* a lantern wash from the front-left so the arena sits in warm night light, not a flat game-show court */
    const lantern = new THREE.PointLight(0xffb45a, 2.6, 36, 2); lantern.position.set(-7.5, 5.4, 6.5); scene.add(lantern);
    const lantern2 = new THREE.PointLight(0xffcf8a, 2.0, 32, 2); lantern2.position.set(7.5, 5.0, 4.0); scene.add(lantern2);
  }

  /* ------------------------------------------------------------------ characters */
  const blobTex = makeTex(64, 64, (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(20,12,4,.55)'); rg.addColorStop(.7, 'rgba(20,12,4,.20)'); rg.addColorStop(1, 'rgba(20,12,4,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const MAXC = 64;
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: .78, metalness: .02 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xe8c49a, roughness: .85 });
  const ghutraMat = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: .9 });
  const bodyGeo = new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.33, 0.5, 5, 12) : new THREE.CylinderGeometry(0.33, 0.36, 1.1, 12);
  const body = new THREE.InstancedMesh(bodyGeo, bodyMat, MAXC);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.29, 16, 12), headMat, MAXC);
  const ghutra = new THREE.InstancedMesh(new THREE.SphereGeometry(0.315, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), ghutraMat, MAXC);
  const blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.05, 1.05), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), MAXC);
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ghutra.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  body.castShadow = true; head.castShadow = true;
  body.count = head.count = ghutra.count = blob.count = 0;
  body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 3), 3);
  scene.add(body, head, ghutra, blob);

  /* every character keeps a smoothed world position; the server sends 15 Hz, the renderer eases at 60 */
  const chars = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), eul = new THREE.Euler();
  const col = new THREE.Color(), colB = new THREE.Color();

  function updateChars(list, dt, mode) {
    const seen = new Set();
    list.forEach((ch, idx) => {
      seen.add(ch.id);
      let c = chars.get(ch.id);
      if (!c) { c = { x: ch.x || 0, z: ch.z || 0, y: 0, rot: 0, team: ch.team, out: 0, born: performance.now(), seed: Math.random() * 10 }; chars.set(ch.id, c); }
      c.team = ch.team;
      /* arrows has no positions in the sim: lay the crowd in rows facing the screen */
      let tx = ch.x || 0, tz = ch.z || 0;
      if (mode === 'arrows') {
        const n = list.length, per = Math.ceil(Math.sqrt(n));
        tx = ((idx % per) - (per - 1) / 2) * 1.15;
        tz = (Math.floor(idx / per) - 1.2) * 1.15;
      }
      const k = 1 - Math.pow(0.001, dt);
      c.x += (tx - c.x) * k; c.z += (tz - c.z) * k;
      c.outT = ch.out ? (ch.outT || 0) + dt : 0;
      if (ch.out) c.out = Math.min(1, (c.out || 0) + dt * 2.6); else c.out = Math.max(0, (c.out || 0) - dt * 3);
      /* jump: the sim reports seconds since the jump started */
      const jt = ch.jump != null && ch.jump >= 0 ? ch.jump : -1;
      const jumpY = jt >= 0 && jt < 0.66 ? Math.sin((jt / 0.66) * Math.PI) * 1.05 : 0;
      c.jumpY = jumpY;
      const bob = Math.sin(performance.now() / 420 + c.seed) * 0.035;
      const y = jumpY + bob + (ch.current ? 0.06 : 0);
      const s = c.born ? Math.min(1, (performance.now() - c.born) / 320) : 1;
      const scale = (0.98 + (ch.current ? 0.1 : 0)) * s;
      const fall = c.out * 1.5;
      const lean = ch.vx || ch.vz ? Math.atan2(ch.vx || 0, ch.vz || 0) : 0;
      c.rot += (((lean || 0) - c.rot) * Math.min(1, dt * 8));
      const rr = ch.dash ? 0.86 : 1;
      eul.set(c.out * 1.5, c.rot, 0);
      q.setFromEuler(eul);
      v3.set(c.x, y - fall * 0.55 + 0.55 * scale, c.z);
      sc.set(scale * rr, scale * (1 - c.out * 0.25), scale * rr);
      m4.compose(v3, q, sc);
      body.setMatrixAt(idx, m4);
      v3.set(c.x, y + 0.92 * scale - fall * 0.5, c.z);
      m4.compose(v3, q, sc); head.setMatrixAt(idx, m4);
      v3.set(c.x, y + 0.98 * scale - fall * 0.5, c.z); m4.compose(v3, q, sc); ghutra.setMatrixAt(idx, m4);
      eul.set(-Math.PI / 2, 0, 0); q.setFromEuler(eul);
      v3.set(c.x, 0.02, c.z); sc.set(scale, scale, scale); m4.compose(v3, q, sc); blob.setMatrixAt(idx, m4);
      const t = TEAM[c.team] || TEAM[1];
      col.set(t.hex); colB.set(ch.save != null && ch.save >= 0 && ch.save < 0.3 ? 0xffffff : t.dark);
      col.lerp(colB, 0.35 + c.out * 0.4);
      body.setColorAt(idx, col);
    });
    charCount = list.length;
    body.count = head.count = ghutra.count = blob.count = Math.min(MAXC, charCount);
    body.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true;
    ghutra.instanceMatrix.needsUpdate = true; blob.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    for (const id of Array.from(chars.keys())) if (!seen.has(id)) chars.delete(id);
  }

  /* ------------------------------------------------------------------ stages */
  const stages = {};
  function clearStage() {
    if (wheel && wheel.g) {
      scene.remove(wheel.g);
      wheel.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose && !o.material.__shared) o.material.dispose(); });
      wheel = null;
    }
    if (!stage) return;
    /* `stage` is the builder's record ({g, runner, ...}), not the group itself: removing the record did
     * nothing and every minigame's props stayed in the scene for the rest of the party. */
    const group = stage.g || stage;
    scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose && !o.material.__shared) o.material.dispose(); });
    stage = null;
  }
  function makeStage() { const g = new THREE.Group(); scene.add(g); return g; }

  /* Majlis Marathon Sort: a road down the middle and two gates the room sends each animal through. */
  stages.marathon = () => {
    const g = makeStage();
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 22), new THREE.MeshStandardMaterial({ color: 0x6f5335, roughness: 1.0, metalness: 0.0 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.03, -2.5); road.receiveShadow = true; g.add(road);
    /* kerbs: two long low walls of plaster keep the eye on the lane and stop the track floating */
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0xbfae8d, roughness: 0.9 });
    [-1, 1].forEach(k => {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 22), kerbMat);
      kerb.position.set(k * 4.75, 0.13, -2.5); g.add(kerb);
    });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xd9c69e, transparent: true, opacity: 0.30 });
    for (let i = 0; i < 11; i++) { const s2 = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.9), stripeMat); s2.rotation.x = -Math.PI / 2; s2.position.set(0, 0.04, -12 + i * 2.2); g.add(s2); }
    const gates = {};
    [['left', -4.4], ['right', 4.4]].forEach(([key, x]) => {
      const wood = new THREE.MeshStandardMaterial({ color: key === 'left' ? 0x1c6b4a : 0x8a6a22, roughness: 0.55, metalness: 0.25 });
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.34, 0.5), wood); lintel.position.set(x, 4.1, -11.6); g.add(lintel);
      [-1, 1].forEach(k => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 4.2, 10), wood); p.position.set(x + k * 1.55, 2.1, -11.6); g.add(p); });
      const light = new THREE.PointLight(key === 'left' ? 0x37e08a : 0xe0b558, 0.9, 13); light.position.set(x, 3.3, -10.4); g.add(light);
      /* the gate says which way it is, in the same Arabic the rule bar uses */
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
      const cx = cv.getContext('2d');
      cx.fillStyle = key === 'left' ? 'rgba(12,60,40,.92)' : 'rgba(70,52,14,.92)';
      roundRect(cx, 6, 6, 500, 180, 34); cx.fill();
      cx.strokeStyle = 'rgba(230,191,106,.85)'; cx.lineWidth = 7; roundRect(cx, 6, 6, 500, 180, 34); cx.stroke();
      cx.fillStyle = key === 'left' ? '#9cf3c4' : '#f7dfa6';
      cx.font = '900 116px "Noto Naskh Arabic", "Noto Sans Arabic", system-ui, sans-serif';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(key === 'left' ? 'يسار' : 'يمين', 256, 104);
      const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      plate.position.set(x, 4.75, -11.55); g.add(plate);
      gates[key] = { x, light, plate };
    });
    /* The runner has to read against the sand from the back row: dark body, gold foot-ring, and the animal's
     * own emoji floating above it so nobody has to guess which one is coming. */
    const runner = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 0.82, 8, 14), new THREE.MeshStandardMaterial({ color: 0x22352b, roughness: 0.55, metalness: 0.15 }));
    body.position.y = 1.0; runner.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), new THREE.MeshStandardMaterial({ color: 0xe4c9a4, roughness: 0.7 }));
    head.position.y = 1.86; runner.add(head);
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.06, 6, 20), new THREE.MeshStandardMaterial({ color: 0xe0b558, metalness: 0.7, roughness: 0.35 }));
    sash.position.y = 1.24; sash.rotation.x = Math.PI / 2; runner.add(sash);
    /* two stubby legs so the bob reads as running rather than floating */
    const legMat = new THREE.MeshStandardMaterial({ color: 0x16241d, roughness: 0.7 });
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.36, 4, 8), legMat); legL.position.set(-0.18, 0.24, 0); runner.add(legL);
    const legR = legL.clone(); legR.position.x = 0.18; runner.add(legR);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 8, 28), new THREE.MeshBasicMaterial({ color: 0xe0b558 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; runner.add(ring);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    badge.scale.set(2.6, 1.62, 1); badge.position.y = 3.15; runner.add(badge);
    runner.position.set(0, 0, -8); g.add(runner);
    const halo = new THREE.PointLight(0xffe6a8, 1.2, 10); halo.position.set(0, 2.4, -8); g.add(halo);
    return { g, runner, halo, gates, badge, badgeCtx: cv.getContext('2d'), badgeTex: tex, badgeKey: '', legL, legR };
  };

  /* Qahwa Pour: six stations, a dallah, a finjan and the gold line the pour has to stop at. */
  stages.qahwa = () => {
    const g = makeStage();
    const items = {};
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a03f, metalness: 0.85, roughness: 0.28 });
    TEAMS.forEach((t, i) => {
      const x = (i - 0.5) * 5.4, z = -7.6;
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.08, 26), new THREE.MeshStandardMaterial({ color: 0x2c2118, roughness: 0.85 }));
      tray.position.set(x, 0.06, z); tray.receiveShadow = true; g.add(tray);
      const cloth = new THREE.Mesh(new THREE.CircleGeometry(1.0, 28), new THREE.MeshStandardMaterial({ color: 0x1d3a2c, roughness: 0.95 }));
      cloth.rotation.x = -Math.PI / 2; cloth.position.set(x, 0.11, z); g.add(cloth);
      const lamp = new THREE.PointLight(new THREE.Color(t.hex), 0.5, 5); lamp.position.set(x, 1.9, z + 0.8); g.add(lamp);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.03, 6, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(t.hex), transparent: true, opacity: 0.6 }));
      rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.12, z); g.add(rim);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.56, 18), new THREE.MeshStandardMaterial({ color: 0xf2efe3, roughness: 0.35 }));
      cup.position.set(x, 0.4, z); g.add(cup);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 18), new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.5 }));
      fill.position.set(x, 0.38, z); fill.scale.y = 0.01; g.add(fill);
      const line = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.018, 6, 26), new THREE.MeshBasicMaterial({ color: 0xe0b558 }));
      line.rotation.x = Math.PI / 2; line.position.set(x, 0.62, z); g.add(line);
      const dallah = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), brass); dallah.scale.set(1, 1.2, 1); dallah.position.set(x - 0.62, 0.42, z); g.add(dallah);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.5, 8), brass); spout.position.set(x - 0.36, 0.62, z); spout.rotation.z = -0.6; g.add(spout);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.46, 8), new THREE.MeshBasicMaterial({ color: 0x9a6428, transparent: true, opacity: 0.9 }));
      stream.position.set(x - 0.06, 0.66, z); stream.visible = false; g.add(stream);
      items[t.i] = { x, z, fill, stream, cup };
    });
    return { g, items };
  };

  /* Tray Balance: a tray on a pedestal per team; the finjan slides and the tray tilts with the phone. */
  stages.tray = () => {
    const g = makeStage();
    const items = {};
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a03f, metalness: 0.85, roughness: 0.3 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x1d3a2c, roughness: 0.95 });
    TEAMS.forEach((t, i) => {
      const x = (i - 0.5) * 5.6, z = -6.4;
      const teamCloth = cloth.clone(); teamCloth.color = new THREE.Color(t.hex).multiplyScalar(0.34);
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.9, 0.1, 26), teamCloth);
      table.position.set(x, 0.86, z); table.receiveShadow = true; g.add(table);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.86, 12), new THREE.MeshStandardMaterial({ color: 0x4a3720, roughness: 0.9 }));
      leg.position.set(x, 0.43, z); g.add(leg);
      const tray = new THREE.Group(); tray.position.set(x, 1.02, z); g.add(tray);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.06, 28), new THREE.MeshStandardMaterial({ color: 0x8f6f45, metalness: 0.6, roughness: 0.35 }));
      tray.add(disc);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 8, 30), brass);
      lip.rotation.x = Math.PI / 2; lip.position.y = 0.03; tray.add(lip);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.022, 6, 24), new THREE.MeshBasicMaterial({ color: 0x37e08a, transparent: true, opacity: 0.6 }));
      band.rotation.x = Math.PI / 2; band.position.y = 0.05; tray.add(band);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(t.hex), transparent: true, opacity: 0.7 }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.045; tray.add(rim);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.26, 16), new THREE.MeshStandardMaterial({ color: 0xf7f3e6, roughness: 0.3 }));
      cup.position.y = 0.19; tray.add(cup);
      const dallah = new THREE.Group(); dallah.position.set(0.3, 0.06, 0.16); dallah.scale.setScalar(1.55); tray.add(dallah);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), brass); body.scale.set(1, 1.15, 1); body.position.y = 0.13; dallah.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 10), brass); neck.position.y = 0.26; dallah.add(neck);
      const lid = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.07, 12), brass); lid.position.y = 0.35; dallah.add(lid);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.14, 8), brass); spout.position.set(-0.1, 0.24, 0); spout.rotation.z = 0.9; dallah.add(spout);
      const spout2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.12, 8), brass); spout2.position.set(-0.16, 0.33, 0); spout2.rotation.z = 0.35; dallah.add(spout2);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), brass); handle.position.set(0.11, 0.2, 0); handle.rotation.z = Math.PI / 2; dallah.add(handle);
      const lamp = new THREE.PointLight(new THREE.Color(t.hex), 0.45, 4.5);
      lamp.position.set(x, 1.75, z + 0.7); g.add(lamp);
      items[t.i] = { tray, cup };
    });
    return { g, items };
  };

  /* Date Catch: six lanes side by side. Every lane shows the same falling dates (they are shared by the round),
   * each with its own basket — six columns read from the back row where six overlapping baskets never would. */
  stages.datecatch = () => {
    const g = makeStage();
    const items = {};
    const LANE_W = 5.6, LANES = TEAMS.length;
    const railMat = new THREE.MeshStandardMaterial({ color: 0x4a3720, roughness: 0.9, metalness: 0.2 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(LANES * LANE_W, 0.12, 0.24), railMat);
    rail.position.set(0, 0.62, -5.4); g.add(rail);
    [-1, 1].forEach(k => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.62, 10), railMat);
      post.position.set(k * (LANES * LANE_W) / 2, 0.31, -5.4); g.add(post);
    });
    TEAMS.forEach((t, i) => {
      const laneX = (i - (LANES - 1) / 2) * LANE_W;
      const basket = new THREE.Group(); basket.position.set(laneX, 1.0, -5.4); g.add(basket);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.38, 0.42, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xb98445, roughness: 0.9, side: THREE.DoubleSide }));
      basket.add(bowl);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 18), new THREE.MeshStandardMaterial({ color: 0x7d5527, roughness: 0.95 }));
      base.position.y = -0.2; basket.add(base);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(t.hex) }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.21; basket.add(rim);
      const glow = new THREE.PointLight(new THREE.Color(t.hex), 0.3, 3); glow.position.set(0, 0.45, 0.45); basket.add(glow);
      /* a lane floor plate in the team colour so the column belongs to its team */
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W - 0.25, 3.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(t.hex), transparent: true, opacity: 0.07 }));
      plate.rotation.x = -Math.PI / 2; plate.position.set(laneX, 0.03, -3.9); g.add(plate);
      items[t.i] = { basket, laneX };
    });
    const dates = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6b3a1a, roughness: 0.8 }), LANES * 8);
    dates.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(dates);
    /* two date palms off to the sides, out of the sightline */
    [-1, 1].forEach(k => {
      const palm = new THREE.Group(); palm.position.set(k * 8.6, 0, -7.4); g.add(palm);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 5.4, 10), new THREE.MeshStandardMaterial({ color: 0x6b4f2f, roughness: 0.95 }));
      trunk.position.y = 2.7; palm.add(trunk);
      for (let f = 0; f < 7; f++) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(0.24, 2.1, 6), new THREE.MeshStandardMaterial({ color: 0x2f6b3c, roughness: 0.9 }));
        frond.position.y = 5.2; frond.rotation.z = Math.cos(f / 7 * Math.PI * 2) * 0.9; frond.rotation.x = Math.sin(f / 7 * Math.PI * 2) * 0.9;
        frond.position.x = Math.cos(f / 7 * Math.PI * 2) * 0.7; frond.position.z = Math.sin(f / 7 * Math.PI * 2) * 0.7;
        palm.add(frond);
      }
    });
    return { g, items, dates, laneW: LANE_W };
  };

  /* Gyro Darts: a falcon-eye board on a stand, with the darts that have already landed stuck in it. */
  stages.darts = () => {
    const g = makeStage();
    const R = 2.5, CY = 3.0, CZ = -2.0;
    /* Sadu board: deep carpet red against cream, so ring boundaries read from the back row */
    const rings = [[1.0, 0x1a1230], [0.78, 0xf6ead2], [0.56, 0xa8452f], [0.36, 0xf6ead2], [0.2, 0xa8452f], [0.08, 0xf6ead2]];
    rings.forEach(([f, col], i) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(R * f, 48), new THREE.MeshStandardMaterial({ color: col, roughness: 0.75, metalness: 0.05 }));
      m.position.set(0, CY, CZ + i * 0.012); g.add(m);
    });
    const halo = new THREE.PointLight(0xffe6a8, 1.1, 12); halo.position.set(0, CY + 0.4, CZ + 2.4); g.add(halo);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.07, 8, 60), new THREE.MeshStandardMaterial({ color: 0xc9a03f, metalness: 0.85, roughness: 0.3 }));
    rim.position.set(0, CY, CZ + 0.02); g.add(rim);
    /* two legs and a back board so it does not read as a floating disc */
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3720, roughness: 0.9 });
    [-1, 1].forEach(k => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.4, 8), wood); leg.position.set(k * (R - 0.3), 1.7, CZ - 0.35); g.add(leg); });
    const backer = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.1, R * 1.1, 0.16, 40), new THREE.MeshStandardMaterial({ color: 0x2c2118, roughness: 0.9 }));
    backer.rotation.x = Math.PI / 2; backer.position.set(0, CY, CZ - 0.12); g.add(backer);
    /* darts: shaft + flight, instanced by simple clones (≤16 is cheap) */
    const darts = [];
    const shaftGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.5, 6);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x24282c, metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 12; i++) {
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      const flight = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 4), new THREE.MeshStandardMaterial({ color: 0xe0b558, emissive: 0x2a1e05, roughness: 0.55 }));
      flight.position.y = 0.26; flight.rotation.x = Math.PI;
      const grp = new THREE.Group(); grp.add(shaft, flight);
      grp.visible = false; g.add(grp); darts.push({ grp, flight });
    }
    return { g, darts, R, CY, CZ };
  };

  /* Sweep Jump: a rotating beam of light raked across the ring, with a hot core and a soft floor wash. */
  stages.sweep = () => {
    const g = makeStage();
    const beam = new THREE.Group();
    const core = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0xffd79a }));
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 1.5), new THREE.MeshBasicMaterial({ color: 0xffb45a, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false }));
    wash.rotation.x = -Math.PI / 2; wash.position.y = 0.03;
    beam.add(core, wash);
    g.add(beam);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 1.5, 12), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: .6, metalness: .3 }));
    post.position.y = 0.75; post.castShadow = true; g.add(post);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd79a, emissive: 0xffb45a, emissiveIntensity: 2.4 }));
    lamp.position.y = 1.55; g.add(lamp);
    return { g, beam };
  };
  /* Arrow Memory: the sequence lives on a floating panel above the floor, drawn to a canvas texture. */
  stages.arrows = () => {
    const g = makeStage();
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 384;
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(13, 4.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    panel.position.set(0, 4.2, -6.4); g.add(panel);
    const draw = (game) => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = 'rgba(4,20,14,.86)'; roundRect(ctx, 8, 8, cv.width - 16, cv.height - 16, 34); ctx.fill();
      ctx.strokeStyle = 'rgba(230,191,106,.55)'; ctx.lineWidth = 5; roundRect(ctx, 8, 8, cv.width - 16, cv.height - 16, 34); ctx.stroke();
      const n = game.seq.length, cell = cv.width / (n + 1);
      for (let i = 0; i < n; i++) {
        const cx = cell * (i + 1), cy = cv.height / 2;
        const active = game.phase === 'show' ? i === game.step : i < (game.progressMax || 0);
        const shown = game.phase === 'show' ? i <= game.step : true;
        ctx.globalAlpha = shown ? 1 : 0.16;
        ctx.fillStyle = active ? 'rgba(230,191,106,.95)' : 'rgba(244,239,225,.10)';
        ctx.beginPath(); roundRect(ctx, cx - 62, cy - 62, 124, 124, 26); ctx.fill();
        ctx.fillStyle = active ? '#06231b' : '#f4efe1';
        ctx.font = '800 86px Baloo, Tajawal, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText({ up: '↑', down: '↓', left: '←', right: '→' }[game.seq[i]] || '?', cx, cy + 4);
        ctx.globalAlpha = 1;
      }
      tex.needsUpdate = true;
    };
    return { g, draw };
  };
  /* Safe Colour: six Sadu hexes in a ring; the called one floods with light. */
  stages.colour = () => {
    const g = makeStage();
    const tiles = [];
    for (let i = 1; i <= 6; i++) {
      const t = PALETTE[i - 1];
      const a = (i - 1) / 6 * Math.PI * 2 - Math.PI / 2;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(t.hex), roughness: .55, metalness: .1, emissive: new THREE.Color(t.hex), emissiveIntensity: 0.05 });
      const tile = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.35, 0.22, 6), mat);
      tile.position.set(Math.cos(a) * 4.9, 0.11, Math.sin(a) * 4.9);
      tile.rotation.y = -a; tile.receiveShadow = true;
      g.add(tile); tiles.push({ tile, mat, team: i });
    }
    return { g, tiles };
  };
  /* Sand Sumo: a raised platform with a hot rim so the edge is unmissable. */
  stages.sumo = () => {
    const g = makeStage();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(8.3, 8.1, 0.5, 64), new THREE.MeshStandardMaterial({ color: 0xd8b47c, roughness: .95 }));
    disc.position.y = 0.25; disc.receiveShadow = true; g.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(8.32, 0.09, 8, 80), new THREE.MeshStandardMaterial({ color: 0xe6bf6a, emissive: 0xe6bf6a, emissiveIntensity: .8, metalness: .5, roughness: .4 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.52; g.add(rim);
    return { g, disc };
  };
  /* Balloon Pump / Glass Fill: one object per team behind the floor, driven by the relay value. */
  stages.balloon = () => {
    const g = makeStage();
    const items = {};
    TEAMS.forEach((t, i) => {
      const x = (i - 0.5) * 6.0;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), new THREE.MeshStandardMaterial({ color: new THREE.Color(t.hex), roughness: .35, metalness: .05 }));
      mesh.position.set(x, 3.2, -9.6);
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 4), new THREE.MeshBasicMaterial({ color: 0xefe4c9 }));
      string.position.set(x, 1.7, -9.6);
      g.add(mesh, string);
      items[t.i] = { mesh, string, x };
    });
    return { g, items };
  };
  stages.glassfill = () => {
    const g = makeStage();
    const items = {};
    TEAMS.forEach((t, i) => {
      const x = (i - 0.5) * 6.0;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.62, 2.4, 22, 1, true), new THREE.MeshStandardMaterial({ color: 0xdff3ea, transparent: true, opacity: .22, roughness: .1, metalness: .1, side: THREE.DoubleSide }));
      glass.position.set(x, 1.55, -9.4);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.58, 1, 20), new THREE.MeshStandardMaterial({ color: new THREE.Color(t.hex), emissive: new THREE.Color(t.hex), emissiveIntensity: .18, roughness: .5 }));
      fill.position.set(x, 0.38, -9.4); fill.scale.y = 0.01;
      g.add(glass, fill);
      items[t.i] = { glass, fill, x };
    });
    return { g, items };
  };
  /* Sky Jets: a separate world — jets over a scrolling Riyadh skyline, camera down the corridor. */
  stages.skyjets = () => {
    const g = makeStage();
    const jetGeo = new THREE.ConeGeometry(0.5, 1.8, 4);
    jetGeo.rotateX(-Math.PI / 2);
    const jets = {};
    TEAMS.forEach((t, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(t.hex), emissive: new THREE.Color(t.hex), emissiveIntensity: .28, roughness: .35, metalness: .5 });
      const mesh = new THREE.Mesh(jetGeo, mat);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.5), mat);
      mesh.add(wing);
      g.add(mesh); jets[t.i] = mesh;
    });
    const towers = [];
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x16352b, roughness: .7, emissive: 0x0a2018, emissiveIntensity: .4 });
    const winTex = makeTex(64, 128, (gc, w, h) => { gc.fillStyle = '#0d2a20'; gc.fillRect(0, 0, w, h); gc.fillStyle = 'rgba(255,205,130,.85)'; for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 12) if (Math.random() < .5) gc.fillRect(x, y, 4, 5); }, [1, 3]);
    return { g, jets, towers, towerMat, winTex, jetGeo };
  };

  /* Glass Bridge: six identical bridges, seven rows of two panes. A pane that breaks stays a hole. */
  stages.glassbridge = () => {
    const g = makeStage();
    const lanes = [];
    for (let t = 1; t <= 6; t++) {
      const lane = new THREE.Group();
      lane.position.x = (t - 3.5) * 2.9;
      const panes = [];
      const railMat = new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.7, metalness: 0.25 });
      /* start platform */
      const start = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.3, 1.7), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.8 }));
      start.position.set(0, 0.02, -6); start.receiveShadow = true; lane.add(start);
      for (let i = 0; i < 7; i++) {
        for (let side = 0; side < 2; side++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1.55),
            new THREE.MeshStandardMaterial({ color: 0xcdeee6, transparent: true, opacity: 0.42, roughness: 0.06, metalness: 0.1, emissive: 0x0d5c4c, emissiveIntensity: 0.35 }));
          m.position.set(side ? 0.64 : -0.64, 0.06, -6 + (i + 1) * 1.75);
          m.receiveShadow = true; lane.add(m);
          panes.push({ i, side, mesh: m });
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.06, 0.1), railMat);
        rail.position.set(0, 0.16, -6 + i * 1.75 + 0.85); lane.add(rail);
      }
      g.add(lane); lanes.push({ team: t, group: lane, panes, lastSig: '' });
    }
    return { g, lanes };
  };

  /* Lava Tanks: two sandstone platforms over a glowing pit, a tank on each, one shell in the air. */
  stages.lavatanks = () => {
    const g = makeStage();
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    const cx2 = cv.getContext('2d');
    cx2.fillStyle = '#2a0d06'; cx2.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 26;
      const gr = cx2.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,170,60,.85)'); gr.addColorStop(1, 'rgba(180,40,10,0)');
      cx2.fillStyle = gr; cx2.beginPath(); cx2.arc(x, y, r, 0, 7); cx2.fill();
    }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(4, 3);
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshBasicMaterial({ map: tex, color: 0xffa04a }));
    lava.rotation.x = -Math.PI / 2; lava.position.y = -0.6; g.add(lava);
    const glow = new THREE.PointLight(0xff8a3a, 2.4, 40); glow.position.set(0, 1.2, 0); g.add(glow);
    const platMat = new THREE.MeshStandardMaterial({ color: 0xb08a5c, roughness: 0.9 });
    const tanks = {};
    for (const side of [-1, 1]) {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.2, 7), platMat);
      plat.position.set(side * 8.5, -0.5, 0); plat.receiveShadow = true; plat.castShadow = true; g.add(plat);
      const tg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 1.5), new THREE.MeshStandardMaterial({ color: side < 0 ? 0x2f9a92 : 0xe0b558, roughness: 0.45, metalness: 0.4 }));
      body.position.y = 0.6; body.castShadow = true;
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x123a2c, roughness: 0.5, metalness: 0.5 }));
      turret.position.y = 1.1;
      const pivot = new THREE.Group(); pivot.position.set(0, 1.18, 0);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.9, 10), new THREE.MeshStandardMaterial({ color: 0x0c2a20, metalness: 0.6, roughness: 0.35 }));
      barrel.rotation.z = Math.PI / 2; barrel.position.set(0.95, 0, 0); pivot.add(barrel);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 1.6), new THREE.MeshStandardMaterial({ color: 0x0f2f24, roughness: 0.6 }));
      shield.position.set(1.25, 0.85, 0);
      tg.add(body, turret, pivot, shield);
      tg.position.set(side * 8.5, 0.05, 0); g.add(tg);
      tanks[side < 0 ? 'a' : 'b'] = { g: tg, pivot, body, side };
    }
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd07a }));
    shell.visible = false; g.add(shell);
    return { g, tanks, shell, glow };
  };

  /* Heart Dodge: a bounded arena of hearts, with bones, feathers and beans crossing it. */
  stages.heartdodge = () => {
    const g = makeStage();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(17.4, 10.4), new THREE.MeshStandardMaterial({ color: 0x1d3c31, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true; g.add(floor);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(18, 0.32, 11), new THREE.MeshStandardMaterial({ color: 0x0d241c, roughness: 0.8, metalness: 0.2 }));
    rail.position.y = -0.17; g.add(rail);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(17.4, 0.05, 10.4)), new THREE.LineBasicMaterial({ color: 0xe0b558, transparent: true, opacity: 0.5 }));
    edge.position.y = 0.08; g.add(edge);
    const MAX = 64;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xf2e6cf, roughness: 0.6 }), MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; g.add(mesh);
    return { g, mesh, MAX };
  };

  /* Hot Dallah: one brass pot, carried, glowing hotter as the hidden fuse burns. */
  stages.hotdallah = () => {
    const g = makeStage();
    const grp = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0xd9a641, metalness: 0.85, roughness: 0.28, emissive: 0x3a1602, emissiveIntensity: 0.6 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.52, 16), brass);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 0.42, 14), brass); neck.position.y = 0.45;
    const lid = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 12), brass); lid.position.y = 0.76;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 0.55, 10), brass);
    spout.position.set(0.34, 0.3, 0); spout.rotation.z = -0.9;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 18), brass);
    handle.position.set(-0.36, 0.28, 0); handle.rotation.y = Math.PI / 2;
    grp.add(pot, neck, lid, spout, handle);
    grp.position.set(0, 2.7, -1); grp.scale.setScalar(1.45); g.add(grp);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.5, 3.2, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb15c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.set(0, 1.5, -1); g.add(beam);
    const light = new THREE.PointLight(0xff7a32, 1.6, 9); light.position.set(0, 2.7, -1); g.add(light);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff8b3c, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending }));
    halo.position.copy(grp.position); g.add(halo);
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xffb15c, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    mark.rotation.x = -Math.PI / 2; mark.position.set(0, 0.06, -1); g.add(mark);
    return { g, grp, light, halo, beam, mark };
  };

  /* Sword Clash: a fighting circle and two blades that answer the guards. */
  stages.swordclash = () => {
    const g = makeStage();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.6, 0.4, 48), new THREE.MeshStandardMaterial({ color: 0x1c4335, roughness: 0.85 }));
    disc.position.y = -0.2; disc.receiveShadow = true; g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.06, 8, 64), new THREE.MeshStandardMaterial({ color: 0xe0b558, metalness: 0.8, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; g.add(ring);
    const blades = [-3.4, 3.4].map(x => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.5, 0.16), new THREE.MeshStandardMaterial({ color: 0xdfe9ee, metalness: 0.95, roughness: 0.14, emissive: 0x000000 }));
      b.position.set(x, 1.5, 1.2); b.castShadow = true; g.add(b); return b;
    });
    return { g, blades };
  };

  /* Trace Race: the shape to trace is drawn on the floor, line for line. */
  stages.trace = () => {
    const g = makeStage();
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
    const tex = new THREE.CanvasTexture(cv);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95 }));
    plane.rotation.x = -Math.PI / 2; plane.position.set(0, 0.06, 0); g.add(plane);
    return { g, cv, tex, plane, drawn: '', t0: performance.now() };
  };

  /* Box Tower: six towers, one swinging crate each, and the whole thing can come down. */
  stages.boxtower = () => {
    const g = makeStage();
    const teams = [];
    for (let t = 1; t <= 6; t++) {
      const grp = new THREE.Group();
      grp.position.x = (t - 3.5) * 2.8;
      const boxes = [];
      for (let i = 0; i < 12; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.56, 1.9),
          new THREE.MeshStandardMaterial({ color: [0x22c07a, 0xe0b558, 0xd2573f, 0xcfa96b, 0x2f9a92, 0xf2efe3][t - 1], roughness: 0.72, metalness: 0.08 }));
        b.visible = false; b.castShadow = true; b.receiveShadow = true; grp.add(b); boxes.push(b);
      }
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.56, 1.9), new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.6, metalness: 0.3, emissive: 0x2a1a06, emissiveIntensity: 0.5 }));
      crate.castShadow = true; grp.add(crate);
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.08, 9, 0.08), new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.8 }));
      mast.position.set(3.1, 4.5, 0); grp.add(mast);
      g.add(grp); teams.push({ team: t, grp, boxes, crate, lastSig: '' });
    }
    return { g, teams };
  };

  /* Lucky Pick: five chests in an arc, one of them a trap. */
  stages.luckypick = () => {
    const g = makeStage();
    const chests = [];
    for (let i = 0; i < 5; i++) {
      const grp = new THREE.Group();
      const a = (-0.62 + i * 0.31) * Math.PI;
      grp.position.set(Math.sin(a) * 6.2, 0, Math.cos(a) * 3.2 - 2.2);
      grp.rotation.y = a;
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.05, 1.25), new THREE.MeshStandardMaterial({ color: 0x8a5a2f, roughness: 0.7, metalness: 0.15 }));
      box.position.y = 0.55; box.castShadow = true;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 1.35), new THREE.MeshStandardMaterial({ color: 0xe0b558, metalness: 0.75, roughness: 0.3 }));
      lid.position.set(0, 1.16, 0); lid.castShadow = true;
      grp.add(box, lid); g.add(grp); chests.push({ grp, box, lid, i });
    }
    return { g, chests };
  };

  /* Word Race: the scrambled letters hang over the stage. */
  stages.wordrace = () => {
    const g = makeStage();
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
    const tex = new THREE.CanvasTexture(cv);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(17, 4.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    plane.position.set(0, 4.4, -3.6); g.add(plane);
    const base = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 3), new THREE.MeshStandardMaterial({ color: 0x14503a, roughness: 0.8 }));
    base.position.set(0, -0.15, -2.6); g.add(base);
    return { g, cv, tex, plane, drawn: '', word: '' };
  };

  /* Quick Draw: two figures, a duelling line, one signal lamp. */
  stages.quickdraw = () => {
    const g = makeStage();
    const line = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.16), new THREE.MeshBasicMaterial({ color: 0xe0b558 }));
    line.position.set(0, 0.05, 1.0); g.add(line);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), new THREE.MeshBasicMaterial({ color: 0xd2573f }));
    lamp.position.set(0, 2.6, 1.0); g.add(lamp);
    const halo = new THREE.PointLight(0xff5a2a, 1.6, 12); halo.position.copy(lamp.position); g.add(halo);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 10), new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.7 }));
    post.position.set(0, 1.2, 1.0); g.add(post);
    return { g, lamp, halo };
  };

  /* Spotlight Run: three roaming cones of light on the majlis floor. */
  stages.spotlightrun = () => {
    const g = makeStage();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 9.6), new THREE.MeshStandardMaterial({ color: 0x18352a, roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true; g.add(floor);
    const cones = [];
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.75, 9, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.085, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      cone.position.y = 4.5; g.add(cone);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.75, 32), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending }));
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04; g.add(pool);
      cones.push({ cone, pool });
    }
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(15.6, 0.04, 9.6)), new THREE.LineBasicMaterial({ color: 0xe0b558, transparent: true, opacity: 0.35 }));
    rim.position.y = 0.06; g.add(rim);
    /* the two spotlight runners are the subject of the round: put the modelled rigs here, not the
       instanced crowd capsules, so the hero of the frame is the best art in the build */
    if (window.MAJLIS_GLB && window.MAJLIS_GLB.hero) {
      window.MAJLIS_GLB.hero(g, { url: '/assets/chars/char-a.glb', hex: 0x2fd0b4, x: -2.6, z: 0.4, rotY: 0.35, height: 2.5 });
      window.MAJLIS_GLB.hero(g, { url: '/assets/chars/char-b.glb', hex: 0xf6a93b, x: 2.6, z: 0.4, rotY: -0.35, height: 2.5 });
    }
    return { g, cones };
  };

  function buildStage(id) {
    clearStage();
    stageId = id;
    const make = stages[id];
    if (!make) return null;
    stage = make();
    if (stage.g.userData) stage.g.userData.kind = id;
    return stage;
  }

  /* ------------------------------------------------------------------ helpers */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /* ------------------------------------------------------------------ wheel */
  let wheel = null;
  function buildWheel(w) {
    const g = makeStage();
    stageId = 'wheel';
    const N = Math.max(2, w.order.length), step = (Math.PI * 2) / N;
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024;
    const ctx = cv.getContext('2d');
    const cx = 512, cy = 512, R = 500;
    /* deep indigo slices with brass rules — the wheel used to be green, which is what made the whole party
       read as the race app's palette */
    /* alternating cream and indigo wedges: adjacent slices never sit at the same luminance, so the
       disc reads as wedges from the back of a hall instead of a flat violet circle */
    const wedge = [{ bg: '#f6ead2', fg: '#241a44' }, { bg: '#241a44', fg: '#f6ead2' }];
    for (let i = 0; i < N; i++) {
      const a0 = i * step - Math.PI / 2, a1 = a0 + step;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
      const w0 = wedge[i % 2];
      ctx.fillStyle = w0.bg; ctx.fill();
      ctx.strokeStyle = '#c99441'; ctx.lineWidth = 6; ctx.stroke();
      /* label along the radius; the left half is flipped so no name is ever upside down */
      const mid = a0 + step / 2;
      const flip = mid > Math.PI / 2 && mid < (Math.PI * 3) / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(mid + (flip ? Math.PI : 0));
      ctx.fillStyle = wedge[i % 2].fg; ctx.textBaseline = 'middle';
      ctx.textAlign = flip ? 'left' : 'right';
      const meta = (w.order || [])[i];
      const id = meta ? (typeof meta === 'string' ? meta : meta.id) : null;
      if (id) {
        const nm = (window.MJ && window.MJ.nameFor) ? window.MJ.nameFor(id) : { ar: id, en: '' };
        const inset = flip ? -(R - 40) : (R - 40);
        /* two lines when the name is long, and big enough to be read from the back row */
        const label = String((nm && nm.ar) || id);
        const words = label.split(' ');
        const line1 = words.length > 1 ? words.slice(0, 1).join(' ') : label.slice(0, 10);
        const line2 = words.length > 1 ? words.slice(1).join(' ') : '';
        const size = line2 ? 74 : 92;
        ctx.font = '800 ' + size + 'px Baloo, Tajawal, sans-serif';
        if (line2) {
          ctx.fillText(line1.slice(0, 12), inset, size * 0.42);
          ctx.fillText(line2.slice(0, 12), inset, -size * 0.48);
        } else ctx.fillText(line1.slice(0, 12), inset, 0);
      }
      ctx.restore();
    }
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.9, 96), new THREE.MeshBasicMaterial({ map: tex }));
    disc.position.set(0, 4.55, 1.5);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.96, 0.13, 10, 96), new THREE.MeshStandardMaterial({ color: 0xe6bf6a, metalness: .7, roughness: .3, emissive: 0x5a4318, emissiveIntensity: .5 }));
    rim.position.copy(disc.position);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), new THREE.MeshStandardMaterial({ color: 0xe6bf6a, metalness: .7, roughness: .3 }));
    hub.position.set(0, 4.55, 1.52);
    /* a pointer you can see from the door: it stands proud of the rim and glows */
    const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.25, 3), new THREE.MeshBasicMaterial({ color: 0xffc96b }));
    pointer.position.set(0, 8.95, 2.3); pointer.rotation.z = Math.PI;
    g.add(disc, rim, hub, pointer);
    /* landing: bring the drawn wedge's centre to the top pointer */
    const targetIndex = w.order.findIndex(x => (typeof x === 'string' ? x : x.id) === w.target);
    const idx = targetIndex < 0 ? 0 : targetIndex;
    /* the winning wedge lights up when the wheel stops. It is drawn on its own canvas with the same
       wedge maths as the disc, so it can never land on the wrong slice. */
    const hlTex = (() => {
      const hc = document.createElement('canvas'); hc.width = hc.height = 1024;
      const g2 = hc.getContext('2d'); g2.clearRect(0, 0, 1024, 1024);
      const a0 = idx * step - Math.PI / 2, a1 = a0 + step;
      g2.beginPath(); g2.moveTo(512, 512); g2.arc(512, 512, R, a0, a1); g2.closePath();
      g2.fillStyle = 'rgba(255,201,107,.55)'; g2.fill();
      const t = new THREE.CanvasTexture(hc);
      if (t.colorSpace) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const hl = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2),
      new THREE.MeshBasicMaterial({ map: hlTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    hl.position.z = 0.03;
    disc.add(hl);
    const phiEnd = (idx * step + step / 2) + Math.PI * 2 * 4;
    wheel = { g, disc, rim, pointer, step, N, t0: performance.now(), dur: 2900, phiEnd, done: false };
    return wheel;
  }

  /* ------------------------------------------------------------------ per-stage props */
  function animateStage(s, game, dt) {
    if (!stage || !game) return;
    const now = performance.now();
    if (s.mode === 'sweep' && stage.beam) {
      stage.beam.rotation.y = -game.angle;
      const pulse = 0.72 + 0.28 * Math.sin(now / 90);
      stage.beam.children[0].material.color.setRGB(1, 0.82 * pulse, 0.58 * pulse);
      stage.beam.children[1].material.opacity = 0.18 + 0.16 * Math.sin(now / 120);
    }
    if (s.mode === 'glassbridge' && stage.lanes) {
      for (const L of stage.lanes) {
        const d = (game.teams || []).find(t => t.team === L.team);
        const sig = d ? (d.revealed || []).join('') : '';
        if (L.lastSig !== sig) {
          L.lastSig = sig;
          L.panes.forEach(p => {
            const rv = d && d.revealed ? d.revealed[p.i] : undefined;
            p.mesh.visible = rv !== 0;
            p.mesh.material.opacity = rv === 1 ? 0.22 : 0.42;
            p.mesh.material.color.set(rv === 1 ? 0x9fe8d4 : 0xcdeee6);
          });
        }
      }
    }
    if (s.mode === 'lavatanks' && stage.tanks) {
      (game.tanks || []).forEach((tk, i) => {
        const T = stage.tanks[i === 0 ? 'a' : 'b']; if (!T) return;
        T.g.position.x = tk.x;
        T.pivot.rotation.z = (tk.angle || 45) * Math.PI / 180;
        T.body.material.emissive = new THREE.Color(tk.charging ? 0xff9a3c : 0x000000);
        T.body.material.emissiveIntensity = tk.charging ? 0.9 : 0;
        T.g.visible = tk.alive !== false;
        T.body.material.color.set(tk.flash ? 0xffffff : (i === 0 ? 0x2fd0b4 : 0xf6a93b));
      });
      const pj = game.proj;
      stage.shell.visible = !!pj;
      if (pj) stage.shell.position.set(pj.x, Math.max(0.3, pj.y), 0);
      stage.glow.intensity = 2.2 + Math.sin(now / 320) * 0.5;
    }
    if (s.mode === 'heartdodge' && stage.mesh) {
      const list = (game.projectiles || []).slice(0, stage.MAX);
      v3.set(0, 0, 0); q.identity(); sc.set(1, 1, 1);
      list.forEach((o, i) => {
        const w = o.w || 0.6, h = o.h || 0.6;
        v3.set(o.x, o.k === 'bean' ? Math.max(0.5, o.y) : 0.16, 5.2 - o.y);
        eul.set(0, o.k === 'bone' ? 0 : (o.k === 'feather' ? 0.4 : 0), 0); q.setFromEuler(eul);
        sc.set(w, o.k === 'bean' ? 0.9 : 0.22, h);
        m4.compose(v3, q, sc);
        stage.mesh.setMatrixAt(i, m4);
        col.set(o.k === 'bone' ? 0xf4ecda : o.k === 'feather' ? 0xffd9a8 : 0xd2573f);
        stage.mesh.setColorAt(i, col);
      });
      stage.mesh.count = list.length;
      stage.mesh.instanceMatrix.needsUpdate = true;
      if (stage.mesh.instanceColor) stage.mesh.instanceColor.needsUpdate = true;
    }
    if (s.mode === 'hotdallah' && stage.grp) {
      const p = game.holderPos || { x: 0, z: -1 };
      const bob = Math.sin(now / 260) * 0.12;
      stage.grp.position.set(p.x, 2.55 + bob, p.z);
      stage.halo.position.copy(stage.grp.position);
      stage.beam.position.set(p.x, 1.6, p.z);
      stage.mark.position.set(p.x, 0.06, p.z);
      const heat = game.fusePct || 0;
      stage.light.intensity = 1.1 + heat * 3.2;
      stage.halo.material.opacity = 0.1 + heat * 0.3;
      const fl = game.flash ? 1.9 : 1;
      stage.grp.scale.setScalar(fl + heat * 0.12);
      stage.light.color.set(heat > 0.8 ? 0xff4a1e : 0xff9a4a);
    }
    if (s.mode === 'swordclash' && stage.blades) {
      const gd = { high: 0.6, mid: 0.02, low: -0.55 };
      const picks = game.picks || {};
      const a = picks.a ? gd[picks.a] : 0.1, b = picks.b ? gd[picks.b] : 0.1;
      stage.blades[0].rotation.z += ((a * -1) - stage.blades[0].rotation.z) * Math.min(1, dt * 9);
      stage.blades[1].rotation.z += ((b) - stage.blades[1].rotation.z) * Math.min(1, dt * 9);
      stage.blades.forEach((m, i) => {
        const sc = (game.score || [])[i];
        const won = picks.winner && sc && picks.winner === sc.id;
        m.material.emissive.set(picks.a || picks.b ? (won ? 0x8a6a1a : 0x1a2630) : 0x000000);
        m.material.emissiveIntensity = 0.9;
      });
    }
    if (s.mode === 'trace' && stage.cv) {
      if (stage.drawn !== game.name) {
        stage.drawn = game.name;
        const c = stage.cv.getContext('2d');
        c.clearRect(0, 0, 512, 512);
        c.strokeStyle = 'rgba(224,181,88,.16)'; c.lineWidth = 34; c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath(); (game.target || []).forEach((q, i) => { const X = q[0] * 512, Y = (1 - q[1]) * 512; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
        c.strokeStyle = 'rgba(255,236,196,.95)'; c.lineWidth = 8; c.setLineDash([16, 12]);
        c.beginPath(); (game.target || []).forEach((q, i) => { const X = q[0] * 512, Y = (1 - q[1]) * 512; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
        c.setLineDash([]);
        stage.tex.needsUpdate = true;
      }
      stage.plane.material.opacity = 0.72 + Math.sin(now / 520) * 0.16;
    }
    if (s.mode === 'boxtower' && stage.teams) {
      for (const T of stage.teams) {
        const d = (game.teams || []).find(x => x.team === T.team); if (!d) continue;
        const sig = d.stack.map(v => Math.round(v * 100)).join(',') + '|' + d.dropping;
        if (T.lastSig !== sig) {
          T.lastSig = sig;
          T.boxes.forEach((b, i) => { b.visible = i < d.stack.length; if (i < d.stack.length) { b.position.set(d.stack[i] * 1.1, 0.28 + i * 0.56, 0); } });
        }
        const drop = d.dropping >= 0 ? d.dropping : 0;
        const targetY = 0.28 + d.stack.length * 0.56 + 1.9 - drop * (d.dropping >= 0 ? 1.5 : 0);
        T.crate.position.set(Math.max(-3.0, Math.min(3.0, d.dropping >= 0 ? d.dropX * 1.1 : game.swing * 1.05)), targetY, 0);
        T.crate.rotation.z = d.dropping >= 0 ? 0 : Math.sin(now / 420 + T.team) * 0.06;
        if (d.result === 'fall' && d.dropping < 0) T.crate.position.y = 0.9;
      }
    }
    if (s.mode === 'luckypick' && stage.chests) {
      const rv = game.revealed;
      stage.chests.forEach(C => {
        const isTrap = rv && rv.trap === C.i;
        C.lid.rotation.x = isTrap ? -1.1 : 0;
        C.lid.position.y = isTrap ? 1.35 : 1.16;
        C.box.material.emissive.set(isTrap ? 0x8a1a08 : (game.phase === 'pick' ? 0x0a2418 : 0x000000));
        C.box.material.emissiveIntensity = isTrap ? 0.9 : 0.6;
      });
    }
    if (s.mode === 'wordrace' && stage.cv) {
      if (stage.word !== game.scrambled) {
        stage.word = game.scrambled;
        const c = stage.cv.getContext('2d');
        c.clearRect(0, 0, 1024, 256);
        c.font = '800 150px Baloo, Tajawal, system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        const letters = (game.scrambled || '').split('');
        const step = 1024 / (letters.length + 0.6);
        letters.forEach((ch, i) => {
          const x = step * (i + 0.8), y = 132 + Math.sin(i * 1.7) * 12;
          c.save(); c.translate(x, y); c.rotate((i % 2 ? 1 : -1) * 0.05);
          c.fillStyle = 'rgba(0,0,0,.35)'; c.fillText(ch, 4, 6);
          c.fillStyle = i % 3 === 0 ? '#f4e6c4' : i % 3 === 1 ? '#e0b558' : '#bfe6d6';
          c.fillText(ch, 0, 0); c.restore();
        });
        stage.tex.needsUpdate = true;
      }
    }
    if (s.mode === 'quickdraw' && stage.lamp) {
      const go = game.phase === 'go';
      const early = game.early > 0;
      const col = early ? 0xd2573f : go ? 0x37e08a : 0x8a3a2a;
      stage.lamp.material.color.set(col);
      stage.halo.color.set(col);
      stage.halo.intensity = go ? 3.2 + Math.sin(now / 60) * 1.2 : 1.1;
      stage.lamp.scale.setScalar(go ? 1.25 + Math.sin(now / 80) * 0.1 : 1);
    }
    if (s.mode === 'spotlightrun' && stage.cones) {
      (game.spots || []).slice(0, 3).forEach((sp, i) => {
        const C = stage.cones[i]; if (!C) return;
        C.cone.position.set(sp.x, 4.5, sp.z);
        C.pool.position.set(sp.x, 0.04, sp.z);
        const o = 0.06 + (sp.heat || 0.5) * 0.05;
        C.cone.material.opacity = o;
        C.pool.material.opacity = 0.14 + (sp.heat || 0.5) * 0.12;
      });
    }
    if (s.mode === 'marathon' && stage.runner) {
      const r = game.runner;
      stage.runner.visible = !!r;
      if (r) {
        stage.runner.position.set(r.x * 3.2, Math.abs(Math.sin(now / 150 + 1)) * 0.14, -3.4 - r.prog * 6.6);
        stage.runner.rotation.y = r.side === 'left' ? 0.4 : -0.4;
        if (stage.badgeKey !== r.type) {
          stage.badgeKey = r.type;
          const cx = stage.badgeCtx; cx.clearRect(0, 0, 256, 160);
          cx.fillStyle = 'rgba(8,26,18,.86)';
          roundRect(cx, 8, 8, 240, 144, 34); cx.fill();
          cx.strokeStyle = 'rgba(230,191,106,.95)'; cx.lineWidth = 6; roundRect(cx, 8, 8, 240, 144, 34); cx.stroke();
          cx.fillStyle = '#f7e6b8';
          cx.font = '900 84px "Noto Naskh Arabic", "Noto Sans Arabic", system-ui, sans-serif';
          cx.textAlign = 'center'; cx.textBaseline = 'middle';
          cx.fillText(r.ar || '', 128, 84);
          stage.badgeTex.needsUpdate = true;
        }
        stage.badge.material.color.set(r.bounce ? 0xff9c86 : 0xffffff);
        if (stage.legL) {
          const swing = Math.sin(now / 110) * 0.5;
          stage.legL.rotation.x = swing; stage.legR.rotation.x = -swing;
        }
        stage.halo.position.set(stage.runner.position.x, 2.3, stage.runner.position.z);
        stage.halo.intensity = r.bounce ? 0.5 : 1.2;
      }
      for (const k of ['left', 'right']) {
        const gate = stage.gates[k]; if (!gate) continue;
        const hot = r && r.side === k && r.prog > 0.72;
        gate.light.intensity = hot ? 2.6 + Math.sin(now / 90) * 0.4 : 0.7;
      }
    }
    if (s.mode === 'qahwa' && stage.items) {
      (game.teams || []).forEach(t => {
        const it = stage.items[t.team]; if (!it) return;
        const f = Math.max(0.005, Math.min(0.99, t.fill || 0));
        it.fill.scale.y = f;
        it.fill.position.y = 0.13 + 0.25 * f;
        it.stream.visible = !!t.pouring;
      });
    }
    if (s.mode === 'tray' && stage.items) {
      (game.teams || []).forEach(t => {
        const it = stage.items[t.team]; if (!it) return;
        const cup = Math.max(-1, Math.min(1, t.cup || 0));
        it.tray.rotation.z = -(t.tilt || 0) * 0.42;
        it.cup.position.x = cup * 0.55;
        it.cup.position.y = 0.22 + Math.abs(cup) * 0.1;
        it.cup.material.color.set(t.wet ? 0xffb4a4 : 0xf2efe3);
      });
    }
    if (s.mode === 'darts' && stage.darts) {
      const list = (game.recent || []).slice(-12);
      stage.darts.forEach((d, i) => {
        const hit = list[i];
        if (!hit) { d.grp.visible = false; return; }
        d.grp.visible = true;
        /* tiny per-dart z offset: coincident shafts z-fought and looked like scattered line artefacts */
        d.grp.position.set(hit.x * stage.R, stage.CY + hit.y * stage.R, stage.CZ + 0.08 + (i % 8) * 0.012);
        d.grp.scale.setScalar(0.86);
        d.grp.rotation.x = Math.PI / 2;
        /* fan the shafts out a few degrees each: a wall of parallel darts in one spot read as a glitch, not as darts */
        d.grp.rotation.z = Math.atan2(hit.y, hit.x) + Math.PI / 2 + ((i % 5) - 2) * 0.13;
        const pts = hit.pts || 0;
        d.flight.material.color.set(pts >= 25 ? 0x37e08a : pts >= 15 ? 0xe0b558 : 0xb9a98a);
        const fresh = i === list.length - 1; /* the newest dart pops in a little larger */
        if (fresh) d.grp.scale.setScalar(1.2);
      });
    }
    if (s.mode === 'datecatch' && stage.items && stage.dates) {
      (game.teams || []).forEach(t => {
        const it = stage.items[t.team]; if (!it) return;
        it.basket.position.x = it.laneX + Math.max(-1, Math.min(1, t.x || 0)) * (stage.laneW * 0.42);
      });
      const list = (game.dates || []).slice(0, 8);
      const m = new THREE.Matrix4();
      let k = 0;
      for (let lane = 0; lane < 2; lane++) {
        const laneX = (lane - 0.5) * stage.laneW;
        for (let i = 0; i < 8; i++, k++) {
          const d = list[i];
          if (!d) { m.makeScale(0, 0, 0); }
          else { m.makeTranslation(laneX + d.x * (stage.laneW * 0.42), 6.0 - d.p * 5.2, -5.4); }
          stage.dates.setMatrixAt(k, m);
        }
      }
      stage.dates.instanceMatrix.needsUpdate = true;
    }
    if (s.mode === 'arrows' && stage.draw) {
      const sig = game.phase + ':' + game.step + ':' + game.finished;
      if (stage.lastSig !== sig) { stage.lastSig = sig; stage.draw(game); }
    }
    if (s.mode === 'colour' && stage.tiles) {
      const sig = game.signal ? (game.signal.kind + game.signal.zone + ':' + game.phase) : '';
      if (stage.lastSig !== sig) {
        stage.lastSig = sig;
        for (const t of stage.tiles) {
          const called = game.signal && game.signal.kind === 'colour' && game.signal.zone === t.team;
          t.mat.emissiveIntensity = called ? 1.5 : 0.05;
          t.mat.color.set(called ? '#ffffff' : (PALETTE[t.team - 1] || PALETTE[0]).hex);
          t.mat.emissive.set(called ? (PALETTE[t.team - 1] || PALETTE[0]).hex : '#000000');
        }
      }
      for (const t of stage.tiles) if (game.signal && game.signal.kind === 'colour' && game.signal.zone === t.team) t.mat.emissiveIntensity = 1.1 + 0.5 * Math.sin(now / 140);
    }
    if (s.mode === 'sumo' && stage.disc) stage.disc.rotation.y = game.spin || 0;
    if (s.mode === 'balloon' && stage.items) {
      (game.teams || []).forEach(t => {
        const it = stage.items[t.team]; if (!it) return;
        const v = Math.max(0, Math.min(1, t.value));
        const s2 = t.popped ? 0.001 : 0.75 + v * 1.5;
        it.mesh.scale.setScalar(s2);
        it.mesh.position.y = t.popped ? 2.0 : 2.35 + v * 0.6;
        it.mesh.material.emissive = it.mesh.material.emissive || new THREE.Color();
        it.mesh.material.emissiveIntensity = t.popped ? 0 : 0.06 + v * 0.4;
        it.mesh.material.emissive.set(t.popped ? '#000000' : (TEAM[t.team] || TEAMS[0]).hex);
      });
    }
    if (s.mode === 'glassfill' && stage.items) {
      (game.teams || []).forEach(t => {
        const it = stage.items[t.team]; if (!it) return;
        const v = Math.max(0, Math.min(1, t.value));
        it.fill.scale.y = Math.max(0.01, v * 2.2);
        it.fill.position.y = 0.38 + (v * 2.2) / 2;
        it.fill.material.emissiveIntensity = t.popped ? 0.5 : 0.18;
        it.fill.material.color.set(t.popped ? '#7d2a1c' : (TEAM[t.team] || TEAMS[0]).hex);
      });
    }
    if (s.mode === 'skyjets' && stage.jets) {
      (game.jets || []).forEach(j => {
        const m = stage.jets[j.team]; if (!m) return;
        m.position.set(j.x * 1.25, j.y * 0.95 + 0.4, j.alive ? 2.0 : 1.0 - (now - (m.userData.outAt || now)) / 600);
        m.visible = j.alive || (now - (m.userData.outAt || 0)) < 700;
        if (!j.alive && !m.userData.outAt) m.userData.outAt = now;
        if (j.alive) m.rotation.z = Math.sin(now / 260 + j.team) * 0.12;
        if (j.split) {
          const dir = j.dir; m.rotation.x = dir === 'up' ? -0.25 : dir === 'down' ? 0.25 : 0;
          m.rotation.y = dir === 'left' ? 0.3 : dir === 'right' ? -0.3 : 0;
        }
      });
      /* towers: pooled boxes, recycled as they scroll past */
      const list = game.towers || [];
      if (!stage.pool) {
        stage.pool = [];
        for (let i = 0; i < 22; i++) {
          const mat = new THREE.MeshStandardMaterial({ color: 0x16352b, roughness: .65, metalness: .15, emissive: 0x081e16, emissiveIntensity: .5 });
          const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
          b.visible = false; stage.g.add(b); stage.pool.push(b);
        }
      }
      stage.pool.forEach((b, i) => {
        const t = list[i];
        if (!t) { b.visible = false; return; }
        b.visible = true;
        b.scale.set(t.w, t.h, 2.2);
        b.position.set(t.x * 1.25, t.h / 2, 2 - t.z * 0.85);
      });
    }
    if (s.phase === 'wheel' && wheel && !wheel.done) {
      const k = Math.min(1, (now - wheel.t0) / wheel.dur);
      const p = 1 - Math.pow(1 - k, 5);
      wheel.disc.rotation.z = wheel.phiEnd * p;
      wheel.rim.rotation.z = wheel.disc.rotation.z;
      if (k >= 1) wheel.done = true;
    }
    /* lanterns drift */
    if (env && env.userData && env.userData.lanterns) {
      env.userData.lanterns.forEach((l, i) => {
        l.position.y = l.userData.base + Math.sin(now / 1600 + i) * 0.08;
        l.userData.glow.position.copy(l.position);
        l.userData.glow.material.opacity = 0.72 + 0.18 * Math.sin(now / 900 + i * 1.3);
      });
    }
  }

  /* ------------------------------------------------------------------ camera */
  const CAM = {
    lobby: { p: [0, 8.6, 20.5], l: [0, 2.0, -3] },
    wheel: { p: [0, 5.6, 17.0], l: [0, 4.5, 1.4] },
    sweep: { p: [0, 10.4, 15.4], l: [0, 1.0, 0] },
    arrows: { p: [0, 7.6, 16.2], l: [0, 3.2, -3.4] },
    colour: { p: [0, 12.6, 14.4], l: [0, 0.4, 1.2] },
    sumo: { p: [0, 8.8, 13.4], l: [0, 0.8, 0] },
    balloon: { p: [0, 7.2, 13.6], l: [0, 3.4, -7.0] },
    glassfill: { p: [0, 7.0, 13.2], l: [0, 2.4, -7.0] },
    skyjets: { p: [0, 3.4, 11.4], l: [0, 3.4, -14] },
    glassbridge: { p: [0, 12.6, 21], l: [0, 0.2, -1] },
    hotdallah: { p: [0, 8.2, 16.5], l: [0, 1.6, -1] },
    swordclash: { p: [0, 3.4, 12.6], l: [0, 1.7, 0.4] },
    trace: { p: [0, 17.5, 5.2], l: [0, 0, -0.4] },
    boxtower: { p: [0, 10.4, 18.5], l: [0, 2.4, -0.6] },
    luckypick: { p: [0, 10.6, 14.6], l: [0, 0.8, -2] },
    wordrace: { p: [0, 5.6, 13.2], l: [0, 3.6, -2.4] },
    quickdraw: { p: [0, 4.2, 12.4], l: [0, 1.6, 1.0] },
    spotlightrun: { p: [0, 13.4, 12.6], l: [0, 0.2, -0.4] },
    marathon: { p: [0, 6.4, 10.2], l: [0, 1.5, -7.5] },
    qahwa: { p: [0, 3.0, 4.6], l: [0, 0.6, -7.6] },
    tray: { p: [0, 2.7, 4.4], l: [0, 1.2, -6.4] },
    datecatch: { p: [0, 3.6, 3.0], l: [0, 1.2, -5.4] },
    darts: { p: [0, 3.5, 7.6], l: [0, 3.0, -2.0] },
    lavatanks: { p: [0, 6.2, 18.5], l: [0, 1.6, -0.5] },
    heartdodge: { p: [0, 14.2, 13.6], l: [0, 0.2, -0.6] },
  };
  const camPos = new THREE.Vector3(0, 8.6, 20.5), camLook = new THREE.Vector3(0, 2, -3);
  let camWanted = { p: [0, 8.6, 20.5], l: [0, 2, -3] };

  function setCamFor(s) {
    if (s.phase === 'wheel') camWanted = CAM.wheel;
    else if (s.phase === 'playing' || s.phase === 'results' || s.phase === 'announce' || s.phase === 'countdown') camWanted = CAM[s.mode] || CAM.lobby;
    else camWanted = CAM.lobby;
  }
  function updateCamera(dt) {
    const k = 1 - Math.pow(0.002, dt);
    camPos.lerp(v3.set(camWanted.p[0], camWanted.p[1], camWanted.p[2]), k);
    camLook.lerp(v3.set(camWanted.l[0], camWanted.l[1], camWanted.l[2]), k);
    camera.position.copy(camPos);
    /* a slow orbit keeps the projector alive without motion sickness */
    const t = performance.now() / 1000;
    camera.position.x += Math.sin(t * 0.12) * 0.5;
    camera.lookAt(camLook);
  }

  /* ------------------------------------------------------------------ state */
  let env = null, lastCharsAt = 0, podiumKey = '';
  let gate = null;

  function applyState(s) {
    if (!s) return;
    state = s;
    setCamFor(s);
    if (s.phase === 'wheel' && s.wheel) {
      const key = 'wheel:' + (s.wheel.index) + ':' + s.wheel.order.join(',');
      if (stageId !== 'wheel' || !wheel || wheel.key !== key) { buildWheel(s.wheel); wheel.key = key; }
    } else if (s.phase === 'playing' && s.mode) {
      if (stageId !== s.mode) {
        buildStage(s.mode);
        if (s.mode === 'sweep' || s.mode === 'arrows' || s.mode === 'colour' || s.mode === 'sumo' || s.mode === 'balloon' || s.mode === 'glassfill') {
          /* nothing else to prebuild */
        }
      }
    } else if (s.phase === 'final' || s.phase === 'lobby') {
      if (stageId !== 'none') { clearStage(); stageId = 'none'; }
      body.count = head.count = ghutra.count = blob.count = 0;
    }
    /* finale: the two teams stand on the sand as animated avatars, dressed in their own colour */
    if (window.MAJLIS_GLB) {
      const ranked = (s.teams || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));
      const key = s.phase === 'final' && ranked.length ? 'podium:' + ranked.map(t => t.key).join(',') : '';
      if (key !== podiumKey) {
        podiumKey = key;
        if (key) {
          MAJLIS_GLB.podium(scene, [
            { url: '/assets/chars/char-a.glb', hex: ranked[0].hex, x: 6.1, z: 4.6, rotY: -0.15, clip: 'emote-yes', tier: 1.9, plinthR: 1.5 },
            { url: '/assets/chars/char-b.glb', hex: (ranked[1] || ranked[0]).hex, x: -5.9, z: 4.6, rotY: 0.15, clip: 'idle', tier: 0.7, plinthR: 1.2 },
          ]);
        } else MAJLIS_GLB.clearPodium();
      }
    }
    const view = s.view || null;
    if (view && view.chars && view.chars.length) updateChars(view.chars, Math.min(0.1, (performance.now() - lastCharsAt) / 1000 || 0.016), s.mode);
    else if (s.phase === 'playing') updateChars([], 0.016, s.mode);
    if (view && view.game) animateStage(s, view.game, 0.016);
  }

  /* ------------------------------------------------------------------ boot */
  buildSky(); buildGround(); buildLights(); env = buildMajlis(); buildBanners();
  /* the majlis set around the arena: Kenney (CC0) furniture, restyled to the night palette */
  if (window.MAJLIS_GLB) { try { MAJLIS_GLB.dress(scene); } catch (e) { console.warn('dressing failed', e); } }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  const GAMES_META = {};
  function nameFor(id) { return GAMES_META[id] || { ar: id, en: id, emoji: '' }; }

  window.MJ = {
    nameFor,
    setGames(list) { (list || []).forEach(g => GAMES_META[g.id] = g); },
    setState: applyState,
    frame(dt) {
      updateCamera(dt);
      if (window.MAJLIS_GLB) MAJLIS_GLB.update(dt);
      if (state) {
        let view = state.view;
        if (view && view.game) animateStage(state, view.game, dt);
      }
      renderer.render(scene, camera);
    },
    get state() { return state; },
    camera, scene, renderer,
  };
})();
