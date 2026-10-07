// 2D "edit layer": hook text, captions, damage numbers, HP bars, timers, badges, end card.
// Everything is drawn on a 1080x1920 canvas on top of the 3D frame.
import { clamp, ease, lerp } from './util.js';

export const W = 1080, H = 1920;
// Safe area for TikTok / Reels / Shorts UI (top bar, right rail, caption block).
export const SAFE = { top: 200, bottom: 1480, left: 70, right: 930 };
export const FONTS = { hook: '"Luckiest Guy"', label: '"Lilita One"', ui: '"Inter Display"' };
export const COLORS = { yellow: '#ffe14a', pink: '#ff4fd8', cyan: '#4ff3ff', red: '#ff3b4a', green: '#5dff7a', white: '#ffffff', ink: '#120a1e' };
export const RARITY = {
  common: { pt: 'COMUM', en: 'COMMON', c: ['#d9dde3', '#9aa3ad'] },
  rare: { pt: 'RARO', en: 'RARE', c: ['#6fc3ff', '#1f6fff'] },
  epic: { pt: 'ÉPICO', en: 'EPIC', c: ['#e08bff', '#8a2bff'] },
  legendary: { pt: 'LENDÁRIO', en: 'LEGENDARY', c: ['#ffe36b', '#ff9a1a'] },
  mythic: { pt: 'MÍTICO', en: 'MYTHIC', c: 'rainbow' },
  secret: { pt: 'SECRETO', en: 'SECRET', c: 'rainbow' },
};

export function rainbow(ctx, x0, x1, time, sat = 100, light = 62) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + time * 220) % 360},${sat}%,${light}%)`);
  return g;
}

function paint(ctx, fill, x0, x1, time, yTop, yBot) {
  if (fill === 'rainbow') return rainbow(ctx, x0, x1, time);
  if (Array.isArray(fill)) {
    const g = ctx.createLinearGradient(0, yTop, 0, yBot);
    fill.forEach((c, i) => g.addColorStop(i / (fill.length - 1), c));
    return g;
  }
  return fill;
}

// Pop-in animation helper -> { s, a } (scale, alpha). Also supports an out time.
export function pop(t, t0, t1 = Infinity, { inDur = 0.2, outDur = 0.12, from = 0.35 } = {}) {
  if (t < t0 || t > t1 + outDur) return { s: 0, a: 0 };
  let s = lerp(from, 1, ease.outBack(clamp((t - t0) / inDur), 2.2));
  let a = clamp((t - t0) / (inDur * 0.4));
  if (t > t1) { const k = clamp((t - t1) / outDur); s *= 1 + k * 0.25; a *= 1 - k; }
  return { s, a };
}

// Segments: string or [[text, fill], ...]. Draws centered at (x, y) baseline-middle.
export function text(ctx, segs, x, y, o = {}) {
  const { size = 110, font = FONTS.hook, stroke = COLORS.ink, strokeW = size * 0.16, shadow = size * 0.07, align = 'center',
    rotate = 0, scale = 1, alpha = 1, time = 0, fill = '#fff', tracking = 0, glow = null } = o;
  if (alpha <= 0.001 || scale <= 0.001) return 0;
  if (typeof segs === 'string') segs = [[segs, fill]];
  ctx.save();
  ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rotate); ctx.scale(scale, scale);
  ctx.font = `${size}px ${font}`; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
  const widths = segs.map(([s]) => ctx.measureText(s).width), total = widths.reduce((a, b) => a + b, 0);
  let cx = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
  const yo = size * 0.06; // optical centring for caps fonts
  const pass = (fn) => { let px = cx; segs.forEach(([s, f], i) => { fn(s, px, f, widths[i]); px += widths[i]; }); };
  if (shadow) { ctx.fillStyle = 'rgba(10,4,20,0.55)'; pass((s, px) => { ctx.lineWidth = strokeW * 2; ctx.strokeStyle = 'rgba(10,4,20,0.55)'; ctx.strokeText(s, px, yo + shadow); ctx.fillText(s, px, yo + shadow); }); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW * 2; pass((s, px) => ctx.strokeText(s, px, yo)); }
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.35; }
  pass((s, px, f, w) => { ctx.fillStyle = paint(ctx, f, px, px + w, time, -size / 2, size / 2); ctx.fillText(s, px, yo); });
  ctx.shadowBlur = 0;
  ctx.restore();
  return total * scale;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Pill badge with gradient background.
export function badge(ctx, label, x, y, o = {}) {
  const { size = 54, bg = ['#ffe36b', '#ff9a1a'], fg = '#fff', scale = 1, alpha = 1, rotate = 0, time = 0, padX = size * 0.6, padY = size * 0.32, font = FONTS.label, stroke = COLORS.ink, textStroke = fg === COLORS.ink ? null : COLORS.ink } = o;
  if (alpha <= 0.001 || scale <= 0.001) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rotate); ctx.scale(scale, scale);
  ctx.font = `${size}px ${font}`;
  const w = ctx.measureText(label).width + padX * 2, h = size + padY * 2;
  roundRect(ctx, -w / 2, -h / 2 + 8, w, h, h / 2); ctx.fillStyle = 'rgba(10,4,20,0.5)'; ctx.fill();
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fillStyle = bg === 'rainbow' ? rainbow(ctx, -w / 2, w / 2, time) : paint(ctx, bg, 0, 0, time, -h / 2, h / 2); ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = stroke; ctx.stroke();
  ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-w / 2, -h / 2, w, h * 0.42); ctx.restore();
  ctx.restore();
  text(ctx, label, x, y, { size, font, fill: fg, stroke: textStroke, strokeW: size * 0.12, shadow: 0, scale, alpha, rotate });
}

// Roblox-style damage number. k = life progress 0..1.
export function damage(ctx, value, x, y, k, o = {}) {
  const { crit = false, size = 92, color = crit ? ['#fff36b', '#ff7a1a'] : ['#ffffff', '#d7e3ff'], time = 0, rise = 150, critLabel = true } = o;
  if (k < 0 || k > 1) return;
  const s = (k < 0.12 ? ease.outBack(k / 0.12, 3) * 1.25 : lerp(1.25, 1, clamp((k - 0.12) / 0.2))) * (crit ? 1.25 : 1);
  const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
  const yy = y - ease.outCubic(k) * rise;
  const rot = crit ? -0.12 : -0.05;
  text(ctx, value, x, yy, { size, font: FONTS.hook, fill: color, scale: s, alpha: a, rotate: rot, time, strokeW: size * 0.14 });
  if (crit && critLabel) text(ctx, 'CRIT!', x + 4, yy - size * 0.95 * s, { size: size * 0.42, fill: COLORS.red, scale: s, alpha: a, rotate: rot, stroke: '#fff', strokeW: size * 0.05, shadow: 0 });
}

// HP bar with trailing "ghost" damage. frac/ghost in 0..1.
export function hpBar(ctx, x, y, w, frac, ghost, o = {}) {
  const { h = 38, label = '', hpText = '', alpha = 1, scale = 1, fillColor = null, time = 0, shake = 0, rarityFill = null } = o;
  if (alpha <= 0.001) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x + Math.sin(time * 80) * shake * 10, y); ctx.scale(scale, scale);
  roundRect(ctx, -w / 2 - 8, -h / 2 - 8 + 6, w + 16, h + 16, (h + 16) / 2); ctx.fillStyle = 'rgba(10,4,20,0.45)'; ctx.fill();
  roundRect(ctx, -w / 2 - 8, -h / 2 - 8, w + 16, h + 16, (h + 16) / 2); ctx.fillStyle = COLORS.ink; ctx.fill();
  roundRect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fillStyle = '#2b2236'; ctx.fill();
  ctx.save(); roundRect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.clip();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-w / 2, -h / 2, w * clamp(ghost), h);
  const col = fillColor || (frac > 0.5 ? ['#7dff6a', '#2fc04a'] : frac > 0.2 ? ['#ffe14a', '#ff9d1a'] : ['#ff6a6a', '#e0102e']);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
  ctx.fillStyle = g; ctx.fillRect(-w / 2, -h / 2, w * clamp(frac), h);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-w / 2, -h / 2, w, h * 0.38);
  ctx.restore();
  ctx.restore();
  if (label) text(ctx, label, x, y - h * scale - 26 * scale, { size: 50 * scale, font: FONTS.label, fill: rarityFill || '#fff', strokeW: 7 * scale, shadow: 0, alpha, time });
  if (hpText) text(ctx, hpText, x, y + 1, { size: 30 * scale, font: FONTS.label, fill: '#fff', strokeW: 5 * scale, shadow: 0, alpha });
}

// Big stopwatch "0:04.2" with fixed digit advance so it does not jitter.
export function timer(ctx, seconds, x, y, o = {}) {
  const { size = 120, fill = '#fff', alpha = 1, scale = 1, font = FONTS.label, align = 'center' } = o;
  const m = Math.floor(seconds / 60), s = seconds - m * 60;
  const str = `${m}:${Math.floor(s).toString().padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
  ctx.save(); ctx.font = `${size}px ${font}`; const adv = ctx.measureText('0').width; ctx.restore();
  const widthOf = (ch) => (ch === ':' || ch === '.' ? adv * 0.45 : adv);
  const total = [...str].reduce((a, ch) => a + widthOf(ch), 0) * scale;
  let px = align === 'center' ? x - total / 2 : align === 'left' ? x : x - total;
  for (const ch of str) {
    const w = widthOf(ch) * scale;
    text(ctx, ch, px + w / 2, y, { size, font, fill, scale, alpha, strokeW: size * 0.12, shadow: size * 0.05 });
    px += w;
  }
}

export function gemIcon(ctx, x, y, r, color = '#4ff3ff', alpha = 1, rot = 0) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, -r * 0.25); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, -r * 0.25); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = r * 0.18; ctx.strokeStyle = COLORS.ink; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.25); ctx.lineTo(r * 0.8, -r * 0.25); ctx.moveTo(0, -r); ctx.lineTo(-r * 0.25, -r * 0.25); ctx.lineTo(0, r);
  ctx.lineWidth = r * 0.08; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
  ctx.restore();
}

// Flat pickaxe glyph for the logo lockup.
function pickGlyph(ctx, x, y, s, rot, time) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#7a4a26'; ctx.strokeStyle = COLORS.ink; ctx.lineWidth = 10;
  roundRect(ctx, -12, -20, 24, 190, 10); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-120, -10); ctx.quadraticCurveTo(0, -95, 120, -10); ctx.lineTo(95, 5); ctx.quadraticCurveTo(0, -45, -95, 5); ctx.closePath();
  ctx.fillStyle = rainbow(ctx, -120, 120, time, 95, 65); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// Game lockup + CTA. k = 0..1 entrance progress.
export function endCard(ctx, k, time, lang, o = {}) {
  const { y = 860, cta = true, dim = true, alpha = 1 } = o;
  if (alpha <= 0.001) return;
  if (alpha < 0.999) { // text() sets absolute alpha, so fade the whole card through a layer
    const layer = (endCard.layer ||= Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const lc = layer.getContext('2d'); lc.clearRect(0, 0, W, H);
    endCard(lc, k, time, lang, { ...o, alpha: 1 });
    ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(layer, 0, 0); ctx.restore();
    return;
  }
  const T = { pt: { cta: 'JOGUE GRÁTIS NO ROBLOX' }, en: { cta: 'PLAY FREE ON ROBLOX' } }[lang];
  const a = clamp(k * 3);
  if (dim) { ctx.save(); ctx.fillStyle = `rgba(8,3,18,${0.55 * a})`; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  const kk = (d) => ease.outBack(clamp((k * 1.0 - d) / 0.35), 2);
  pickGlyph(ctx, 540, y - 330, 0.95 * kk(0), -0.12 + Math.sin(time * 3) * 0.04, time);
  text(ctx, 'ANIME', 540, y - 168, { size: 92, fill: ['#ff9bf0', '#ff3fbf'], scale: kk(0.05), rotate: -0.04, tracking: 6 });
  text(ctx, 'MINING', 540, y - 30, { size: 205, fill: ['#fff6a8', '#ffcc1a', '#ff8a00'], scale: kk(0.1), rotate: -0.04, strokeW: 28 });
  const rib = kk(0.18);
  if (rib > 0) {
    ctx.save(); ctx.translate(540, y + 105); ctx.rotate(-0.04); ctx.scale(rib, rib);
    roundRect(ctx, -330, -58, 660, 116, 26); ctx.fillStyle = COLORS.ink; ctx.fill();
    roundRect(ctx, -318, -48, 636, 96, 20); const g = ctx.createLinearGradient(0, -48, 0, 48); g.addColorStop(0, '#9b5cff'); g.addColorStop(1, '#5a1fd6'); ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    text(ctx, 'SIMULATOR', 540, y + 105, { size: 92, fill: '#fff', scale: rib, rotate: -0.04, strokeW: 10, shadow: 0, tracking: 4 });
  }
  if (cta) {
    const c = kk(0.32), pulse = 1 + Math.sin(time * 10) * 0.035;
    badge(ctx, T.cta, 540, y + 300, { size: 58, bg: ['#7dff6a', '#18b34a'], scale: c * pulse });
  }
}

// Simple caption bar (for sound-off viewers), white box style.
export function caption(ctx, str, x, y, o = {}) {
  const { size = 56, alpha = 1, scale = 1, bg = '#ffffff', fg = COLORS.ink } = o;
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.font = `${size}px ${FONTS.label}`;
  const w = ctx.measureText(str).width + 50, h = size + 30;
  roundRect(ctx, -w / 2, -h / 2, w, h, 18); ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(str, 0, size * 0.06);
  ctx.restore();
}
