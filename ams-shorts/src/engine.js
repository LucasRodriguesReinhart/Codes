// Frame engine: renders the 3D views through the post chain, then the 2D edit layer on top.
import * as THREE from 'three';
import { makePost } from './lib/post.js';
import { W, H } from './lib/overlay.js';
import { noise1, decay, clamp, smooth } from './lib/util.js';

export class Engine {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.post = makePost(this.renderer, W, H);
    this.out = document.createElement('canvas'); this.out.width = W; this.out.height = H;
    this.ctx = this.out.getContext('2d');
    document.body.appendChild(this.out);
  }

  setViews(views) { this.post.views.views = views; }

  // Post-effect controls for this frame (reset every frame by the video).
  fx({ ca = 0.004, zoomBlur = 0, center = [0.5, 0.5], vignette = 0.4, flash = 0, flashColor = '#ffffff', sat = 1.12, contrast = 1.06, bloom = 0.55, dirBlur = [0, 0], invert = 0, tint = [1, 1, 1], grain = 0.025, time = 0 } = {}) {
    const u = this.post.final;
    u.ca.value = ca; u.zoomBlur.value = zoomBlur; u.center.value.set(...center); u.vignette.value = vignette;
    u.flash.value = flash; u.flashColor.value.set(flashColor); u.sat.value = sat; u.contrast.value = contrast;
    u.dirBlur.value.set(...dirBlur); u.invert.value = invert; u.tint.value.set(...tint); u.grain.value = grain; u.time.value = time;
    this.post.bloom.strength = bloom;
  }

  render(draw2d) {
    this.post.composer.render();
    this.ctx.clearRect(0, 0, W, H);
    this.ctx.drawImage(this.renderer.domElement, 0, 0, W, H);
    if (draw2d) draw2d(this.ctx);
  }

  // World -> screen pixels for a camera that occupies rect [x,y,w,h] (0..1, bottom-left origin).
  project(v, camera, rect = [0, 0, 1, 1]) {
    const p = v.clone().project(camera);
    const [rx, ry, rw, rh] = rect;
    return { x: (rx + (p.x * 0.5 + 0.5) * rw) * W, y: (1 - (ry + (p.y * 0.5 + 0.5) * rh)) * H, z: p.z, behind: p.z > 1 };
  }
}

// Point a camera with optional roll and procedural shake.
export function placeCamera(cam, pos, target, { fov = 50, roll = 0, shake = 0, t = 0, seed = 0 } = {}) {
  cam.fov = fov;
  cam.position.set(...pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3(...target));
  if (roll) cam.rotateZ(roll);
  if (shake > 0) {
    cam.rotateX(noise1(t * 28, seed + 1) * 0.035 * shake);
    cam.rotateY(noise1(t * 28, seed + 2) * 0.035 * shake);
    cam.rotateZ(noise1(t * 22, seed + 3) * 0.03 * shake);
  }
  cam.updateProjectionMatrix();
}

// Sum of decaying impulses from a list of {t, power} events.
export function impulse(t, events, rate = 9, key = 'power') {
  let s = 0;
  for (const e of events) s += (e[key] ?? 1) * decay(t, e.t, rate);
  return s;
}

// Mining state from a list of hits [{t, dmg}] against an ore with maxHp.
export function mining(t, hits, maxHp) {
  let dealt = 0, last = null, next = null;
  for (const h of hits) { if (h.t <= t) { dealt += h.dmg; last = h; } else if (!next) next = h; }
  // ghost bar trails 0.3s behind
  let ghostDealt = 0;
  for (const h of hits) ghostDealt += h.dmg * smooth((t - h.t - 0.18) / 0.3);
  const hp = Math.max(0, maxHp - dealt);
  return {
    hp, frac: hp / maxHp, ghost: Math.max(0, maxHp - ghostDealt) / maxHp, damage: clamp(dealt / maxHp),
    sinceHit: last ? t - last.t : 10, untilHit: next ? next.t - t : 10, last, next,
  };
}
