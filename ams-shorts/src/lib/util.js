// Deterministic math helpers. Everything in the engine is a pure function of time,
// so any frame can be rendered in any order and audio/video stay in sync.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) => t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
};

// Keyframes: [[time, value, easeName?], ...]. value may be a number or an array.
export function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1, e] = keys[i + 1];
    if (t <= t1) {
      const u = (ease[e || 'inOutCubic'])(clamp((t - t0) / (t1 - t0)));
      if (Array.isArray(v0)) return v0.map((x, j) => lerp(x, v1[j], u));
      return lerp(v0, v1, u);
    }
  }
  return keys[keys.length - 1][1];
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1D value noise in [-1, 1], used for camera shake and flicker.
export function noise1(x, seed = 0) {
  const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

// Envelope of a decaying impulse that started at t0.
export const decay = (t, t0, rate) => (t < t0 ? 0 : Math.exp(-(t - t0) * rate));
// Short attack + decay pulse, peak 1 at t0 + attack.
export function pulse(t, t0, attack, release) {
  if (t < t0) return 0;
  const d = t - t0;
  return d < attack ? d / attack : Math.exp(-(d - attack) * release);
}

export const fmt = {
  // 1234567 -> "1,2M" (pt) / "1.2M" (en)
  short(n, lang = 'pt') {
    const sep = lang === 'pt' ? ',' : '.';
    const f = (v, s) => (v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString().replace('.', sep)) + s;
    if (n >= 1e9) return f(n / 1e9, 'B');
    if (n >= 1e6) return f(n / 1e6, 'M');
    if (n >= 1e3) return f(n / 1e3, 'K');
    return Math.round(n).toString();
  },
};
