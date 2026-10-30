/* Party art — the Lantern Night set, the one character rig, and the rug-road board.
 *
 * Everything visual that is not a minigame stage lives here: the courtyard floor, the plaster wall and its
 * brass lanterns, the cushions, the modelled chibi character (instanced, 9 draw calls for 45 people), the
 * board of sixteen spaces and its two tokens. host-scene.js owns the games and the camera; this file owns the
 * look, so the frames in docs/design and the projector cannot drift apart.
 */
(function () {
  'use strict';
  const A = {};
  const C = {
    night: 0x0B1626, night2: 0x122438, wall: 0x2A3140, wallWarm: 0x3A3446,
    rug: 0x7A1D3B, rugDeep: 0x541228, brass: 0xF0AE4C, lamp: 0xFFD79A,
    cream: 0xFBF0DA, mint: 0x3ED9B0, coral: 0xFF7A5C, ink: 0x1A1018,
  };
  A.C = C;

  function tex(w, h, draw, rep) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(cv);
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  }
  A.tex = tex;

  /* ───────────────────────────────────────────── the woven floor */
  const rugTex = tex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#5E152C'; g.fillRect(0, 0, w, h);
    /* soft weave: vertical thread grain, then the diamond field */
    for (let x = 0; x < w; x += 6) { g.fillStyle = x % 12 ? 'rgba(255,215,154,.035)' : 'rgba(0,0,0,.05)'; g.fillRect(x, 0, 3, h); }
    for (let y = 90; y < h - 80; y += 108) for (let x = 60; x < w - 40; x += 108) {
      g.fillStyle = (y / 108 | 0) % 2 ? 'rgba(240,174,76,.13)' : 'rgba(251,240,218,.09)';
      g.beginPath(); g.moveTo(x, y - 34); g.lineTo(x + 34, y); g.lineTo(x, y + 34); g.lineTo(x - 34, y); g.closePath(); g.fill();
      g.fillStyle = 'rgba(251,240,218,.14)'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill();
    }
    /* two Sadu borders: cream ground with red and brass zigzag */
    for (const [y0, hh] of [[0, 74], [h - 74, 74]]) {
      g.fillStyle = '#FBF0DA'; g.fillRect(0, y0, w, hh);
      g.fillStyle = '#7A1D3B';
      for (let x = 0; x < w; x += 52) {
        g.beginPath(); g.moveTo(x, y0 + hh); g.lineTo(x + 26, y0 + 8); g.lineTo(x + 52, y0 + hh); g.closePath(); g.fill();
      }
      g.fillStyle = '#F0AE4C'; g.fillRect(0, y0 + (hh > 10 ? 30 : 0), w, 8);
      g.fillStyle = '#1B1020'; g.fillRect(0, y0 + 46, w, 4);
    }
  }, [1, 1]);

  const plasterTex = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#3A3446'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, Math.random() < .5 ? 'rgba(255,225,180,.06)' : 'rgba(10,8,16,.08)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, [4, 2]);

  /* mashrabiya: a lattice the lantern light can fall through */
  const latticeTex = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#1A1522'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6B4A2A'; g.lineWidth = 5;
    for (let i = -w; i < w * 2; i += 44) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
    }
  }, [6, 1]);

  /* ───────────────────────────────────────────── the set */
  A.buildSet = function (scene) {
    const root = new THREE.Group(); root.name = 'lantern-night'; scene.add(root);

    /* floor: two deep-pile rugs meeting at the arena, with a woven ring around the play area */
    const floor = new THREE.Mesh(new THREE.CircleGeometry(46, 96),
      new THREE.MeshStandardMaterial({ map: rugTex, color: 0xA9768A, roughness: .96, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0; floor.receiveShadow = true;
    root.add(floor);

    /* the arena ring: cream braid so the play area is a plate, not a hole */
    const ring = new THREE.Mesh(new THREE.RingGeometry(12.1, 12.75, 128),
      new THREE.MeshStandardMaterial({ color: 0xE8D9BE, roughness: .92, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.receiveShadow = true; root.add(ring);
    const field = new THREE.Mesh(new THREE.CircleGeometry(12.1, 96),
      new THREE.MeshStandardMaterial({ map: rugTex, color: 0xFFE6DE, roughness: 1 }));
    field.rotation.x = -Math.PI / 2; field.position.y = 0.012; field.receiveShadow = true; root.add(field);

    /* back wall: warm plaster with an arched niche and two mashrabiya screens, so the set has a far side */
    const wall = new THREE.Group(); wall.position.set(0, 0, -15.5); root.add(wall);
    const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(58, 13),
      new THREE.MeshStandardMaterial({ map: plasterTex, color: 0x9A8E92, roughness: .95 }));
    wallMesh.position.y = 6.5; wallMesh.receiveShadow = true; wall.add(wallMesh);

    /* niche: a brass-lit arch, the room's hearth */
    const archShape = new THREE.Shape();
    archShape.moveTo(-2.6, 0); archShape.lineTo(-2.6, 4.4);
    archShape.quadraticCurveTo(-2.6, 6.6, 0, 6.9); archShape.quadraticCurveTo(2.6, 6.6, 2.6, 4.4);
    archShape.lineTo(2.6, 0); archShape.closePath();
    const arch = new THREE.Mesh(new THREE.ShapeGeometry(archShape),
      new THREE.MeshStandardMaterial({ color: 0x2A1A26, roughness: 1, emissive: 0x3A1E12, emissiveIntensity: .5 }));
    arch.position.set(0, 0.02, 0.12); wall.add(arch);
    const archRim = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.09, 8, 40, Math.PI),
      new THREE.MeshStandardMaterial({ color: C.brass, metalness: .7, roughness: .35, emissive: 0x3A2408, emissiveIntensity: .6 }));
    archRim.position.set(0, 4.44, 0.16); wall.add(archRim);

    for (const sx of [-1, 1]) {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 4.6),
        new THREE.MeshStandardMaterial({ map: latticeTex, transparent: true, roughness: .9, color: 0xD9C7A6, opacity: .92 }));
      screen.position.set(sx * 8.6, 4.2, 0.1); wall.add(screen);
    }

    /* lantern strings: two sagging catenaries of brass lamps, the signature line of the set */
    const lamps = [];
    const glowTex = tex(128, 128, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      rg.addColorStop(0, 'rgba(255,214,154,1)'); rg.addColorStop(.32, 'rgba(255,180,90,.45)'); rg.addColorStop(1, 'rgba(255,160,70,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xB98A3E, metalness: .75, roughness: .34, emissive: 0xFFB45A, emissiveIntensity: 1.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xFFE7BE, emissive: 0xFFC877, emissiveIntensity: 1.15, transparent: true, opacity: .92, roughness: .3 });
    for (let s = 0; s < 2; s++) {
      const z0 = -13.6 + s * 1.6, count = 9;
      const pts = [];
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const x = -18 + t * 36;
        const y = 9.1 - Math.sin(t * Math.PI) * 1.5 - s * 0.8;
        pts.push(new THREE.Vector3(x, y, z0));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.022, 4, false),
        new THREE.MeshStandardMaterial({ color: 0x241B14, roughness: .8 }));
      root.add(wire);
      for (let i = 1; i < count - 1; i += 1) {
        const p = pts[i];
        const g2 = new THREE.Group(); g2.position.copy(p);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.7, 8), lampMat);
        const glass = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glassMat);
        glass.position.y = -0.46;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.3, 8), lampMat); cap.position.y = 0.42;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xFFC987, transparent: true, opacity: .9, depthWrite: false }));
        glow.scale.set(2.1, 2.1, 1); glow.position.y = -0.4;
        g2.add(body, glass, cap, glow);
        g2.userData.base = p.y; g2.userData.phase = i * 0.7 + s;
        root.add(g2); lamps.push(g2);
      }
    }

    /* cushions: a ring of low seats around the rug, two colours alternating */
    const seatGeo = new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.52, 0.5, 4, 12) : new THREE.SphereGeometry(0.62, 12, 10);
    const matA = new THREE.MeshStandardMaterial({ color: 0x2C4A54, roughness: .95 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x5B2036, roughness: .95 });
    for (let i = 0; i < 18; i++) {
      const a = -2.0 + (i / 17) * 4.0;
      const rad = 14.6;
      const x = Math.sin(a) * rad, z = Math.cos(a) * rad;
      const c = new THREE.Mesh(seatGeo, i % 2 ? matA : matB);
      c.rotation.z = Math.PI / 2; c.rotation.y = a;
      c.position.set(x, 0.46, z); c.scale.set(1, 1.35, 1);
      c.castShadow = true; c.receiveShadow = true; root.add(c);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 6, 18),
        new THREE.MeshStandardMaterial({ color: C.brass, metalness: .6, roughness: .4 }));
      trim.rotation.y = a; trim.position.set(x + Math.sin(a) * 0.55, 0.46, z + Math.cos(a) * 0.55); root.add(trim);
    }

    /* two low tables with dallahs, in front of the seats */
    for (const sx of [-1, 1]) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 24),
        new THREE.MeshStandardMaterial({ color: 0x6B3A22, roughness: .7 }));
      top.position.set(sx * 7.2, 0.62, -11.4); top.castShadow = true; top.receiveShadow = true; root.add(top);
      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6),
          new THREE.MeshStandardMaterial({ color: 0x4A2415, roughness: .8 }));
        const a = i * 2.1;
        leg.position.set(sx * 7.2 + Math.cos(a) * 1.1, 0.3, -11.4 + Math.sin(a) * 1.1); root.add(leg);
      }
      /* the dallah: body, neck, spout, lid and a crescent handle */
      const brassMat = new THREE.MeshStandardMaterial({ color: 0xC98F3C, metalness: .85, roughness: .28, emissive: 0x241505, emissiveIntensity: .5 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), brassMat);
      body.scale.set(1, 0.85, 1); body.position.set(sx * 7.2, 1.0, -11.4); body.castShadow = true; root.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.34, 10), brassMat);
      neck.position.set(sx * 7.2, 1.36, -11.4); root.add(neck);
      const lid = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.26, 10), brassMat);
      lid.position.set(sx * 7.2, 1.62, -11.4); root.add(lid);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.5, 8), brassMat);
      spout.position.set(sx * 7.2 + 0.42, 1.28, -11.4); spout.rotation.z = -0.9; root.add(spout);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 6, 16, Math.PI * 1.2), brassMat);
      handle.position.set(sx * 7.2 - 0.42, 1.2, -11.4); handle.rotation.y = 0.4; root.add(handle);
      /* finjans */
      for (let i = 0; i < 3; i++) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.12, 10),
          new THREE.MeshStandardMaterial({ color: 0xFBF0DA, roughness: .6 }));
        cup.position.set(sx * 7.2 - 0.8 + i * 0.42, 0.74, -10.9); root.add(cup);
      }
    }

    /* a brass floor lamp in each near corner, throwing the warm key light */
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xB98A3E, metalness: .8, roughness: .3 }));
      pole.position.set(sx * 13.6, 2.2, 4.2); pole.castShadow = true; root.add(pole);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.7, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xFFD79A, emissive: 0xFFB45A, emissiveIntensity: 1.4, side: THREE.DoubleSide }));
      shade.position.set(sx * 13.6, 4.5, 4.2); root.add(shade);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xFFC987, transparent: true, opacity: .55, depthWrite: false }));
      glow.scale.set(5, 5, 1); glow.position.set(sx * 13.6, 4.4, 4.2); root.add(glow);
    }

    root.userData.lamps = lamps;
    return root;
  };

  A.buildSky = function (scene) {
    const geo = new THREE.SphereGeometry(300, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x081120) }, mid: { value: new THREE.Color(0x14304A) }, warm: { value: new THREE.Color(0x7A4326) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top, mid, warm;
        void main(){
          float h = clamp(vP.y / 300.0 * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = mix(warm, mid, smoothstep(0.30, 0.55, h));
          c = mix(c, top, smoothstep(0.55, 0.95, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat); scene.add(sky);
    /* stars: one points cloud, warm white */
    const N = 420, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = Math.random() * Math.PI * 2, p = Math.acos(0.15 + Math.random() * 0.6), r = 270;
      pos[i * 3] = Math.sin(p) * Math.cos(t) * r;
      pos[i * 3 + 1] = Math.cos(p) * r;
      pos[i * 3 + 2] = Math.sin(p) * Math.sin(t) * r;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xFFE9C4, size: 1.5, sizeAttenuation: true, transparent: true, opacity: .75, depthWrite: false })));
  };

  A.buildLights = function (scene) {
    scene.add(new THREE.HemisphereLight(0xFFC98A, 0x1A1230, 0.34));
    const key = new THREE.DirectionalLight(0xFFD2A0, 0.72);
    key.position.set(-16, 20, -8); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -20; key.shadow.camera.right = 20; key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
    key.shadow.camera.near = 1; key.shadow.camera.far = 80; key.shadow.bias = -0.0012;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8FB6D8, 0.26); fill.position.set(12, 10, 12); scene.add(fill);
    const l1 = new THREE.PointLight(0xFFB45A, 2.3, 34, 2); l1.position.set(-8.5, 5.2, -6); scene.add(l1);
    const l2 = new THREE.PointLight(0xFFCB8A, 1.5, 30, 2); l2.position.set(8.5, 4.8, -4); scene.add(l2);
    const l3 = new THREE.PointLight(0xFF9A5A, 1.6, 22, 2); l3.position.set(0, 3.2, 6); scene.add(l3);
  };

  /* ───────────────────────────────────────────── the character */
  const FACE = tex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    /* eyes */
    for (const x of [88, 168]) {
      g.fillStyle = '#241407'; g.beginPath(); g.ellipse(x, 118, 13, 16, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 4, 112, 4.5, 0, 7); g.fill();
    }
    /* brows */
    g.strokeStyle = '#241407'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(70, 92); g.quadraticCurveTo(88, 80, 106, 90); g.stroke();
    g.beginPath(); g.moveTo(150, 90); g.quadraticCurveTo(168, 80, 186, 92); g.stroke();
    /* nose + smile */
    g.strokeStyle = '#B07A52'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(128, 126); g.lineTo(128, 146); g.stroke();
    g.strokeStyle = '#8A3A2A'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(100, 166); g.quadraticCurveTo(128, 192, 156, 166); g.stroke();
    /* cheeks */
    g.fillStyle = 'rgba(255,122,92,.20)';
    g.beginPath(); g.arc(74, 158, 18, 0, 7); g.fill();
    g.beginPath(); g.arc(182, 158, 18, 0, 7); g.fill();
  });

  const THOBE = new THREE.CylinderGeometry(0.34, 0.52, 1.06, 14, 1, false);
  THOBE.translate(0, 0.53, 0);
  const HEAD = new THREE.SphereGeometry(0.30, 18, 14);
  const FACE_PLANE = new THREE.PlaneGeometry(0.50, 0.50);
  const GHUTRA = new THREE.SphereGeometry(0.322, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.34);
  const IQAL = new THREE.TorusGeometry(0.305, 0.032, 6, 20);
  const SCARF = new THREE.TorusGeometry(0.40, 0.10, 8, 20);
  const ARM = new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.085, 0.36, 4, 8) : new THREE.CylinderGeometry(0.085, 0.085, 0.5, 8);
  const BLOB = new THREE.PlaneGeometry(1.15, 1.15);

  A.Rig = function (scene, max) {
    max = max || 64;
    const thobeMat = new THREE.MeshStandardMaterial({ roughness: .88, metalness: .02, color: 0xFFFFFF });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xE9C49B, roughness: .82 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0xFBF6EA, roughness: .9 });
    const faceMat = new THREE.MeshBasicMaterial({ map: FACE, transparent: true, depthWrite: false, depthTest: true });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xF0AE4C, metalness: .7, roughness: .32 });
    const scarfMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: .9 });
    const blobTex = tex(64, 64, (g, w, h) => {
      const rg = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      rg.addColorStop(0, 'rgba(8,6,4,.5)'); rg.addColorStop(.6, 'rgba(8,6,4,.18)'); rg.addColorStop(1, 'rgba(8,6,4,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
    });
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });

    const mk = (geo, mat, shadow) => {
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = !!shadow; m.frustumCulled = false;
      m.count = 0; scene.add(m); return m;
    };
    const parts = {
      thobe: mk(THOBE, thobeMat, true),
      armL: mk(ARM, skinMat, true), armR: mk(ARM, skinMat, true),
      head: mk(HEAD, skinMat, true), face: mk(FACE_PLANE, faceMat, false),
      ghutra: mk(GHUTRA, clothMat, true), iqal: mk(IQAL, brassMat, false),
      scarf: mk(SCARF, scarfMat, false), blob: mk(BLOB, blobMat, false),
    };
    parts.thobe.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    parts.scarf.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    parts.iqal.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    parts.iqal.instanceColor.setUsage(THREE.DynamicDrawUsage);
    parts.thobe.instanceColor.setUsage(THREE.DynamicDrawUsage);
    parts.scarf.instanceColor.setUsage(THREE.DynamicDrawUsage);

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
    const col = new THREE.Color();

    /* list: [{x,z,team,jump,lean,scale,out,walk}] */
    A.Rig.prototype.set = function (list, t, palette) {
      const n = Math.min(max, list.length);
      for (let i = 0; i < n; i++) {
        const c = list[i];
        const s = c.scale == null ? 1 : c.scale;
        const jump = c.jump || 0;
        const bob = Math.sin(t * 2.4 + i * 1.7) * 0.028;
        const lean = c.lean || 0;
        const out = c.out || 0;
        const drop = out * 0.45;
        const y = 0.02 + jump + bob - drop;
        e.set(lean, c.rot || 0, out * 1.4);
        q.setFromEuler(e);
        v.set(c.x, y, c.z); sc.set(s, s * (1 - out * .2), s); m4.compose(v, q, sc); parts.thobe.setMatrixAt(i, m4);
        /* head + face ride on top of the thobe */
        v.set(c.x + Math.sin(c.rot || 0) * 0.0, y + 1.10 * s, c.z);
        m4.compose(v, q, sc); parts.head.setMatrixAt(i, m4);
        v.set(c.x + Math.sin(c.rot || 0) * 0.315 * s, y + 1.10 * s, c.z + Math.cos(c.rot || 0) * 0.315 * s);
        m4.compose(v, q, sc); parts.face.setMatrixAt(i, m4);
        v.set(c.x, y + 1.155 * s, c.z); e.set(0, c.rot || 0, 0); q.setFromEuler(e);
        m4.compose(v, q, sc); parts.ghutra.setMatrixAt(i, m4);
        v.set(c.x, y + 1.30 * s, c.z); m4.compose(v, q, sc); parts.iqal.setMatrixAt(i, m4);
        /* the iqal takes the team colour: the head is the thing you see over a crowd */
        v.set(c.x, y + 1.00 * s, c.z); e.set(Math.PI / 2, 0, 0); q.setFromEuler(e);
        m4.compose(v, q, sc); parts.scarf.setMatrixAt(i, m4);
        /* arms swing with the walk, and both rise when the character jumps */
        const sw = (c.swing == null ? 0 : c.swing) + Math.sin(t * 6 + i) * (c.walk ? 0.35 : 0.06);
        for (const [key, sgn] of [['armL', -1], ['armR', 1]]) {
          e.set(sw * sgn * (c.walk ? 1 : .4) - jump * 1.2, Math.PI * 0.5 * 0, 0);
          q.setFromEuler(e);
          v.set(c.x + sgn * 0.36 * s * Math.cos(c.rot || 0), y + 0.86 * s, c.z + sgn * 0.36 * s * Math.sin(c.rot || 0));
          m4.compose(v, q, sc); parts[key].setMatrixAt(i, m4);
        }
        e.set(-Math.PI / 2, 0, 0); q.setFromEuler(e);
        v.set(c.x, 0.012, c.z); sc.set(s, s, s); m4.compose(v, q, sc); parts.blob.setMatrixAt(i, m4);
        const team = (palette && palette[c.team]) || { hex: '#3ED9B0' };
        col.set(team.hex); parts.thobe.setColorAt(i, col);
        col.set(team.hex).multiplyScalar(0.85); parts.scarf.setColorAt(i, col);
        col.set(team.hex); parts.iqal.setColorAt(i, col);
      }
      for (const k of Object.keys(parts)) {
        parts[k].count = n;
        parts[k].instanceMatrix.needsUpdate = true;
      }
      if (parts.thobe.instanceColor) parts.thobe.instanceColor.needsUpdate = true;
      if (parts.scarf.instanceColor) parts.scarf.instanceColor.needsUpdate = true;
      if (parts.iqal.instanceColor) parts.iqal.instanceColor.needsUpdate = true;
      return n;
    };
    A.Rig.prototype.parts = parts;
    return this;
  };

  /* ───────────────────────────────────────────── the board */
  /* points come from public/board-path.js so the picture and the rules agree */
  const BW = 17.4, BD = 10.4, BZ = -2.6;
  A.boardPoint = function (p) { return { x: (p.x - 0.5) * BW, z: (p.y - 0.5) * BD + BZ }; };

  A.buildBoard = function (scene, BOARD) {
    const g = new THREE.Group(); g.name = 'rug-road';
    /* the board rug: a smaller woven rug laid on the floor, with a brass rail */
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(BW + 1.6, BD + 1.6),
      new THREE.MeshStandardMaterial({ map: rugTex, color: 0xE0B6C0, roughness: .95 }));
    mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.05, BZ); mat.receiveShadow = true; g.add(mat);
    const rail = new THREE.Mesh(new THREE.RingGeometry(0, 0.01, 4), new THREE.MeshBasicMaterial({ visible: false }));
    g.add(rail);

    /* the route: one cream ribbon through all sixteen spaces, so the eye can trace the road without numbers */
    if (BOARD.POINTS && BOARD.POINTS.length > 1) {
      const pts = BOARD.POINTS.map(p => { const w = A.boardPoint(p); return new THREE.Vector3(w.x, 0.085, w.z); });
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.12);
      const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 0.16, 8, false),
        new THREE.MeshStandardMaterial({ color: 0xF6E3C0, emissive: 0xE9B36A, emissiveIntensity: .35, roughness: .8 }));
      ribbon.receiveShadow = true; g.add(ribbon);
      /* arrowheads: four brass chevrons along the way */
      for (let i = 1; i < pts.length - 1; i += 4) {
        const a = pts[i - 1], b2 = pts[i + 1];
        const dir = new THREE.Vector3().subVectors(b2, a).normalize();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 4),
          new THREE.MeshStandardMaterial({ color: 0xF0AE4C, metalness: .6, roughness: .35 }));
        cone.position.copy(pts[i]).setY(0.1);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        g.add(cone);
      }
    }

    /* the road bed: a quiet dark strip under every tile, so the rug's diamond weave never runs through the
     * track. Without this the sixteen tiles read as one pattern at 8-10 m instead of a countable road. */
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(BW + 1.0, BD + 1.0),
      new THREE.MeshStandardMaterial({ color: 0x2A1418, roughness: .95, metalness: 0 }));
    bed.rotation.x = -Math.PI / 2; bed.position.set(0, 0.075, BZ); bed.receiveShadow = true; g.add(bed);

    /* tiles */
    const tiles = [];
    BOARD.POINTS.forEach((p, i) => {
      const kind = BOARD.KINDS[i];
      const w = 2.12, h = 1.62;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, h),
        new THREE.MeshStandardMaterial({ color: 0xE4CFA6, roughness: .8 }));
      const wp = A.boardPoint(p);
      box.position.set(wp.x, 0.13, wp.z); box.receiveShadow = true; box.castShadow = true; g.add(box);
      const tone = { star: 0xF0AE4C, chaos: 0xF0836B, shop: 0xE0A24A, fork: 0x5FD7B8, event: 0xA08FE8, goal: 0xF7C766, coin: 0xF6E7C8 }[kind];
      box.material.color.setHex(tone);
      const faceCanvas = document.createElement('canvas'); faceCanvas.width = 320; faceCanvas.height = 240;
      const cg = faceCanvas.getContext('2d');
      cg.clearRect(0, 0, 320, 240);
      /* printed cream face with an ink border: the tile edge has to be visible from the back row, and the rug
         texture must not show through the tile itself */
      cg.fillStyle = '#F7E8CB';
      cg.beginPath(); const r = 26, W = 320, H = 240;
      cg.moveTo(r, 0); cg.arcTo(W, 0, W, H, r); cg.arcTo(W, H, 0, H, r); cg.arcTo(0, H, 0, 0, r); cg.arcTo(0, 0, W, 0, r);
      cg.closePath(); cg.fill();
      cg.lineWidth = 12; cg.strokeStyle = 'rgba(58,26,8,.85)'; cg.stroke();
      /* the number sits in an ink disc top-left: the one thing a viewer counts */
      cg.beginPath(); cg.arc(62, 62, 42, 0, Math.PI * 2); cg.fillStyle = '#3A1A08'; cg.fill();
      cg.fillStyle = '#FDF3DF'; cg.font = '800 54px Tajawal, sans-serif';
      cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(String(i + 1), 62, 66);
      cg.fillStyle = 'rgba(58,26,8,.92)'; cg.font = '800 108px Baloo, Tajawal, sans-serif';
      cg.fillText(BOARD.GLYPH[kind], 196, 128);
      const ft = new THREE.CanvasTexture(faceCanvas); if (THREE.sRGBEncoding) ft.encoding = THREE.sRGBEncoding;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.92), new THREE.MeshBasicMaterial({ map: ft, transparent: true }));
      face.rotation.x = -Math.PI / 2; face.position.set(wp.x, 0.215, wp.z); g.add(face);
      tiles.push({ mesh: box, face, p: wp, kind });
    });
    /* the finish gate on the last space: two brass posts and a lit bar, so space 16 reads as an arrival
       rather than one more tile with a scratch on it */
    const last = A.boardPoint(BOARD.POINTS[BOARD.POINTS.length - 1]);
    const gate = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xC9A03F, metalness: .8, roughness: .3 });
    [-0.72, 0.72].forEach(dx => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 1.15, 10), postMat);
      post.position.set(last.x + dx, 0.6, last.z - 1.55); post.castShadow = true; gate.add(post);
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.1, 0.1), postMat);
    bar.position.set(last.x, 1.16, last.z - 1.55); gate.add(bar);
    [-0.5, 0, 0.5].forEach(dx => {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xFFC46E }));
      lamp.position.set(last.x + dx, 1.04, last.z - 1.55); gate.add(lamp);
      const gl = new THREE.PointLight(0xFFB45A, 0.9, 4); gl.position.set(last.x + dx, 1.02, last.z - 1.55); gate.add(gl);
    });
    g.add(gate);

    scene.add(g);
    return { g, tiles };
  };

  A.buildPodium = function (scene) {
    const g = new THREE.Group(); g.name = 'podium';
    for (const [i, x] of [[0, 3.6], [1, -3.6]]) {
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.9, 20),
        new THREE.MeshStandardMaterial({ color: 0x6B3A22, roughness: .7 }));
      plinth.position.set(x, 0.45, 0.6); plinth.castShadow = true; plinth.receiveShadow = true; g.add(plinth);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 6, 28),
        new THREE.MeshStandardMaterial({ color: 0xF0AE4C, metalness: .8, roughness: .3 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.92, 0.6); g.add(ring);
    }
    scene.add(g);
    return g;
  };

  A.animate = function (env, t) {
    if (!env) return;
    const lamps = env.userData.lamps || [];
    for (const l of lamps) {
      l.rotation.z = Math.sin(t * 0.9 + l.userData.phase) * 0.05;
      l.position.y = l.userData.base + Math.sin(t * 0.7 + l.userData.phase) * 0.02;
    }
  };

  window.PARTY_ART = A;
})();
