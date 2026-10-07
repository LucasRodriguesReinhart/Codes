// Shared building blocks for the AMS shorts (scene setup, hit/break effects, overlays).
import * as THREE from 'three';
import { buildWorld, applyAtmosphere } from '../lib/env.js';
import { FX } from '../lib/fx.js';
import { rainbowMaterial } from '../lib/ore.js';

export function themedScene(theme, opts = {}) {
  const scene = new THREE.Scene();
  applyAtmosphere(scene, theme);
  const world = buildWorld(scene, theme, { clear: [[0, 2, 12.5]], ...opts });
  const fx = new FX(scene);
  return { scene, world, fx, theme };
}

export const sharedRainbow = (() => { let m = null; return () => (m ||= rainbowMaterial(2.0)); })();

const dustColor = (ore) => '#' + new THREE.Color(ore.cfg.rock).lerp(new THREE.Color('#d8d0c6'), 0.35).getHexString();
const crystalColors = (ore) => (ore.cfg.crystal === 'rainbow' ? ['#ff4fd8', '#4ff3ff', '#ffe14a', '#7dff6a', '#a35bff'] : [ore.cfg.crystal, '#ffffff']);

// Impact effects at `pos` for a hit at time t. power 0..1+.
export function hitFX(fx, t, pos, power, ore, seed) {
  const cols = crystalColors(ore);
  fx.burst({ kind: 'spark', t0: t, origin: pos.clone(), count: Math.round(10 + 40 * power), speed: [3, 7 + 8 * power], dir: new THREE.Vector3(0, 0.6, -0.6), spread: 1.1, gravity: -16, life: [0.15, 0.45 + 0.2 * power], size: [0.02, 0.05], colors: ['#ffffff', '#fff1a8', ...cols], seed, intensity: 1.6 + power * 0.8 });
  fx.burst({ kind: 'chunk', t0: t, origin: pos.clone(), count: Math.round(3 + 8 * power), speed: [2, 5 + 3 * power], dir: new THREE.Vector3(0, 0.8, -0.4), spread: 0.9, gravity: -18, life: [0.6, 1.1], size: [0.05, 0.12 + 0.06 * power], colors: [ore.cfg.rock, ore.cfg.rock, '#555'], seed: seed + 7, ground: 0 });
  fx.burst({ kind: 'dust', t0: t, origin: pos.clone(), count: 3 + Math.round(power * 3), speed: [0.4, 1.4], dir: new THREE.Vector3(0, 0.5, -0.3), spread: 1, gravity: 0.6, life: [0.5, 0.9], size: [0.35, 0.7], colors: [dustColor(ore)], seed: seed + 13, drag: 2 });
  fx.flare({ t0: t, pos: pos.clone(), size: 0.45 + 0.7 * Math.min(power, 1.5), life: 0.08 + 0.06 * power, color: '#fff3c4', intensity: 1.0 + power * 0.4 });
  if (power > 0.6) fx.ring({ t0: t, pos: pos.clone(), radius: 1.2 + power * 1.2, life: 0.25, color: cols[0], normal: new THREE.Vector3(0, 0.3, -1).normalize(), intensity: 1.3 });
}

// Ore shatter + reward gems.
export function breakFX(fx, t, ore, scale = 1, seed = 1) {
  const c = ore.center(), R = ore.radius, cols = crystalColors(ore);
  fx.burst({ kind: 'chunk', t0: t, origin: c.clone(), count: Math.round(40 * scale), speed: [3, 9 * scale], dir: new THREE.Vector3(0, 1, 0), spread: 1.4, gravity: -20, life: [0.9, 1.6], size: [0.1 * R, 0.28 * R], colors: [ore.cfg.rock, ore.cfg.rock, '#3a3340'], seed, ground: 0 });
  fx.burst({ kind: 'gem', t0: t, origin: c.clone(), count: Math.round(14 * scale), speed: [3, 7 * scale], dir: new THREE.Vector3(0, 1.4, 0), spread: 0.9, gravity: -14, life: [1.3, 1.9], size: [0.12, 0.24], colors: cols, seed: seed + 3 });
  fx.burst({ kind: 'spark', t0: t, origin: c.clone(), count: Math.round(60 * scale), speed: [6, 16 * scale], dir: new THREE.Vector3(0, 0.6, 0), spread: 1.6, gravity: -10, life: [0.3, 0.8], size: [0.015, 0.04], colors: ['#ffffff', ...cols], seed: seed + 5, intensity: 1.8 });
  fx.burst({ kind: 'dust', t0: t, origin: c.clone().setY(0.4), count: 14, speed: [1.5, 4 * scale], dir: new THREE.Vector3(0, 0.15, 0), spread: 1.4, gravity: 0.3, life: [0.8, 1.4], size: [0.6 * R, 1.1 * R], colors: [dustColor(ore)], seed: seed + 9, drag: 2.5 });
  fx.flare({ t0: t, pos: c.clone(), size: Math.min(4, 2.4 * R * scale), life: 0.22, color: cols[0], intensity: 0.9 });
  fx.flare({ t0: t, pos: c.clone(), size: Math.min(2.5, 1.4 * R * scale), life: 0.12, color: '#ffffff', intensity: 1.1 });
  fx.ring({ t0: t, pos: new THREE.Vector3(c.x, 0.15, c.z), radius: 5 * scale, life: 0.5, color: cols[0], normal: new THREE.Vector3(0, 1, 0), intensity: 1.4 });
  fx.ring({ t0: t + 0.05, pos: c.clone(), radius: 3 * scale, life: 0.35, color: '#ffffff', normal: new THREE.Vector3(0, 0.2, -1).normalize(), intensity: 1 });
}

// Anime light rays burst drawn additively over the frame.
export function rays(ctx, x, y, k, time, { count = 18, color = '255,240,190', len = 1300, width = 0.09 } = {}) {
  if (k <= 0.001) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.rotate(time * 0.6);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2, w = width * (0.6 + 0.4 * Math.sin(i * 7.1));
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.addColorStop(0, `rgba(${color},${0.55 * k})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len); ctx.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len); ctx.closePath(); ctx.fill();
  }
  const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 420);
  rg.addColorStop(0, `rgba(${color},${0.6 * k})`); rg.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = rg; ctx.fillRect(-420, -420, 840, 840);
  ctx.restore();
}

// Speed lines (manga style) converging to centre, k = intensity.
export function speedLines(ctx, k, time, { cx = 540, cy = 960, count = 70, color = '255,255,255' } = {}) {
  if (k <= 0.001) return;
  ctx.save();
  let s = Math.floor(time * 24) * 9301;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, r0 = 520 + r() * 260, r1 = 1500, w = 2 + r() * 7;
    ctx.strokeStyle = `rgba(${color},${(0.25 + r() * 0.5) * k})`; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
  }
  ctx.restore();
}

