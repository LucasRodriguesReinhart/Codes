// Ore nodes with procedural glowing cracks that spread from the impact point as HP drops.
import * as THREE from 'three';
import { rng } from './util.js';

export const ORES = {
  stone:   { rock: '#8b8e95', crystal: '#b9bcc4', cEm: 0.0, size: 0.85, crystals: 3, crack: '#ffb347', metal: 0.0, label: { pt: 'PEDRA', en: 'STONE' } },
  copper:  { rock: '#7a6a60', crystal: '#e9783a', cEm: 0.15, size: 1.0, crystals: 6, crack: '#ff8a3d', metal: 0.5, label: { pt: 'COBRE', en: 'COPPER' } },
  gold:    { rock: '#6f6a5d', crystal: '#ffc21a', cEm: 0.35, size: 1.15, crystals: 8, crack: '#ffd84a', metal: 0.7, label: { pt: 'OURO', en: 'GOLD' } },
  diamond: { rock: '#566676', crystal: '#57f0ff', cEm: 0.9, size: 1.3, crystals: 9, crack: '#7ff7ff', metal: 0.1, label: { pt: 'DIAMANTE', en: 'DIAMOND' } },
  mythic:  { rock: '#2a1d3c', crystal: 'rainbow', cEm: 1.6, size: 1.35, crystals: 12, crack: '#ff4fe0', metal: 0.2, label: { pt: 'MÍTICO', en: 'MYTHIC' } },
  secret:  { rock: '#3a3256', crystal: 'rainbow', cEm: 1.1, size: 1.55, crystals: 11, crack: '#6fe3ff', metal: 0.3, label: { pt: 'SECRETO', en: 'SECRET' } },
};

const GLSL_CELL = `
vec3 h3(vec3 p){ p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453); }
vec2 cell(vec3 x){ vec3 p=floor(x), f=fract(x); float d1=8., d2=8.;
  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){ vec3 b=vec3(float(i),float(j),float(k)); vec3 r=b+h3(p+b)-f; float d=dot(r,r); if(d<d1){d2=d1;d1=d;} else if(d<d2){d2=d;} }
  return vec2(sqrt(d1),sqrt(d2)); }`;

// Material whose emissive shows glowing cracks. uniforms.damage in [0,1].
function crackMaterial(base, crackColor, radius, extra = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.85, metalness: 0.05, flatShading: true, ...extra });
  const u = { damage: { value: 0 }, hitPoint: { value: new THREE.Vector3(0, 0, radius) }, crackCol: { value: new THREE.Color(crackColor) }, radius: { value: radius }, glow: { value: 1 } };
  mat.userData.u = u;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float damage, radius, glow; uniform vec3 hitPoint, crackCol;\n${GLSL_CELL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 q = vObj / radius;
        vec2 c = cell(q*3.2);
        float edge = c.y - c.x;
        float reach = damage * 2.6;
        float d = length(vObj - hitPoint) / radius;
        float mask = smoothstep(reach, reach - 0.35, d);
        float w = 0.035 + damage*0.07;
        float crack = (1. - smoothstep(w*0.4, w, edge)) * mask * step(0.001, damage);
        diffuseColor.rgb *= 1. - crack*0.85;
        totalEmissiveRadiance += crackCol * crack * (1.0 + damage*2.2) * glow;`);
  };
  return mat;
}

// Rainbow / iridescent emissive used by mythic & secret crystals.
export function rainbowMaterial(intensity = 1.6, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0.1, flatShading: true, ...opts });
  const u = { time: { value: 0 }, emit: { value: intensity } };
  mat.userData.u = u;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vW; uniform float time, emit;
        vec3 hue(float h){ return clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 hc = hue(fract(vW.y*0.18 + vW.x*0.07 + time*0.35));
        diffuseColor.rgb = mix(diffuseColor.rgb, hc, 0.75);
        totalEmissiveRadiance += hc * emit;`);
  };
  return mat;
}

export function makeOre(kind, seed = 3) {
  const cfg = ORES[kind], r = rng(seed), R = cfg.size;
  const group = new THREE.Group();
  const body = new THREE.Group(); // body gets squash/shake; group stays put
  group.add(body);
  const geo = new THREE.IcosahedronGeometry(R, 1).toNonIndexed();
  const p = geo.attributes.position, disp = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!disp.has(k)) disp.set(k, 0.82 + r() * 0.3);
    const s = disp.get(k);
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.82, p.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const rockMat = crackMaterial(cfg.rock, cfg.crack, R, { metalness: cfg.metal * 0.3 });
  const rock = new THREE.Mesh(geo, rockMat);
  rock.position.y = R * 0.62; rock.castShadow = true; rock.receiveShadow = true;
  body.add(rock);

  const crystalMat = cfg.crystal === 'rainbow'
    ? rainbowMaterial(cfg.cEm)
    : new THREE.MeshStandardMaterial({ color: cfg.crystal, emissive: cfg.crystal, emissiveIntensity: cfg.cEm, roughness: 0.25, metalness: cfg.metal, flatShading: true });
  const crystals = [];
  for (let i = 0; i < cfg.crystals; i++) {
    // Place on the upper/front hemisphere, oriented along the surface normal.
    const th = r() * Math.PI * 2, ph = Math.acos(1 - r() * 1.15);
    const n = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph) * 0.9, Math.sin(ph) * Math.sin(th)).normalize();
    const g = new THREE.OctahedronGeometry(1, 0); const w = R * (0.13 + r() * 0.12), h = R * (0.35 + r() * 0.45);
    g.scale(w, h, w);
    const m = new THREE.Mesh(g, crystalMat);
    m.position.copy(n.clone().multiplyScalar(R * 0.78)).add(new THREE.Vector3(0, R * 0.62, 0));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    m.castShadow = true;
    body.add(m); crystals.push(m);
  }
  const light = new THREE.PointLight(cfg.crystal === 'rainbow' ? '#ff6bf0' : cfg.crystal, cfg.cEm * 6, R * 7, 2);
  light.position.set(0, R * 1.2, R * 0.6);
  if (cfg.cEm > 0.3) group.add(light);

  const api = {
    group, body, rock, crystals, cfg, radius: R, light,
    center: () => new THREE.Vector3(0, R * 0.62, 0).applyMatrix4(group.matrixWorld),
    top: () => new THREE.Vector3(0, R * 1.55, 0).applyMatrix4(group.matrixWorld),
    // Point on the ore surface facing `from` (world), returned in object space for crack origin.
    setHitFrom(fromWorld) {
      group.updateMatrixWorld(true);
      const local = rock.worldToLocal(fromWorld.clone());
      local.normalize().multiplyScalar(R * 0.9);
      rockMat.userData.u.hitPoint.value.copy(local);
    },
    // damage 0..1, hitKick = recent hit envelope (0..1), time for shimmer
    update(damage, hitKick, time, visible = true) {
      group.visible = visible;
      rockMat.userData.u.damage.value = damage;
      const sq = hitKick * 0.12;
      body.scale.set(1 + sq, 1 - sq * 1.3, 1 + sq);
      body.position.x = Math.sin(time * 90) * hitKick * 0.06 * R;
      if (crystalMat.userData.u) crystalMat.userData.u.time.value = time;
      light.intensity = cfg.cEm * 6 * (1 + hitKick * 2 + damage * 1.5);
    },
  };
  return api;
}
