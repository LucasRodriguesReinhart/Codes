// Stateless particle effects: every burst is evaluated analytically from its start time.
import * as THREE from 'three';
import { rng, clamp, ease } from './util.js';

const glowTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    t = new THREE.CanvasTexture(c); return t;
  };
})();

const dustTex = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const rr = rng(99);
    for (let i = 0; i < 6; i++) {
      const x = 40 + rr() * 48, y = 40 + rr() * 48, r = 22 + rr() * 20;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    t = new THREE.CanvasTexture(c); return t;
  };
})();

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), UP = new THREE.Vector3(0, 0, 1), tmpC = new THREE.Color();

export class FX {
  constructor(scene, { maxSparks = 900, maxChunks = 500, maxGems = 160, maxSprites = 60, maxRings = 10 } = {}) {
    this.scene = scene; this.max = { s: maxSparks, c: maxChunks, g: maxGems }; this.bursts = []; this.rings = []; this.flares = [];
    const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
    this.sparks = new THREE.InstancedMesh(sparkGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), maxSparks);
    const chunkGeo = new THREE.IcosahedronGeometry(1, 0);
    this.chunks = new THREE.InstancedMesh(chunkGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.8 }), maxChunks);
    this.chunks.castShadow = true;
    const gemMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.2, metalness: 0.2 });
    gemMat.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance += vColor.rgb*0.75;\n#endif'); };
    this.gems = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), gemMat, maxGems);
    for (const m of [this.sparks, this.chunks, this.gems]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0;
      m.setColorAt(0, tmpC.set('#fff')); scene.add(m);
    }
    this.spritePool = [];
    for (let i = 0; i < maxSprites; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      s.visible = false; scene.add(s); this.spritePool.push(s);
    }
    this.dustPool = [];
    for (let i = 0; i < 80; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex(), depthWrite: false, transparent: true }));
      s.visible = false; scene.add(s); this.dustPool.push(s);
    }
    this.ringPool = [];
    for (let i = 0; i < maxRings; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 72), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false; scene.add(m); this.ringPool.push(m);
    }
  }

  // kind: 'spark' | 'chunk' | 'gem' | 'dust'
  burst(o) {
    const b = { kind: 'spark', t0: 0, origin: new THREE.Vector3(), count: 20, speed: [4, 9], dir: new THREE.Vector3(0, 1, 0), spread: 1, gravity: -14,
      life: [0.25, 0.6], size: [0.05, 0.12], colors: ['#ffffff'], seed: 1, ground: 0, drag: 0, intensity: 3, ...o };
    const r = rng(b.seed);
    b.parts = Array.from({ length: b.count }, () => {
      const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(b.spread).add(b.dir).normalize();
      const sp = b.speed[0] + r() * (b.speed[1] - b.speed[0]);
      return { v: d.multiplyScalar(sp), life: b.life[0] + r() * (b.life[1] - b.life[0]), size: b.size[0] + r() * (b.size[1] - b.size[0]),
        color: new THREE.Color(b.colors[Math.floor(r() * b.colors.length)]), rot: [r() * 6, r() * 6, r() * 6], spin: (r() - 0.5) * 14, delay: (b.stagger || 0) * r() };
    });
    this.bursts.push(b);
    return b;
  }
  ring(o) { this.rings.push({ t0: 0, pos: new THREE.Vector3(), radius: 6, life: 0.5, color: '#ffffff', normal: new THREE.Vector3(0, 1, 0), intensity: 2.5, ...o }); }
  flare(o) { this.flares.push({ t0: 0, pos: new THREE.Vector3(), size: 4, life: 0.25, color: '#ffffff', intensity: 2, attack: 0.02, ...o }); }

  update(t) {
    let ns = 0, nc = 0, ng = 0, nsp = 0, nd = 0;
    for (const b of this.bursts) {
      const dt0 = t - b.t0;
      if (dt0 < 0 || dt0 > b.life[1] + 0.5) continue;
      for (const p of b.parts) {
        const dt = dt0 - p.delay; if (dt < 0 || dt > p.life) continue;
        const k = dt / p.life;
        const damp = b.drag ? (1 - Math.exp(-b.drag * dt)) / b.drag : dt;
        tmpP.copy(b.origin).addScaledVector(p.v, damp); tmpP.y += 0.5 * b.gravity * dt * dt;
        if (b.kind === 'chunk' && tmpP.y < b.ground + p.size * 0.6) tmpP.y = b.ground + p.size * 0.6;
        if (b.kind === 'spark') {
          if (ns >= this.max.s) continue;
          const vel = p.v.clone(); vel.y += b.gravity * dt;
          tmpQ.setFromUnitVectors(UP, vel.clone().normalize());
          const len = clamp(vel.length() * 0.035, 0.08, 0.9) * (1 - k);
          tmpS.set(p.size * 10 * (1 - k * 0.6), p.size * 10 * (1 - k * 0.6), len * 1.0);
          tmpM.compose(tmpP, tmpQ, tmpS); this.sparks.setMatrixAt(ns, tmpM);
          this.sparks.setColorAt(ns, tmpC.copy(p.color).multiplyScalar(b.intensity * (1 - k * 0.7))); ns++;
        } else if (b.kind === 'chunk') {
          if (nc >= this.max.c) continue;
          tmpQ.setFromEuler(new THREE.Euler(p.rot[0] + p.spin * dt, p.rot[1] + p.spin * dt * 0.7, p.rot[2]));
          const s = p.size * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1);
          tmpS.set(s, s * 0.8, s); tmpM.compose(tmpP, tmpQ, tmpS); this.chunks.setMatrixAt(nc, tmpM); this.chunks.setColorAt(nc, p.color); nc++;
        } else if (b.kind === 'gem') {
          if (ng >= this.max.g) continue;
          tmpQ.setFromEuler(new THREE.Euler(0, p.rot[1] + dt * 6, 0.3));
          const s = p.size * ease.outBack(clamp(dt / 0.15)) * (k > 0.85 ? 1 - (k - 0.85) / 0.15 : 1);
          tmpS.set(s * 0.7, s, s * 0.7); tmpM.compose(tmpP, tmpQ, tmpS); this.gems.setMatrixAt(ng, tmpM); this.gems.setColorAt(ng, p.color); ng++;
        } else if (b.kind === 'dust' && nd < this.dustPool.length) {
          const s = this.dustPool[nd++]; s.visible = true; s.position.copy(tmpP);
          s.scale.setScalar(p.size * (1 + k * 2.5)); s.material.color.copy(p.color); s.material.opacity = (1 - k) * 0.32;
        }
      }
    }
    this.sparks.count = ns; this.chunks.count = nc; this.gems.count = ng;
    for (const m of [this.sparks, this.chunks, this.gems]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    for (; nd < this.dustPool.length; nd++) this.dustPool[nd].visible = false;

    for (const f of this.flares) {
      const dt = t - f.t0; if (dt < 0 || dt > f.life + f.attack || nsp >= this.spritePool.length) continue;
      const s = this.spritePool[nsp++], k = dt < f.attack ? dt / f.attack : 1 - (dt - f.attack) / f.life;
      s.visible = true; s.position.copy(f.pos); s.scale.setScalar(f.size * (0.6 + 0.4 * k));
      s.material.color.set(f.color).multiplyScalar(f.intensity * k);
    }
    for (; nsp < this.spritePool.length; nsp++) this.spritePool[nsp].visible = false;

    let nr = 0;
    for (const r of this.rings) {
      const dt = t - r.t0; if (dt < 0 || dt > r.life || nr >= this.ringPool.length) continue;
      const m = this.ringPool[nr++], k = dt / r.life;
      m.visible = true; m.position.copy(r.pos);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), r.normal);
      m.scale.setScalar(0.2 + r.radius * ease.outCubic(k));
      m.material.color.set(r.color).multiplyScalar(r.intensity * (1 - k));
      m.material.opacity = 1 - k;
    }
    for (; nr < this.ringPool.length; nr++) this.ringPool[nr].visible = false;
  }
}

// Vertical additive light pillar (used for rare spawns).
export function lightPillar(color = '#ffffff', height = 40, radius = 1.5) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(color) }, k: { value: 1 }, time: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 col; uniform float k,time; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float c=pow(abs(dot(vN,vV)),2.); float f=pow(1.-vUv.y,1.5); float a=c*f*k*(0.8+0.2*sin(vUv.y*30.-time*8.)); gl_FragColor=vec4(col*a*1.6,a); }`,
  });
  const geo = new THREE.CylinderGeometry(radius, radius * 1.4, height, 24, 1, true); geo.translate(0, height / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.userData.set = (time, k) => { mat.uniforms.time.value = time; mat.uniforms.k.value = k; m.visible = k > 0.01; };
  return m;
}
