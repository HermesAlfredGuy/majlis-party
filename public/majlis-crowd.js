/* majlis-crowd.js — one character everywhere.
 *
 * The party used to draw its on-floor players as four instanced primitives (capsule body, sphere head,
 * ghutra dome, shadow blob) while the finale stood fully modelled mini-characters on the podium. Two art
 * languages in one product, and the projector — the surface forty people watch — had the cheap one.
 *
 * This module takes the same CC0 Kenney mini-character the podium uses, merges it into two geometries
 * (the clothes, which are tinted per team through instanceColor, and everything else, which keeps its
 * painted colours as baked vertex colours), and instances them. One draw call per team part, so a 45-phone
 * room is still cheap, and the player the crowd watches is the character the winners stand as.
 */
(function () {
  const MAXC = 64;
  const URL = '/assets/chars/char-a.glb';
  const TINT = /(body|torso|cloth|shirt|robe|thobe|arm|leg|hand|foot|shoe|sandal|skin)/i;

  function mergeParts(root, THREE) {
    const tint = [], fixed = [];
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      const name = ((o.name || '') + ' ' + (mat && mat.name || '') + ' ' + ((o.parent && o.parent.name) || ''));
      const entry = { g, color: (mat && mat.color) ? mat.color.clone() : null };
      /* the head keeps its painted face; the clothes are the part that belongs to a team */
      if (TINT.test(name) && !/head|face|hair|eye/i.test(name)) tint.push(entry); else fixed.push(entry);
    });
    return { tint, fixed };
  }

  function concat(list, THREE, withColor) {
    if (!list.length) return null;
    let vCount = 0;
    for (const e of list) vCount += e.g.attributes.position.count;
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), col = withColor ? new Float32Array(vCount * 3) : null;
    let off = 0;
    for (const e of list) {
      const n = e.g.attributes.position.count;
      pos.set(e.g.attributes.position.array, off * 3);
      if (e.g.attributes.normal) nor.set(e.g.attributes.normal.array, off * 3);
      if (col) {
        const c = e.color || new THREE.Color(0xffffff);
        for (let i = 0; i < n; i++) { col[(off + i) * 3] = c.r; col[(off + i) * 3 + 1] = c.g; col[(off + i) * 3 + 2] = c.b; }
      }
      off += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingBox();
    return out;
  }

  function create(THREE, scene, opts) {
    const o = opts || {};
    const state = { ready: false, chars: new Map(), tintMesh: null, fixedMesh: null, shadow: null, height: 1.75 };
    const loader = (typeof THREE.GLTFLoader === 'function') ? new THREE.GLTFLoader() : null;
    if (!loader) return state;

    const shadowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const rg = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      rg.addColorStop(0, 'rgba(16,10,3,.6)'); rg.addColorStop(.65, 'rgba(16,10,3,.22)'); rg.addColorStop(1, 'rgba(16,10,3,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); return t;
    })();

    loader.load(URL, gl => {
      const parts = mergeParts(gl.scene, THREE);
      const tintGeo = concat(parts.tint, THREE, false);
      const fixedGeo = concat(parts.fixed, THREE, true);
      /* one character height for the whole party: 1.75 m before the per-player scale */
      const bb = new THREE.Box3();
      if (tintGeo) { tintGeo.computeBoundingBox(); bb.union(tintGeo.boundingBox); }
      if (fixedGeo) { fixedGeo.computeBoundingBox(); bb.union(fixedGeo.boundingBox); }
      const size = new THREE.Vector3(); bb.getSize(size);
      state.height = size.y || 1;

      const tintMat = new THREE.MeshStandardMaterial({ roughness: .82, metalness: .02, color: 0xffffff });
      const fixedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88, metalness: .02 });
      if (tintGeo) {
        state.tintMesh = new THREE.InstancedMesh(tintGeo, tintMat, MAXC);
        state.tintMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        state.tintMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXC * 3), 3);
        state.tintMesh.castShadow = true; state.tintMesh.count = 0;
      }
      if (fixedGeo) {
        state.fixedMesh = new THREE.InstancedMesh(fixedGeo, fixedMat, MAXC);
        state.fixedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        state.fixedMesh.castShadow = true; state.fixedMesh.count = 0;
      }
      state.shadow = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1.15, 1.15),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
        MAXC
      );
      state.shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      state.shadow.count = 0;
      for (const m of [state.tintMesh, state.fixedMesh, state.shadow]) if (m) scene.add(m);
      state.ready = true;
      if (o.onReady) o.onReady();
    }, undefined, e => console.warn('majlis-crowd: character not loaded, keeping the primitives', e && e.message));

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(),
      sc = new THREE.Vector3(), eul = new THREE.Euler(), col = new THREE.Color(), colB = new THREE.Color();

    state.update = function (list, dt, mode) {
      if (!state.ready) return 0;
      const seen = new Set();
      const teamHex = (t) => (o.teamHex ? o.teamHex(t) : 0xffffff);
      const teamDark = (t) => (o.teamDark ? o.teamDark(t) : 0x333333);
      list.forEach((ch, idx) => {
        if (idx >= MAXC) return;
        seen.add(ch.id);
        let c = state.chars.get(ch.id);
        if (!c) { c = { x: ch.x || 0, z: ch.z || 0, rot: 0, out: 0, born: performance.now(), seed: Math.random() * 10 }; state.chars.set(ch.id, c); }
        let tx = ch.x || 0, tz = ch.z || 0;
        if (mode === 'arrows') {
          const n = list.length, per = Math.ceil(Math.sqrt(n));
          tx = ((idx % per) - (per - 1) / 2) * 1.15;
          tz = (Math.floor(idx / per) - 1.2) * 1.15;
        }
        const k = 1 - Math.pow(0.001, dt);
        c.x += (tx - c.x) * k; c.z += (tz - c.z) * k;
        if (ch.out) c.out = Math.min(1, (c.out || 0) + dt * 2.6); else c.out = Math.max(0, (c.out || 0) - dt * 3);
        const jt = ch.jump != null && ch.jump >= 0 ? ch.jump : -1;
        const jumpY = jt >= 0 && jt < 0.66 ? Math.sin((jt / 0.66) * Math.PI) * 1.05 : 0;
        const bob = Math.sin(performance.now() / 420 + c.seed) * 0.03;
        const grow = c.born ? Math.min(1, (performance.now() - c.born) / 320) : 1;
        const scale = ((o.height || 1.55) / (state.height || 1)) * grow * (ch.current ? 1.06 : 1) * (1 - c.out * 0.2);
        const lean = ch.vx || ch.vz ? Math.atan2(ch.vx || 0, ch.vz || 0) : 0;
        c.rot += ((lean || 0) - c.rot) * Math.min(1, dt * 8);
        eul.set(c.out * 1.4, c.rot, 0); q.setFromEuler(eul);
        v3.set(c.x, jumpY + bob, c.z);
        sc.set(scale, scale, scale);
        m4.compose(v3, q, sc);
        if (state.tintMesh) state.tintMesh.setMatrixAt(idx, m4);
        if (state.fixedMesh) state.fixedMesh.setMatrixAt(idx, m4);
        const t = (o.teamOf ? o.teamOf(ch.team) : { hex: teamHex(ch.team), dark: teamDark(ch.team) }) || {};
        col.set(t.hex != null ? t.hex : 0xffffff);
        colB.set(t.dark != null ? t.dark : 0x222222);
        col.lerp(colB, 0.28 + c.out * 0.4);
        if (state.tintMesh && state.tintMesh.instanceColor) state.tintMesh.setColorAt(idx, col);
        eul.set(-Math.PI / 2, 0, 0); q.setFromEuler(eul);
        v3.set(c.x, 0.02, c.z); sc.set(scale, scale, scale); m4.compose(v3, q, sc);
        if (state.shadow) state.shadow.setMatrixAt(idx, m4);
      });
      const n = Math.min(MAXC, list.length);
      if (state.tintMesh) { state.tintMesh.count = n; state.tintMesh.instanceMatrix.needsUpdate = true; if (state.tintMesh.instanceColor) state.tintMesh.instanceColor.needsUpdate = true; }
      if (state.fixedMesh) { state.fixedMesh.count = n; state.fixedMesh.instanceMatrix.needsUpdate = true; }
      if (state.shadow) { state.shadow.count = n; state.shadow.instanceMatrix.needsUpdate = true; }
      for (const id of Array.from(state.chars.keys())) if (!seen.has(id)) state.chars.delete(id);
      return n;
    };
    return state;
  }

  window.MAJLIS_CROWD = { create };
})();
