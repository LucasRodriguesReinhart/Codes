// Environment: sky, floating islands, themed decoration, lighting.
import * as THREE from 'three';
import { rng } from './util.js';

export const THEMES = {
  starter: {
    skyTop: '#2f7fe0', skyHorizon: '#a9dcff', skyBottom: '#dff3ff', fog: '#bfe3ff', fogNear: 45, fogFar: 230,
    sunColor: '#fff1d0', sunInt: 3.0, sunDir: [0.55, 0.85, 0.35], hemiSky: '#cfe8ff', hemiGround: '#6b8f45', hemiInt: 1.25,
    grass: '#5ecb3e', grass2: '#4bb02f', dirt: '#8c5b34', rock: '#7d8088', deco: 'trees', stars: false, clouds: '#ffffff',
  },
  desert: {
    skyTop: '#3b62c9', skyHorizon: '#ffc98f', skyBottom: '#ffe2bd', fog: '#ffd3a1', fogNear: 45, fogFar: 230,
    sunColor: '#ffd6a0', sunInt: 3.2, sunDir: [-0.5, 0.55, 0.45], hemiSky: '#ffe0bf', hemiGround: '#b5793f', hemiInt: 1.2,
    grass: '#e9b765', grass2: '#d9a14f', dirt: '#a8643a', rock: '#c27a45', deco: 'desert', stars: false, clouds: '#fff3e6',
  },
  frost: {
    skyTop: '#0d2150', skyHorizon: '#3f8fbf', skyBottom: '#5fb6d8', fog: '#2f6f9a', fogNear: 40, fogFar: 210,
    sunColor: '#cfe8ff', sunInt: 2.4, sunDir: [0.4, 0.7, -0.3], hemiSky: '#9fd2ff', hemiGround: '#365a7a', hemiInt: 1.3,
    grass: '#e8f4ff', grass2: '#cfe6f7', dirt: '#5a7d9c', rock: '#7891a8', deco: 'frost', stars: true, clouds: '#d9ecff',
  },
  shadow: {
    skyTop: '#05020f', skyHorizon: '#3a1260', skyBottom: '#14061f', fog: '#1d0a33', fogNear: 30, fogFar: 190,
    sunColor: '#d9c2ff', sunInt: 2.6, sunDir: [0.45, 0.75, 0.5], hemiSky: '#8a5fd0', hemiGround: '#2a1640', hemiInt: 1.6,
    grass: '#2e2142', grass2: '#3a2856', dirt: '#1d1328', rock: '#2a2338', deco: 'shadow', stars: true, moon: true, clouds: null,
  },
  void: {
    skyTop: '#01020a', skyHorizon: '#0d2c52', skyBottom: '#04060e', fog: '#071a30', fogNear: 28, fogFar: 170,
    sunColor: '#bfe0ff', sunInt: 2.2, sunDir: [0.4, 0.8, 0.45], hemiSky: '#4f7fd0', hemiGround: '#0f1626', hemiInt: 1.5,
    grass: '#1c2638', grass2: '#232f45', dirt: '#121826', rock: '#1d2434', deco: 'shadow', decoColors: ['#2fd6ff', '#5a6bff', '#9b5cff'], stars: true, clouds: null,
  },
  arena: {
    skyTop: '#2a6fd6', skyHorizon: '#ffd2a6', skyBottom: '#ffe9cf', fog: '#f7d3ad', fogNear: 50, fogFar: 240,
    sunColor: '#ffe2b8', sunInt: 3.0, sunDir: [0.6, 0.6, 0.5], hemiSky: '#ffe6cc', hemiGround: '#7a6a52', hemiInt: 1.2,
    grass: '#9a9488', grass2: '#8a8477', dirt: '#6b5a48', rock: '#8a8172', deco: 'arena', stars: false, clouds: '#fff6ec',
  },
};

const C = (c) => new THREE.Color(c);

function skyDome(th) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: C(th.skyTop) }, hor: { value: C(th.skyHorizon) }, bot: { value: C(th.skyBottom) },
      sunDir: { value: new THREE.Vector3(...th.sunDir).normalize() }, sunCol: { value: C(th.sunColor) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top,hor,bot,sunDir,sunCol; varying vec3 vDir;
      void main(){ float y=vDir.y; vec3 c = y>0. ? mix(hor, top, pow(clamp(y,0.,1.),0.55)) : mix(hor, bot, pow(clamp(-y,0.,1.),0.5));
        float s = max(dot(normalize(vDir), sunDir),0.); c += sunCol*(pow(s,600.)*3. + pow(s,12.)*0.25);
        gl_FragColor = vec4(c,1.); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
  m.renderOrder = -10;
  return m;
}

function stars(seed) {
  const r = rng(seed), n = 1400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05, s = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * s * 550, y * 550, Math.sin(th) * s * 550], i * 3);
    const b = 0.5 + r() * 2.5; col.set([b, b * (0.85 + r() * 0.15), b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
}

function jitter(geo, amt, seed, keepTop = false) {
  const r = rng(seed), p = geo.attributes.position, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
    const d = map.get(key);
    if (keepTop && p.getY(i) > 0.49) { p.setX(i, p.getX(i) + d[0]); p.setZ(i, p.getZ(i) + d[2]); continue; }
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, flatShading: true, ...o });

export function island(th, radius, seed, detail = true) {
  const g = new THREE.Group(), r = rng(seed);
  const topGeo = jitter(new THREE.CylinderGeometry(radius, radius * 0.96, 1.6, 36, 1).toNonIndexed(), radius * 0.02, seed, true);
  const top = new THREE.Mesh(topGeo, std(th.grass));
  top.position.y = -0.8; top.receiveShadow = true; g.add(top);
  // Underside: inverted rocky cone with dirt -> rock gradient.
  const cone = jitter(new THREE.ConeGeometry(radius * 0.97, radius * 0.9, 14, 4).toNonIndexed(), radius * 0.09, seed + 1);
  cone.rotateX(Math.PI); cone.translate(0, -1.6 - radius * 0.45, 0);
  const cc = [], cd = C(th.dirt), cr = C(th.rock), p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = Math.min(1, (-p.getY(i) - 1.6) / (radius * 0.5)); const c = cd.clone().lerp(cr, k); cc.push(c.r, c.g, c.b); }
  cone.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
  g.add(new THREE.Mesh(cone, std('#ffffff', { vertexColors: true })));
  if (detail) {
    for (let i = 0; i < 14; i++) { // grass patches for texture
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius * 0.85, s = 1.5 + r() * 3.5;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(s, s, 0.04, 9), std(th.grass2));
      m.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d); m.receiveShadow = true; g.add(m);
    }
  }
  return g;
}

function tree(th, r, kind) {
  const g = new THREE.Group();
  if (kind === 'trees') {
    const h = 2 + r() * 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, h, 6), std('#7a4a2a'));
    trunk.position.y = h / 2; trunk.castShadow = true; g.add(trunk);
    const greens = ['#3faa3a', '#4cc246', '#2f9a3b', '#59c94a'];
    for (let i = 0; i < 3; i++) {
      const s = 1.4 - i * 0.28 + r() * 0.3;
      const leaf = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(s, 0).toNonIndexed(), 0.2, Math.floor(r() * 1e6)), std(greens[Math.floor(r() * 4)]));
      leaf.position.set((r() - 0.5) * 0.6, h + i * 0.9, (r() - 0.5) * 0.6); leaf.castShadow = true; g.add(leaf);
    }
  } else if (kind === 'desert') {
    if (r() < 0.55) {
      const h = 2.5 + r() * 2, m = std('#4f9a3c');
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, h, 7), m); b.position.y = h / 2; b.castShadow = true; g.add(b);
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.2, 7), m);
        arm.position.set(sx * 0.6, h * (0.45 + r() * 0.2) + 0.5, 0); arm.castShadow = true; g.add(arm);
        const j = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 7), m);
        j.rotation.z = Math.PI / 2; j.position.set(sx * 0.35, arm.position.y - 0.5, 0); g.add(j);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const w = 3 - i * 0.8 + r(), mesa = new THREE.Mesh(jitter(new THREE.BoxGeometry(w, 1.4, w * 0.8).toNonIndexed(), 0.25, Math.floor(r() * 1e6)), std(i % 2 ? '#d98e52' : '#c47640'));
        mesa.position.y = 0.7 + i * 1.35; mesa.castShadow = true; g.add(mesa);
      }
    }
  } else if (kind === 'frost') {
    const h = 3 + r() * 2.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6), std('#5a3b2a')); trunk.position.y = 0.6; g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.5 - i * 0.4, h * 0.45, 7), std(i === 2 ? '#f3fbff' : '#2f6e5a'));
      c.position.y = 1.2 + i * h * 0.27; c.castShadow = true; g.add(c);
      const snow = new THREE.Mesh(new THREE.ConeGeometry(1.0 - i * 0.3, h * 0.18, 7), std('#ffffff'));
      snow.position.y = c.position.y + h * 0.16; g.add(snow);
    }
  } else if (kind === 'shadow') {
    const cols = th.decoColors || ['#b43cff', '#ff3fbf', '#5a6bff'];
    const n = 2 + Math.floor(r() * 3), col = cols[Math.floor(r() * 3)];
    for (let i = 0; i < n; i++) {
      const s = 0.5 + r() * 0.9, h = 2 + r() * 4;
      const geo = new THREE.OctahedronGeometry(1, 0); geo.scale(s, h, s);
      const m = new THREE.Mesh(geo, std('#1a0f2a', { emissive: col, emissiveIntensity: 1.6, roughness: 0.25 }));
      m.position.set((r() - 0.5) * 1.6, h * 0.6, (r() - 0.5) * 1.6); m.rotation.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5);
      g.add(m);
    }
  } else if (kind === 'arena') {
    const h = 3 + r() * 3;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, h, 8), std('#b8ae9c'));
    p.position.y = h / 2; p.castShadow = true; g.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2), std('#c9bfac')); cap.position.y = h + 0.25; g.add(cap);
  }
  return g;
}

function rocks(th, r) {
  const m = new THREE.Mesh(jitter(new THREE.DodecahedronGeometry(0.5 + r() * 0.9, 0).toNonIndexed(), 0.25, Math.floor(r() * 1e6)), std(th.rock));
  m.castShadow = true; m.receiveShadow = true; m.rotation.y = r() * 6;
  return m;
}

function cloud(color, r) {
  const g = new THREE.Group(), m = std(color, { emissive: color, emissiveIntensity: 0.35, roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const s = 3 + r() * 4, b = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), m);
    b.position.set((i - 2) * 4 + r() * 2, r() * 2, r() * 3); b.scale.y = 0.6; g.add(b);
  }
  return g;
}

// Build a complete themed world. `clear` = list of [x, z, radius] areas to keep free of props.
export function buildWorld(scene, themeName, { seed = 1, radius = 26, clear = [], offset = [0, 0, 0], shadowSize = 14, distant = true } = {}) {
  const th = THEMES[themeName], r = rng(seed), root = new THREE.Group();
  root.position.set(...offset);
  scene.add(root);
  const main = island(th, radius, seed);
  root.add(main);
  const free = (x, z) => clear.every(([cx, cz, cr]) => (x - cx) ** 2 + (z - cz) ** 2 > cr * cr);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = radius * (0.45 + r() * 0.48), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!free(x, z)) continue;
    const t = tree(th, r, th.deco); t.position.set(x, 0, z); t.rotation.y = r() * 6; root.add(t);
  }
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, d = radius * (0.25 + r() * 0.7), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!free(x, z)) continue;
    const k = rocks(th, r); k.position.set(x, 0.1, z); root.add(k);
  }
  if (distant) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r(), d = 95 + r() * 90, s = 6 + r() * 10;
      const isl = island(th, s, seed + 10 + i, false);
      isl.position.set(Math.cos(a) * d, -6 + r() * 24, Math.sin(a) * d);
      for (let k = 0; k < 4; k++) { const t = tree(th, r, th.deco); t.position.set((r() - 0.5) * s, 0, (r() - 0.5) * s); isl.add(t); }
      root.add(isl);
    }
  }
  if (th.clouds) {
    for (let i = 0; i < 9; i++) {
      const c = cloud(th.clouds, r), a = r() * Math.PI * 2, d = 120 + r() * 140;
      c.position.set(Math.cos(a) * d, 10 + r() * 50, Math.sin(a) * d); c.lookAt(0, c.position.y, 0); root.add(c);
    }
  }
  if (th.moon) {
    const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9ff').multiplyScalar(1.6), fog: false }));
    moon.position.set(-160, 150, -380); root.add(moon);
  }

  // Lights live with the world so split-screen worlds can each be lit.
  const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiInt);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(th.sunColor, th.sunInt);
  sun.position.set(...th.sunDir.map((v) => v * 40));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 1, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  root.add(sun); root.add(sun.target);
  return { root, theme: th, sun };
}

export function applyAtmosphere(scene, themeName) {
  const th = THEMES[themeName];
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
  scene.background = null;
  const sky = skyDome(th);
  scene.add(sky);
  let st = null;
  if (th.stars) { st = stars(7); scene.add(st); }
  return { sky, stars: st };
}
