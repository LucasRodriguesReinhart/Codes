// Blocky Roblox-style avatar, pickaxes by tier, anime Units, aura and energy beam.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, ease, noise1 } from './util.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
const rbox = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 3, r);

function faceTexture({ iris = '#2a9dff', glow = false, mouth = 'smile' } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const eye = (x) => {
    g.save(); g.translate(x, 118);
    g.fillStyle = '#1a1020'; g.beginPath(); g.ellipse(0, 0, 30, 40, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = iris; g.beginPath(); g.ellipse(0, 6, 22, 30, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = glow ? '#fffbe0' : '#0d0a14'; g.beginPath(); g.ellipse(0, 10, 11, 15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-9, -12, 9, 11, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(8, 18, 4, 0, Math.PI * 2); g.fill();
    g.restore();
    // brow
    g.strokeStyle = '#1a1020'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - 30, 66 + (x < 128 ? 4 : -4) * 0); g.lineTo(x + 26, x < 128 ? 74 : 62); g.stroke();
  };
  eye(82); eye(174);
  g.strokeStyle = '#3a1a20'; g.lineWidth = 8; g.lineCap = 'round';
  g.beginPath();
  if (mouth === 'smile') g.arc(128, 178, 20, 0.15 * Math.PI, 0.85 * Math.PI);
  else { g.moveTo(108, 190); g.lineTo(150, 186); }
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function spikyHair(color, count, size, emissive = 0) {
  const g = new THREE.Group();
  const m = std(color, { flatShading: true, roughness: 0.5, emissive: emissive ? color : '#000', emissiveIntensity: emissive });
  const cap = new THREE.Mesh(rbox(1.32 * size, 0.5 * size, 1.32 * size, 0.15), m);
  cap.position.y = 0.55 * size; g.add(cap);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const len = (0.9 + (i % 3) * 0.25) * size;
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.28 * size, len, 5), m);
    const dir = new THREE.Vector3(Math.cos(a) * 0.9, 0.85, Math.sin(a) * 0.9 - 0.35).normalize();
    s.position.set(Math.cos(a) * 0.45 * size, 0.7 * size, Math.sin(a) * 0.45 * size - 0.1 * size).add(dir.clone().multiplyScalar(len * 0.35));
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(s);
  }
  // front bangs
  for (let i = -1; i <= 1; i++) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.22 * size, 0.7 * size, 4), m);
    s.position.set(i * 0.38 * size, 0.42 * size, 0.55 * size); s.rotation.x = Math.PI * 0.85; s.rotation.z = i * 0.3;
    g.add(s);
  }
  return g;
}

// ---------- Pickaxes ----------
export const PICKAXES = {
  wood:     { handle: '#8a5a32', head: '#9a9ca3', em: 0, size: 0.8, rarity: 'common' },
  iron:     { handle: '#4a3a30', head: '#5fa8ff', em: 0.25, size: 0.95, rarity: 'rare' },
  crystal:  { handle: '#2d2340', head: '#c056ff', em: 0.9, size: 1.1, rarity: 'epic' },
  gold:     { handle: '#3a2410', head: '#ffc21a', em: 0.9, size: 1.25, rarity: 'legendary' },
  mythic:   { handle: '#140c22', head: 'rainbow', em: 2.2, size: 1.5, rarity: 'mythic' },
};

export function makePickaxe(tier, rainbowMat) {
  const c = PICKAXES[tier], g = new THREE.Group(), s = c.size;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6 * s, 8), std(c.handle, { roughness: 0.7 }));
  handle.rotation.x = Math.PI / 2; handle.position.z = 1.1 * s; g.add(handle);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), std('#2a2a2a'));
  grip.rotation.x = Math.PI / 2; grip.position.z = 0.15; g.add(grip);
  const headMat = c.head === 'rainbow' ? rainbowMat : std(c.head, { metalness: 0.6, roughness: 0.3, emissive: c.head, emissiveIntensity: c.em, flatShading: true });
  // Straight head with two spikes in the swing plane: reads clearly at phone size.
  const bar = new THREE.Mesh(rbox(0.32 * s, 1.7 * s, 0.34 * s, 0.06), headMat);
  bar.position.z = 2.35 * s; g.add(bar);
  for (const sy of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.17 * s, 0.6 * s, 4), headMat);
    tip.position.set(0, sy * 1.1 * s, 2.35 * s); tip.rotation.x = sy > 0 ? 0 : Math.PI; tip.rotation.y = Math.PI / 4;
    g.add(tip);
  }
  const collar = new THREE.Mesh(rbox(0.45 * s, 0.45 * s, 0.45 * s, 0.06), std(c.handle === '#140c22' ? '#ffffff' : '#3a3a3a', { metalness: 0.7, roughness: 0.3, emissive: c.head === 'rainbow' ? '#ffffff' : '#000', emissiveIntensity: c.head === 'rainbow' ? 1.5 : 0 }));
  collar.position.z = 2.35 * s; g.add(collar);
  if (c.em > 0.5) {
    const l = new THREE.PointLight(c.head === 'rainbow' ? '#ff5cf0' : c.head, c.em * 3, 5, 2); l.position.z = 2.3 * s; g.add(l);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.tipLocal = new THREE.Vector3(0, -1.35 * s, 2.35 * s); // the striking point
  g.userData.cfg = c;
  return g;
}

// ---------- Avatar ----------
export function makeAvatar({ shirt = '#3352e0', pants = '#1d2033', skin = '#ffd7b0', hair = '#f4f4f8', accent = '#3ff0d0', iris = '#2a9dff', scale = 0.55 } = {}) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.scale.setScalar(scale);
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const torso = mk(rbox(2, 2, 1, 0.15), std(shirt), 0, 3, 0); body.add(torso);
  const stripe = mk(rbox(2.04, 0.3, 1.04, 0.05), std(accent, { emissive: accent, emissiveIntensity: 0.4 }), 0, 2.3, 0); body.add(stripe);
  const headPivot = new THREE.Group(); headPivot.position.set(0, 4, 0); body.add(headPivot);
  const head = mk(rbox(1.25, 1.25, 1.25, 0.25), std(skin), 0, 0.68, 0); headPivot.add(head);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshStandardMaterial({ map: faceTexture({ iris }), transparent: true, roughness: 0.6 }));
  face.position.set(0, 0.62, 0.635); headPivot.add(face);
  const hairG = spikyHair(hair, 9, 1); hairG.position.y = 0.55; headPivot.add(hairG);
  const limb = (x, y, color) => { const p = new THREE.Group(); p.position.set(x, y, 0); body.add(p); p.add(mk(rbox(0.95, 2, 0.95, 0.15), std(color), 0, -1, 0)); return p; };
  const armL = limb(-1.5, 4, shirt), armR = limb(1.5, 4, shirt);
  armL.add(mk(rbox(0.97, 0.5, 0.97, 0.12), std(skin), 0, -1.78, 0)); armR.add(mk(rbox(0.97, 0.5, 0.97, 0.12), std(skin), 0, -1.78, 0));
  const legL = limb(-0.5, 2, pants), legR = limb(0.5, 2, pants);
  const hand = new THREE.Group(); hand.position.set(0, -1.85, 0); armR.add(hand);

  let tool = null;
  const api = {
    root, body, headPivot, armL, armR, legL, legR, hand, scale,
    setTool(t) { if (tool) hand.remove(tool); tool = t; if (t) hand.add(t); },
    get tool() { return tool; },
    toolTipWorld() { if (!tool) return null; root.updateMatrixWorld(true); return tool.userData.tipLocal.clone().applyMatrix4(tool.matrixWorld); },
    // swing: phase relative to contact time (seconds, negative before contact). idle: time for breathing.
    pose({ sinceHit = 10, untilHit = 10, time = 0, power = 1, walk = 0, charge = 0, raise = 0 }) {
      // Arm angle: rest (-0.5) -> windup up/back (-3.0) -> contact (-1.2) -> follow (-0.6)
      let a = -0.45 + Math.sin(time * 2.2) * 0.04, lean = 0, twist = 0;
      const wind = 0.22 / Math.max(0.6, power * 0.9 + 0.2);
      if (untilHit < wind + 0.12 && untilHit >= 0) {
        if (untilHit > 0.06) { const u = ease.outCubic(clamp(1 - (untilHit - 0.06) / wind)); a = -0.45 + (-2.85 + 0.45) * u; lean = -0.12 * u; twist = 0.15 * u; }
        else { const u = ease.inQuad(1 - untilHit / 0.06); a = -2.85 + (2.85 - 1.05) * u; lean = -0.12 + 0.3 * u; twist = 0.15 - 0.25 * u; }
      } else if (sinceHit >= 0 && sinceHit < 0.35) {
        const u = ease.outCubic(clamp(sinceHit / 0.35)); a = -1.05 + (1.05 - 0.45) * u; lean = 0.18 * (1 - u); twist = -0.1 * (1 - u);
      }
      if (charge > 0) { a = -0.45 + (-3.0 + 0.45) * ease.outCubic(charge); lean = -0.15 * charge; }
      if (raise > 0) { a = a + (-3.0 - a) * raise; lean = -0.08 * raise; }
      armR.rotation.set(a, 0, -0.08 - 0.12 * raise);
      hand.rotation.x = -Math.PI / 2 * raise;
      armL.rotation.set(-0.3 + lean * 0.5 + (charge ? -0.6 * charge : 0), 0, 0.15);
      body.rotation.set(lean, twist, 0);
      body.position.y = Math.sin(time * 2.2) * 0.02 - Math.abs(lean) * 0.4;
      headPivot.rotation.x = -lean * 0.6;
      const w = Math.sin(time * 9) * walk * 0.7;
      legL.rotation.x = w; legR.rotation.x = -w;
      if (walk) { armL.rotation.x = -w; }
    },
  };
  return api;
}

// ---------- Aura: wispy flame shell + rising embers (both additive) ----------
export function makeAura(color = '#ffcc33', height = 3, width = 1.3) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, col: { value: new THREE.Color(color) }, k: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float time,k; uniform vec3 col; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      float h(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){ float fr = pow(1.-abs(dot(vN,vV)),2.4);
        float fl = n(vec2(vUv.x*18., vUv.y*4. - time*7.))*0.65 + n(vec2(vUv.x*36.+3., vUv.y*8. - time*11.))*0.35;
        float tongues = smoothstep(0.55, 0.92, fl + (1.-vUv.y)*0.2);
        float a = fr * tongues * smoothstep(0.98,0.5,vUv.y) * smoothstep(0.0,0.12,vUv.y) * k;
        a *= 0.75; gl_FragColor = vec4(mix(col, vec3(1.), tongues*0.35)*a*1.8, a); }`,
  });
  const geo = new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.85); geo.scale(width, height * 0.55, width * 0.8); geo.translate(0, height * 0.42, 0);
  const shell = new THREE.Mesh(geo, mat); g.add(shell);
  // embers
  const N = 70, pos = new Float32Array(N * 3), seeds = [];
  for (let i = 0; i < N; i++) seeds.push([Math.sin(i * 12.9898) * 0.5 + 0.5, Math.sin(i * 78.233) * 0.5 + 0.5, Math.sin(i * 39.425) * 0.5 + 0.5]);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  g.add(pts);
  const light = new THREE.PointLight(color, 0, 8, 2); light.position.y = height * 0.5; g.add(light);
  g.userData.update = (time, k) => {
    mat.uniforms.time.value = time; mat.uniforms.k.value = k;
    g.visible = k > 0.01; light.intensity = 8 * k * (1 + 0.2 * noise1(time * 12));
    for (let i = 0; i < N; i++) {
      const [a, b, c] = seeds[i], ph = (time * (0.6 + c * 0.8) + a) % 1, ang = b * Math.PI * 2 + time * 0.5;
      const r = width * (0.55 + 0.45 * c) * (1 - ph * 0.5);
      pos.set([Math.cos(ang) * r, ph * height * 1.15, Math.sin(ang) * r * 0.8], i * 3);
    }
    pg.attributes.position.needsUpdate = true;
    pts.material.opacity = k;
  };
  return g;
}

// ---------- Units (anime companions) ----------
export function makeUnit(kind) {
  const mythic = kind === 'mythic';
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const gi = mythic ? '#ff7a12' : '#5b8a5a', skin = '#ffd7b0';
  body.add(mk(rbox(1.3, 1.2, 0.8, 0.15), std(gi), 0, 1.35, 0));
  body.add(mk(rbox(1.34, 0.22, 0.84, 0.05), std(mythic ? '#1d3fd6' : '#3b2a1e'), 0, 0.95, 0));
  const legs = [-0.33, 0.33].map((x) => body.add(mk(rbox(0.55, 0.8, 0.6, 0.12), std(mythic ? '#1d3fd6' : '#4a4038'), x, 0.42, 0)));
  const headPivot = new THREE.Group(); headPivot.position.y = 2.0; body.add(headPivot);
  headPivot.add(mk(rbox(1.5, 1.4, 1.35, 0.3), std(skin), 0, 0.7, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.35), new THREE.MeshStandardMaterial({ map: faceTexture({ iris: mythic ? '#29e6ff' : '#5a3a20', glow: mythic, mouth: mythic ? 'flat' : 'smile' }), transparent: true, emissive: mythic ? '#ffffff' : '#000', emissiveIntensity: mythic ? 0.15 : 0, emissiveMap: null }));
  face.position.set(0, 0.68, 0.685); headPivot.add(face);
  const hair = spikyHair(mythic ? '#ffd21a' : '#3a2a1e', mythic ? 13 : 7, mythic ? 1.45 : 1.1, mythic ? 0.9 : 0);
  hair.position.y = 0.6; headPivot.add(hair);
  const arm = (x) => { const p = new THREE.Group(); p.position.set(x, 1.85, 0); body.add(p); p.add(mk(rbox(0.45, 1.0, 0.45, 0.1), std(gi), 0, -0.45, 0)); p.add(mk(rbox(0.5, 0.35, 0.5, 0.1), std(skin), 0, -1.0, 0)); return p; };
  const armL = arm(-0.88), armR = arm(0.88);
  const aura = mythic ? makeAura('#ffc21a', 4.2, 1.6) : null;
  if (aura) root.add(aura);
  const api = {
    root, body, armL, armR, headPivot, aura, mythic,
    handWorld(side = 1) { const a = side > 0 ? armR : armL; root.updateMatrixWorld(true); return new THREE.Vector3(0, -1.0, 0).applyMatrix4(a.matrixWorld); },
    // punch: time since the punch contact (negative = before)
    pose({ time, untilHit = 10, sinceHit = 10, side = 1, auraK = 1, blast = 0 }) {
      body.position.y = 0.25 + Math.sin(time * 3) * 0.08;
      let ext = 0;
      if (untilHit >= 0 && untilHit < 0.12) ext = ease.inQuad(1 - untilHit / 0.12);
      else if (sinceHit >= 0 && sinceHit < 0.25) ext = 1 - ease.outCubic(sinceHit / 0.25);
      const a = side > 0 ? armR : armL, b = side > 0 ? armL : armR;
      a.rotation.set(-0.2 - 1.35 * ext, 0, 0); b.rotation.set(-0.15 + 0.3 * ext, 0, 0);
      body.rotation.y = side * 0.25 * ext; body.position.z = 0.25 * ext;
      if (blast > 0) { armL.rotation.set(-1.5, 0.35, 0); armR.rotation.set(-1.5, -0.35, 0); body.position.z = -0.1; }
      if (aura) aura.userData.update(time, auraK);
    },
  };
  return api;
}

// ---------- Energy beam between two points ----------
export function makeBeam(color = '#ffcf3a') {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, col: { value: new THREE.Color(color) }, k: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float time,k; uniform vec3 col; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float c = abs(dot(vN,vV)); float core = pow(c,3.); float edge = pow(c,0.8);
        float wave = 0.75 + 0.25*sin(vUv.y*40. - time*60.);
        vec3 o = mix(col*edge*1.5, vec3(1.)*3., core) * wave * k;
        gl_FragColor = vec4(o, (edge*0.8)*k); }`,
  });
  const geo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.userData.set = (a, b, width, time, k) => {
    m.position.copy(a); m.lookAt(b); m.scale.set(width, width, a.distanceTo(b));
    mat.uniforms.time.value = time; mat.uniforms.k.value = k; m.visible = k > 0.01;
  };
  return m;
}
