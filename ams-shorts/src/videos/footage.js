// Real-footage editor: renders an EDL (edl/*.json) over OBS recordings with the same edit layer
// (crop 16:9 -> 9:16, punch zooms, shake, flashes, impact frames, text, badges, end card).
// Frames are pre-extracted by footage.mjs into out/footage/<id>/clipN/00001.jpg ...
import * as THREE from 'three';
import { impulse } from '../engine.js';
import { text, badge, endCard, pop, caption, timer, COLORS, FONTS, W, H } from '../lib/overlay.js';
import { clamp, ease, kf, lerp, noise1, smooth } from '../lib/util.js';
import { rays, speedLines } from './kit.js';

export async function timeline(lang, q) {
  const id = q.get('edl');
  const edl = await (await fetch(`edl/${id}.json`)).json();
  const manifest = await (await fetch(`out/footage/${id}/manifest.json`)).json();
  return { ...edl, id, fps: edl.fps || 30, lang: edl.lang || lang, manifest };
}

// Seconds of source consumed after `dt` seconds of edit time; speed may be a number or keyframes.
export function srcOffset(clip, dt) {
  if (typeof clip.speed !== 'object' || clip.speed === null) return dt * (clip.speed ?? 1);
  let s = 0; const step = 1 / 240;
  for (let x = 0; x < dt; x += step) s += kf(clip.t0 + x, clip.speed.map(([t, v]) => [t, v, 'linear'])) * Math.min(step, dt - x);
  return s;
}

const FILL = { white: '#ffffff', yellow: [COLORS.yellow, '#ffb21a'], red: [COLORS.red, '#a0001a'], green: [COLORS.green, '#18b34a'], rainbow: 'rainbow', pink: ['#ff9bf0', '#ff3fbf'], cyan: ['#bdfbff', '#29c6ff'] };
// number | [from, to] over the clip | [[t, v], ...] keyframes
const curve = (v, c, t, dflt) => (v == null ? dflt : typeof v === 'number' ? v : Array.isArray(v[0]) ? kf(t, v) : kf(t, [[c.t0, v[0]], [c.t1, v[1], 'inOutCubic']]));
const fill = (f) => (typeof f === 'string' ? FILL[f] || f : f) || '#ffffff';

export class Video {
  constructor(eng, tl) {
    this.eng = eng; this.tl = tl;
    eng.renderer.toneMapping = THREE.NoToneMapping; // footage colours stay untouched
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 10);
    // Two panes: the full frame, or top/bottom halves when a clip has a `bottom` source (split screen).
    this.panes = [0, 1].map(() => {
      const tex = new THREE.Texture(); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      quad.position.z = -1; this.scene.add(quad);
      return { tex, quad, w: 16, h: 9 };
    });
    this.cache = new Map();
    this.impacts = (tl.fx || []).filter((f) => f.type === 'impact' || f.type === 'shake');
  }

  clipAt(t) { return this.tl.clips.findIndex((c) => t >= c.t0 && t < c.t1); }

  loadImg(url) {
    if (this.cache.has(url)) return this.cache.get(url);
    const img = new Image(); img.src = url;
    const p = img.decode().then(() => img);
    this.cache.set(url, p);
    if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
    return p;
  }

  // Sources active in clip ci: [main] or [top, bottom].
  sources(ci) {
    const c = this.tl.clips[ci], m = this.tl.manifest.clips[ci];
    const list = [{ c, m, dir: `clip${ci}` }];
    if (c.bottom) list.push({ c: { ...c.bottom, t0: c.t0, t1: c.t1 }, m: m.bottom, dir: `clip${ci}b` });
    return list;
  }

  async prepare(t) {
    const ci = this.clipAt(t);
    this.ci = ci;
    if (ci < 0) return;
    const srcs = this.sources(ci);
    await Promise.all(srcs.map(async ({ c, m, dir }, i) => {
      const idx = clamp(Math.round(srcOffset(c, t - c.t0) * m.fps) + 1, 1, m.frames);
      const img = await this.loadImg(`out/footage/${this.tl.id}/${dir}/${String(idx).padStart(5, '0')}.jpg`);
      const p = this.panes[i];
      if (p.tex.image !== img) { p.tex.image = img; p.tex.needsUpdate = true; }
      p.w = img.naturalWidth; p.h = img.naturalHeight;
    }));
  }

  update(t) {
    const tl = this.tl, fx = { time: t, ca: 0.002, vignette: 0.25, bloom: 0.12, sat: 1.06, contrast: 1.04, grain: 0.015 };
    const punch = impulse(t, this.impacts.map((f) => ({ t: f.t, power: f.amount ?? 1 })), 10), sh = Math.min(1.5, punch);
    const srcs = this.ci >= 0 ? this.sources(this.ci) : [];
    const split = srcs.length === 2;
    this.panes.forEach((p, i) => {
      const s = srcs[i];
      p.quad.visible = !!s;
      if (!s) return;
      const c = s.c;
      // Crop window in source UV: full height of the pane aspect, scaled by zoom, centred on cropX/cropY.
      const zoom = curve(c.zoom, c, t, 1) * (1 + 0.08 * punch);
      const paneAspect = split ? W / (H / 2) : W / H;
      const wFrac = Math.min(1, paneAspect / (p.w / p.h)) / zoom, hFrac = Math.min(1, (p.w / p.h) / paneAspect) / zoom;
      const cx = curve(c.cropX, c, t, 0.5), cy = curve(c.cropY, c, t, 0.5);
      const ox = noise1(t * 26, 1 + i) * 0.012 * sh, oy = noise1(t * 26, 2 + i) * 0.012 * sh;
      p.tex.repeat.set(wFrac, hFrac);
      p.tex.offset.set(clamp(cx - wFrac / 2 + ox, 0, 1 - wFrac), clamp(1 - cy - hFrac / 2 + oy, 0, 1 - hFrac));
      p.quad.position.y = split ? (i === 0 ? 0.25 : -0.25) : 0;
      p.quad.scale.set(1 + 0.03 * sh, (split ? 0.5 : 1) * (1 + 0.03 * sh), 1);
      p.quad.rotation.z = split ? 0 : noise1(t * 20, 3) * 0.01 * sh;
    });
    for (const f of tl.fx || []) {
      const d = Math.round((t - f.t) * tl.fps), k = t - f.t;
      if (f.type === 'impact') {
        if (d === 0 || d === 1) Object.assign(fx, { invert: 1, sat: 0, contrast: 2.6, ca: 0.02 });
        else if (d === 2) fx.flash = Math.max(fx.flash || 0, 0.55);
        if (k >= 0 && k < 0.25) fx.zoomBlur = Math.max(fx.zoomBlur || 0, 0.12 * (1 - k / 0.25));
      } else if (f.type === 'flash' && k >= 0 && k < 0.12) fx.flash = Math.max(fx.flash || 0, (f.amount ?? 0.5) * (1 - k / 0.12));
      else if (f.type === 'cut' && k >= 0 && k < 0.12) { fx.zoomBlur = Math.max(fx.zoomBlur || 0, 0.2 * (1 - k / 0.12)); fx.ca = 0.02; }
      else if (f.type === 'rewind' && k >= 0 && k < (f.dur ?? 0.2)) Object.assign(fx, { sat: 0.25, contrast: 1.25, zoomBlur: 0.18, ca: 0.03, tint: [0.85, 0.95, 1.2] });
    }
    this.eng.setViews([{ scene: this.scene, camera: this.cam }]);
    this.eng.fx(fx);
  }

  draw2d(ctx, t) {
    const tl = this.tl, lang = tl.lang;
    for (const L of tl.layers || []) {
      if (t < L.t0 || t > (L.t1 ?? tl.duration) + 0.15) continue;
      const x = L.x ?? W / 2, y = L.y ?? 600;
      if (L.type === 'text') {
        let s = 1, a = 1;
        if (L.anim === 'stamp') { const k = t - L.t0; s = k < 0.12 ? lerp(2.6, 1, ease.outCubic(k / 0.12)) : 1; a = clamp(((L.t1 ?? tl.duration) + 0.12 - t) / 0.12); }
        else if (L.anim !== 'none') ({ s, a } = pop(t, L.t0, L.t1 ?? Infinity));
        text(ctx, L.text, x, y, { size: L.size ?? 110, fill: fill(L.fill), time: t, scale: s, alpha: a, rotate: L.rotate ?? -0.04, glow: L.glow || null, font: L.font === 'label' ? FONTS.label : FONTS.hook });
      } else if (L.type === 'badge') {
        const { s, a } = pop(t, L.t0, L.t1 ?? Infinity);
        badge(ctx, L.text, x, y, { size: L.size ?? 60, bg: fill(L.bg) || ['#ffe36b', '#ff9a1a'], scale: s, alpha: a, time: t, rotate: L.rotate ?? -0.03 });
      } else if (L.type === 'caption') {
        const { s, a } = pop(t, L.t0, L.t1 ?? Infinity);
        caption(ctx, L.text, x, y, { size: L.size ?? 54, scale: s, alpha: a });
      } else if (L.type === 'rays') {
        rays(ctx, x, y, (L.amount ?? 1) * (1 - smooth((t - (L.t1 ?? L.t0 + 0.5) + 0.25) / 0.25)), t, { color: L.color || '255,240,190' });
      } else if (L.type === 'speedlines') {
        speedLines(ctx, L.amount ?? 0.8, t, {});
      } else if (L.type === 'timer') {
        const v = L.from != null ? clamp(L.from + (t - L.t0) * (L.rate ?? 1), 0, L.to ?? Infinity) : L.value ?? 0;
        timer(ctx, v, x, y, { size: L.size ?? 96, align: L.align ?? 'center', fill: fill(L.fill) });
      } else if (L.type === 'vs') {
        ctx.save(); ctx.fillStyle = COLORS.ink; ctx.fillRect(0, 952, W, 16); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 957, W, 6);
        ctx.beginPath(); ctx.arc(W / 2, 960, 62, 0, Math.PI * 2); ctx.fillStyle = COLORS.ink; ctx.fill();
        ctx.beginPath(); ctx.arc(W / 2, 960, 52, 0, Math.PI * 2); ctx.fillStyle = '#d61a35'; ctx.fill(); ctx.restore();
        text(ctx, 'VS', W / 2, 962, { size: 64, strokeW: 8, shadow: 0, rotate: -0.08 });
      } else if (L.type === 'endcard') {
        endCard(ctx, clamp((t - L.t0) / 0.5), t - L.t0, lang, { y: L.y ?? 860, dim: L.dim ?? true });
      }
    }
  }
}
