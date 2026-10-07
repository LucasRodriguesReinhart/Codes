// V002 — COMMON vs MYTHIC (15s). Split screen: same ore, same camera; stopwatch decides.
import * as THREE from 'three';
import { placeCamera, impulse, mining } from '../engine.js';
import { makeOre } from '../lib/ore.js';
import { makeUnit, makeBeam } from '../lib/actors.js';
import { text, badge, damage, hpBar, endCard, pop, timer, roundRect, RARITY, COLORS, FONTS, W, H } from '../lib/overlay.js';
import { clamp, ease, lerp, smooth, fmt, noise1 } from '../lib/util.js';
import { themedScene, hitFX, breakFX, speedLines } from './kit.js';
export { timeline } from './v002.timeline.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TOP = [0, 0.5, 1, 0.5], BOT = [0, 0, 1, 0.5]; // viewport rects (bottom-left origin)

export class Video {
  constructor(eng, tl, lang) {
    this.eng = eng; this.tl = tl; this.lang = lang;
    this.halves = ['common', 'mythic'].map((kind, i) => {
      const sc = themedScene('arena', { seed: 13, clear: [[0, 1, 13]] }); // identical world for a fair test
      const unit = makeUnit(kind);
      const ore = makeOre('diamond', 77);
      ore.group.position.set(0, 0, 2.4);
      sc.scene.add(ore.group); sc.scene.add(unit.root);
      unit.root.scale.setScalar(0.78);
      unit.root.position.set(0, 0, kind === 'common' ? 0.75 : -0.6);
      ore.group.updateMatrixWorld(true);
      ore.setHitFrom(V3(0, 1.2, 0));
      const cam = new THREE.PerspectiveCamera(40, 1080 / 960, 0.1, 1500);
      const half = { kind, sc, unit, ore, cam, rect: i === 0 ? TOP : BOT };
      if (kind === 'mythic') { half.beam = makeBeam('#ffcf3a'); sc.scene.add(half.beam); }
      return half;
    });
    const [C, M] = this.halves;

    // Common: steady punches, last one lands exactly on the break time.
    const n = Math.floor((tl.commonBreakElapsed - 0.2) / tl.comm.every) + 1;
    C.hits = Array.from({ length: n }, (_, i) => ({ t: tl.commonBreakElapsed - (n - 1 - i) * tl.comm.every, dmg: tl.hp / n, power: 0.25, side: i % 2 ? 1 : -1 }));
    const contact = C.ore.group.position.clone().add(V3(0, 1.1, -C.ore.radius * 0.8));
    C.hits.forEach((h, i) => hitFX(C.sc.fx, h.t, contact, i === n - 1 ? 0.9 : 0.25, C.ore, 1000 + i));
    breakFX(C.sc.fx, tl.commonBreakElapsed, C.ore, 0.9, 1999);

    // Mythic: beam ticks then a final blast (times are elapsed-from-GO).
    const m = tl.myth;
    M.hits = [];
    for (let t = m.beamFrom; t < m.beamTo - 1e-6; t += m.tick) M.hits.push({ t: t - tl.start, dmg: m.tickDmg, power: 0.35, tick: true });
    const ticked = M.hits.reduce((a, h) => a + h.dmg, 0);
    M.hits.push({ t: m.final - tl.start, dmg: tl.hp - ticked, power: 2 }); // the blast finishes whatever HP is left
    const mc = M.ore.group.position.clone().add(V3(0, 1.0, -M.ore.radius * 0.7));
    M.hits.forEach((h, i) => hitFX(M.sc.fx, h.t, mc, h.power, M.ore, 3000 + i));
    breakFX(M.sc.fx, m.final - tl.start, M.ore, 1.5, 3999);
    this.ratio = Math.round(tl.commonBreakElapsed / tl.mythTime);
  }

  // Stopwatch time for each half (seconds since GO). Top half runs a time-lapse.
  elapsedCommon(e) {
    const { start, lapse, commonBreakElapsed, commonBreakEdit } = this.tl;
    if (e < lapse.from) return e - start;
    const a = lapse.from - start, b = commonBreakElapsed - (commonBreakEdit - lapse.to);
    if (e < lapse.to) return lerp(a, b, ease.inOutCubic((e - lapse.from) / (lapse.to - lapse.from)));
    return b + (e - lapse.to);
  }
  elapsedMythic(e) { return e - this.tl.start; }

  update(e) {
    const tl = this.tl, [C, M] = this.halves;
    const fx = { time: e, ca: 0.003, vignette: 0.3, bloom: 0.6 };
    this.state = {};
    for (const h of this.halves) {
      const el = h.kind === 'common' ? this.elapsedCommon(e) : this.elapsedMythic(e);
      const m = mining(el, h.hits, tl.hp);
      const broken = m.hp <= 0;
      const kick = m.sinceHit < 10 ? Math.exp(-m.sinceHit * 20) : 0;
      h.ore.update(m.damage, kick * (h.kind === 'mythic' && m.last?.tick ? 0.4 : 1), el, !broken);
      h.sc.fx.update(el);
      const u = h.unit;
      if (h.kind === 'common') {
        const cheer = e > tl.commonBreakEdit + 0.15 ? smooth((e - tl.commonBreakEdit - 0.15) / 0.2) : 0;
        u.pose({ time: el, untilHit: broken ? 10 : m.untilHit, sinceHit: m.sinceHit, side: m.next ? m.next.side : 1 });
        if (cheer) { u.armL.rotation.set(-2.9 * cheer, 0, 0.3 * cheer); u.armR.rotation.set(-2.9 * cheer, 0, -0.3 * cheer); u.body.position.y += Math.abs(Math.sin(e * 9)) * 0.35 * cheer; }
      } else {
        const blasting = el + tl.start >= tl.myth.beamFrom && el + tl.start < tl.myth.final + 0.1;
        const asleep = e > tl.lapse.from + 0.2 && e < tl.results.t0;
        const auraK = e < tl.start ? 1 : asleep ? 0.0 : blasting ? 1 : 0.8;
        u.pose({ time: el, auraK, blast: blasting ? 1 : 0, untilHit: 10, sinceHit: 10 });
        if (asleep) { u.headPivot.rotation.x = 0.35; u.body.position.y = 0.2 + Math.sin(e * 2) * 0.03; }
        else u.headPivot.rotation.x = 0;
        const beamOn = el + tl.start >= tl.myth.beamFrom && el + tl.start < tl.myth.beamTo + 0.12;
        const finalK = clamp(1 - Math.abs(el - (tl.myth.final - tl.start)) / 0.12);
        const handC = u.handWorld(1).add(u.handWorld(-1)).multiplyScalar(0.5);
        const k = beamOn ? 0.85 + 0.15 * noise1(e * 30) : finalK;
        h.beam.userData.set(handC, h.ore.center(), beamOn ? 0.22 + 0.04 * Math.sin(e * 50) : 0.6 * finalK, e, k);
      }
      const shake = Math.min(1.5, impulse(el, h.hits.filter((x) => !x.tick).map((x) => ({ t: x.t, power: x.power })), 9) * 0.8 + (h.kind === 'mythic' && h.beam.visible ? 0.15 : 0));
      placeCamera(h.cam, [7.5, 2.6, 5.0], [0, 1.7, 1.35], { fov: 39, shake, t: e, seed: h.kind === 'common' ? 1 : 2 });
      this.state[h.kind] = { el, m, broken };
    }
    // Global post: impact frames on the mythic blast (whole frame, it's the money shot).
    const fin = tl.myth.final, d = Math.round((e - fin) * tl.fps);
    if (d === 0 || d === 1) Object.assign(fx, { invert: 1, sat: 0, contrast: 2.6, bloom: 0.2, ca: 0.02 });
    else if (d === 2) fx.flash = 0.55;
    const cut = e - tl.start; if (cut >= 0 && cut < 0.1) fx.flash = Math.max(fx.flash || 0, 0.35 * (1 - cut / 0.1));
    this.eng.setViews([{ scene: C.sc.scene, camera: C.cam, rect: TOP }, { scene: M.sc.scene, camera: M.cam, rect: BOT }]);
    this.eng.fx(fx);
  }

  draw2d(ctx, e) {
    const tl = this.tl, T = tl.text, lang = this.lang, [C, M] = this.halves, S = this.state;
    const P = (h, v) => this.eng.project(v, h.cam, h.rect);

    // Per-half game layer: HP bar + damage numbers.
    for (const h of this.halves) {
      const st = S[h.kind], yMin = h.kind === 'common' ? 390 : 1190, yMax = h.kind === 'common' ? 880 : 1450;
      if (!st.broken && e < tl.results.t0) {
        const top = P(h, h.ore.top().add(V3(0, 0.3, 0)));
        hpBar(ctx, top.x, clamp(top.y, yMin, yMax), 330, st.m.frac, st.m.ghost, { label: T.ore, hpText: `${fmt.short(st.m.hp, lang)} / ${fmt.short(tl.hp, lang)}`, time: e, shake: Math.exp(-st.m.sinceHit * 14) * 0.5, scale: 0.9 });
      }
      const inLapse = h.kind === 'common' && e > tl.lapse.from && e < tl.lapse.to;
      const c = P(h, h.ore.center());
      h.hits.forEach((x, i) => {
        if (inLapse) return;
        const k = (st.el - x.t) / 0.7;
        if (k < 0 || k > 1 || (x.tick && i % 2)) return;
        const big = x.power >= 1;
        damage(ctx, fmt.short(x.dmg, lang), clamp(c.x - 60 + ((i * 37) % 5) * 45, 200, 820), clamp(c.y + 30 - ((i * 53) % 3) * 40, yMin + 250, yMax + 60), k,
          { size: big ? 130 : 62, crit: big, critLabel: false, color: big ? 'rainbow' : h.kind === 'mythic' ? [COLORS.yellow, '#ff9a1a'] : undefined, time: e, rise: big ? 60 : 110 });
      });
    }

    // Time-lapse treatment (top half only).
    if (e > tl.lapse.from && e < tl.lapse.to + 0.1) {
      const k = clamp(Math.min((e - tl.lapse.from) / 0.15, (tl.lapse.to + 0.1 - e) / 0.2));
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, 955); ctx.clip();
      speedLines(ctx, 0.8 * k, e, { cx: 540, cy: 480, count: 50 });
      ctx.restore();
      badge(ctx, T.lapse, W / 2, 560, { size: 64, bg: ['#ff5a5a', '#c4102a'], scale: k * (1 + 0.06 * Math.sin(e * 25)), alpha: k });
    }
    // Mythic waits... asleep.
    if (e > tl.lapse.from + 0.3 && e < tl.results.t0) {
      const head = P(M, M.unit.headPivot.getWorldPosition(V3()).add(V3(0.5, 1.6, 0)));
      for (let i = 0; i < 3; i++) {
        const ph = ((e - tl.lapse.from) * 0.8 + i / 3) % 1;
        text(ctx, 'Z', head.x + ph * 90 + i * 10, Math.max(1170, head.y) - ph * 120, { size: 50 + ph * 40, font: FONTS.label, alpha: Math.sin(ph * Math.PI), strokeW: 7, shadow: 0, fill: '#cfe4ff' });
      }
    }

    // Divider + VS.
    ctx.save();
    ctx.fillStyle = COLORS.ink; ctx.fillRect(0, 952, W, 16);
    const lg = ctx.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, '#9aa3ad'); lg.addColorStop(0.5, '#ffffff'); lg.addColorStop(1, '#ffcf3a');
    ctx.fillStyle = lg; ctx.fillRect(0, 957, W, 6);
    ctx.restore();

    // Corner labels + stopwatches.
    const elC = clamp(this.elapsedCommon(e), 0, tl.commonBreakElapsed), elM = clamp(this.elapsedMythic(e), 0, tl.mythTime);
    const showHud = e >= tl.start - 0.05 && e < tl.results.t0;
    if (showHud) {
      const a = pop(e, tl.start - 0.05).a;
      badge(ctx, T.common, 200, 250, { size: 50, bg: RARITY.common.c, fg: '#fff', alpha: a });
      badge(ctx, T.mythic, 200, 1060, { size: 50, bg: 'rainbow', time: e, alpha: a });
      const doneC = e >= tl.commonBreakEdit, doneM = this.elapsedMythic(e) >= tl.mythTime;
      timer(ctx, elC, 920, 250, { size: 92, align: 'right', fill: doneC ? [COLORS.green, '#18b34a'] : '#fff', alpha: a, scale: doneC ? 1 + 0.25 * Math.exp(-(e - tl.commonBreakEdit) * 8) : 1 });
      timer(ctx, elM, 920, 1060, { size: 92, align: 'right', fill: doneM ? [COLORS.green, '#18b34a'] : '#fff', alpha: a, scale: doneM ? 1 + 0.25 * Math.exp(-(e - tl.myth.final) * 8) : 1 });
    }

    // HOOK: title stack readable on frame 0.
    if (e < tl.start + 0.15) {
      const out = clamp((e - tl.start + 0.1) / 0.25), s = 1 - out * 0.4, a = 1 - out;
      const punch = 1 + 0.12 * Math.exp(-Math.max(0, e - 0.12) * 9) * (e > 0.12 ? 1 : 0);
      text(ctx, T.common, W / 2, 840, { size: 150, fill: ['#ffffff', '#b9c1cb'], scale: s * punch, alpha: a, rotate: -0.04 });
      text(ctx, T.mythic, W / 2, 1090, { size: 165, fill: 'rainbow', time: e, scale: s * punch, alpha: a, rotate: -0.04, glow: '#ffcf3a' });
      const sb = pop(e, 0.5);
      text(ctx, T.sub, W / 2, 1420, { size: 66, font: FONTS.hook, scale: sb.s * s, alpha: sb.a * a, fill: COLORS.yellow });
    }
    // VS medallion: always on the divider.
    {
      const s = e < tl.start ? 1.25 + 0.1 * Math.sin(e * 12) : 0.8;
      ctx.save(); ctx.translate(W / 2, 960); ctx.scale(s, s); ctx.rotate(-0.08);
      ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.fillStyle = COLORS.ink; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); const g = ctx.createLinearGradient(0, -62, 0, 62); g.addColorStop(0, '#ff5a5a'); g.addColorStop(1, '#b0102a'); ctx.fillStyle = g; ctx.fill();
      ctx.restore();
      text(ctx, 'VS', W / 2, 962, { size: 78, scale: s, rotate: -0.08, strokeW: 9, shadow: 0 });
    }
    // GO!
    {
      const g = pop(e, tl.start, tl.start + 0.45, { inDur: 0.15 });
      text(ctx, T.go, W / 2, 960, { size: 230, fill: [COLORS.green, '#18b34a'], scale: g.s * 1.1, alpha: g.a, rotate: -0.06 });
    }

    // RESULTS
    if (e >= tl.results.t0 && e < tl.end.t0) {
      const k = smooth((e - tl.results.t0) / 0.2);
      ctx.save(); ctx.fillStyle = `rgba(8,3,18,${0.5 * k})`; ctx.fillRect(0, 0, W, H); ctx.restore();
      const a = pop(e, tl.results.t0 + 0.15), b = pop(e, tl.results.t0 + 0.4);
      badge(ctx, T.common, W / 2, 380, { size: 56, bg: RARITY.common.c, scale: a.s, alpha: a.a });
      timer(ctx, tl.commonBreakElapsed, W / 2, 560, { size: 200, fill: ['#ffffff', '#ffb0b0'], scale: a.s, alpha: a.a });
      badge(ctx, T.mythic, W / 2, 1220, { size: 56, bg: 'rainbow', time: e, scale: b.s, alpha: b.a });
      timer(ctx, tl.mythTime, W / 2, 1400, { size: 200, fill: [COLORS.green, '#18b34a'], scale: b.s, alpha: b.a });
      if (e < tl.ask.t0) {
        const st = e - tl.results.t0 - 0.75, sc = st < 0 ? 0 : st < 0.12 ? lerp(2.6, 1, ease.outCubic(st / 0.12)) : 1 + 0.03 * Math.sin(e * 8);
        text(ctx, T.faster(this.ratio), W / 2, 960, { size: 120, fill: 'rainbow', time: e, scale: sc, alpha: st < 0 ? 0 : 1, rotate: -0.05, glow: '#ffcf3a' });
      } else {
        const q = pop(e, tl.ask.t0), q2 = pop(e, tl.ask.t0 + 0.2);
        text(ctx, T.ask, W / 2, 935, { size: lang === 'pt' ? 104 : 86, fill: [COLORS.yellow, '#ff9a1a'], scale: q.s, alpha: q.a, rotate: -0.04 });
        badge(ctx, T.askSub, W / 2, 1060, { size: 50, bg: ['#ffffff', '#d9dde3'], fg: COLORS.ink, scale: q2.s, alpha: q2.a });
      }
    }
    if (e >= tl.end.t0) endCard(ctx, clamp((e - tl.end.t0) / 0.5), e - tl.end.t0, lang, { y: 860 });
  }
}
