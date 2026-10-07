// V001 — "0 → OP" (12s). Result-first hook, rewind, 3 upgrades on beat, OP one-hit payoff, end card.
import * as THREE from 'three';
import { placeCamera, impulse, mining } from '../engine.js';
import { makeOre } from '../lib/ore.js';
import { makeAvatar, makePickaxe, makeAura } from '../lib/actors.js';
import { lightPillar } from '../lib/fx.js';
import { text, badge, damage, hpBar, endCard, pop, gemIcon, RARITY, COLORS, FONTS, W } from '../lib/overlay.js';
import { clamp, ease, kf, lerp, pulse, smooth, fmt } from '../lib/util.js';
import { themedScene, sharedRainbow, hitFX, breakFX, rays, speedLines } from './kit.js';
export { timeline } from './v001.timeline.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Video {
  constructor(eng, tl, lang) {
    this.eng = eng; this.tl = tl; this.lang = lang;
    this.cam = new THREE.PerspectiveCamera(50, 1080 / 1920, 0.1, 1500);
    this.S = {
      shadow: themedScene('shadow', { seed: 11 }),
      starter: themedScene('starter', { seed: 3 }),
      desert: themedScene('desert', { seed: 5 }),
      frost: themedScene('frost', { seed: 8 }),
      arena: themedScene('arena', { seed: 13 }),
    };
    this.avatar = makeAvatar();
    this.aura = makeAura('#ff4fe0', 3.2, 1.25);
    this.avatar.root.add(this.aura);
    const rb = sharedRainbow();
    this.picks = Object.fromEntries(['wood', 'iron', 'crystal', 'gold', 'mythic'].map((k) => [k, makePickaxe(k, rb)]));
    this.pillar = lightPillar('#ff7af0', 60, 1.6);
    this.S.shadow.scene.add(this.pillar);

    // One ore per scene, placed where the pickaxe tip lands at contact.
    const oreFor = { shadow: 'mythic', starter: 'stone', desert: 'copper', frost: 'gold', arena: 'diamond' };
    const pickFor = { shadow: 'mythic', starter: 'wood', desert: 'iron', frost: 'crystal', arena: 'gold' };
    this.ores = {};
    for (const [k, sc] of Object.entries(this.S)) {
      const ore = makeOre(oreFor[k], 21 + k.length);
      this.avatar.setTool(this.picks[pickFor[k]]);
      sc.scene.add(this.avatar.root);
      this.avatar.pose({ untilHit: 0, time: 0 });
      const tip = this.avatar.toolTipWorld();
      ore.group.position.set(0, 0, tip.z + ore.radius * 0.72);
      sc.scene.add(ore.group);
      ore.group.updateMatrixWorld(true);
      ore.setHitFrom(V3(0, ore.radius * 0.9, 0));
      this.ores[k] = ore;
      sc.tip = tip;
    }

    // Schedule all impact effects (times are simulation time).
    const sh = this.S.shadow, mo = this.ores.shadow;
    this.hookHits = [{ t: tl.hook.hit, dmg: 1e9, power: 2 }];
    hitFX(sh.fx, tl.hook.hit, sh.tip, 2, mo, 101); breakFX(sh.fx, tl.hook.hit, mo, 1.6, 102);
    this.opHits = [{ t: tl.op.hit, dmg: 1e9, power: 2.2 }];
    hitFX(sh.fx, tl.op.hit, sh.tip, 2.2, mo, 201); breakFX(sh.fx, tl.op.hit, mo, 1.8, 202);
    const st = this.S.starter;
    this.starterHits = tl.starter.hits.map((t) => ({ t, dmg: tl.starter.dmg, power: 0.15 }));
    this.starterHits.forEach((h, i) => hitFX(st.fx, h.t, st.tip, 0.12, this.ores.starter, 300 + i));
    this.upHits = {};
    tl.upgrades.forEach((u, ui) => {
      const sc = this.S[u.theme], ore = this.ores[u.theme];
      const hits = u.hits.map((t) => ({ t, dmg: u.dmg, power: 0.5 + ui * 0.25 }));
      hits.forEach((h, i) => hitFX(sc.fx, h.t, sc.tip, h.power, ore, 400 + ui * 10 + i));
      breakFX(sc.fx, hits[hits.length - 1].t, ore, 0.8 + ui * 0.25, 500 + ui);
      this.upHits[u.id] = hits;
    });
    this.dmgSteps = [
      { t: 1.0, v: tl.starter.dmg, r: 'common' },
      ...tl.upgrades.map((u) => ({ t: u.t0 + 0.1, v: u.dmg, r: u.rarity })),
      { t: tl.op.t0 + 0.1, v: tl.op.dmg, r: 'mythic' },
    ];
  }

  // Edit time -> simulation time (speed ramps and the rewind live here).
  sim(e) {
    const { hook, op } = this.tl;
    if (e < 0.8) return e < hook.hit ? e : hook.hit + (e - hook.hit) * hook.slow;
    if (e < 1.0) { const from = hook.hit + (0.8 - hook.hit) * hook.slow; return lerp(from, 0, ease.inOutCubic((e - 0.8) / 0.2)); }
    if (e >= op.hit && e < op.t1) return e < op.slowUntil ? op.hit + (e - op.hit) * op.slow : op.hit + (op.slowUntil - op.hit) * op.slow + (e - op.slowUntil);
    return e;
  }

  shot(e) {
    const tl = this.tl;
    if (e < 0.8) return { id: 'hook', key: 'shadow' };
    if (e < 1.0) return { id: 'rewind', key: 'shadow' };
    if (e < tl.starter.t1) return { id: 'starter', key: 'starter' };
    for (const u of tl.upgrades) if (e < u.t0 + 1.6) return { id: u.id, key: u.theme, u };
    if (e < tl.op.t1) return { id: 'op', key: 'shadow' };
    return { id: 'end', key: 'shadow' };
  }

  update(e) {
    const tl = this.tl, s = this.sim(e), sh = this.shot(e), sc = this.S[sh.key], ore = this.ores[sh.key], av = this.avatar;
    this.cur = { e, s, sh, sc, ore };
    sc.scene.add(av.root);
    let hits = [], tool = 'mythic', raise = 0, charge = 0, auraK = 0, pillarK = 0, camFx = {};
    const fx = { time: e, ca: 0.003, vignette: 0.42 };

    if (sh.id === 'hook' || sh.id === 'rewind') {
      hits = this.hookHits; auraK = 0.9;
      const k = clamp(e / 0.8);
      placeCamera(this.cam, [lerp(4.9, 4.4, k), lerp(1.0, 0.85, k), lerp(6.6, 6.0, k)], [0, 1.7, 1.5], { fov: 50, roll: -0.07 });
    } else if (sh.id === 'starter') {
      hits = this.starterHits; tool = 'wood';
      const k = (e - tl.starter.t0) / 1.4;
      placeCamera(this.cam, [lerp(6.4, 5.8, k), 2.1, lerp(3.6, 3.3, k)], [0, 1.15, 1.45], { fov: 42, roll: 0.05 });
    } else if (sh.u) {
      const u = sh.u, k = e - u.t0;
      hits = this.upHits[u.id]; tool = u.pick;
      raise = k < 0.42 ? ease.outBack(clamp(k / 0.12)) * (1 - smooth((k - 0.3) / 0.12)) : 0;
      if (k < 0.42) { const kk = k / 0.42; placeCamera(this.cam, [lerp(2.9, 2.4, kk), 1.6, lerp(7.6, 6.9, kk)], [0, 2.9, 0.3], { fov: 48, roll: -0.04 }); }
      else {
        const kk = (k - 0.42) / 1.18;
        if (u.id === 'up1') placeCamera(this.cam, [lerp(3.0, 2.6, kk), lerp(4.9, 4.5, kk), lerp(-5.6, -5.0, kk)], [0, 1.0, 2.6], { fov: 52, roll: 0.03 });
        else if (u.id === 'up2') placeCamera(this.cam, [lerp(-7.6, -6.9, kk), 2.6, lerp(6.6, 6.0, kk)], [0, 1.3, 1.4], { fov: 44, roll: -0.05 });
        else placeCamera(this.cam, [lerp(5.7, 5.1, kk), 1.3, lerp(6.9, 6.2, kk)], [0, 1.4, 1.4], { fov: 48, roll: 0.06 });
      }
    } else if (sh.id === 'op') {
      hits = this.opHits; const k = e - tl.op.t0;
      raise = k < 0.42 ? ease.outBack(clamp(k / 0.12)) * (1 - smooth((k - 0.3) / 0.12)) : 0;
      pillarK = k < 0.6 ? pulse(k, 0, 0.05, 3) * 0.6 : 0;
      const m = mining(s, hits, 1);
      if (e >= tl.op.equipEnd && m.untilHit > 0.06 && m.untilHit < 10) charge = smooth((e - tl.op.equipEnd) / 0.25);
      auraK = e < tl.op.equipEnd ? 0.4 : e < tl.op.hit ? 0.4 + 0.6 * smooth((e - tl.op.equipEnd) / 0.38) : 1;
      if (k < 0.42) { const kk = k / 0.42; placeCamera(this.cam, [lerp(-4.8, -4.2, kk), 1.4, lerp(6.6, 6.0, kk)], [0, 2.9, 0.2], { fov: 50, roll: 0.05 }); }
      else if (e < tl.op.hit) {
        const kk = smooth((e - tl.op.equipEnd) / 0.38);
        placeCamera(this.cam, [lerp(-6.6, -5.0, kk), lerp(1.0, 0.6, kk), lerp(7.6, 6.0, kk)], [0, 1.8, 1.4], { fov: lerp(52, 45, kk), roll: lerp(0.02, 0.1, kk) });
      } else {
        const kk = clamp((e - tl.op.hit) / (tl.op.t1 - tl.op.hit));
        placeCamera(this.cam, [lerp(-5.0, -7.6, ease.outCubic(kk)), lerp(0.6, 2.2, kk), lerp(6.0, 9.4, ease.outCubic(kk))], [0, 1.6, 1.3], { fov: 48, roll: lerp(0.1, 0.02, kk) });
      }
    } else { // end card backdrop: slow orbit, ore gone
      const k = (e - tl.end.t0) / 1.6, a = lerp(0.5, 0.9, k);
      auraK = 0.35;
      placeCamera(this.cam, [Math.sin(a) * 7.8, 1.8, Math.cos(a) * 7.8], [0, 1.9, 0.5], { fov: 46 });
    }

    // Avatar & tool
    av.setTool(this.picks[tool]);
    const m = mining(s, hits, hits.length ? hits.reduce((a, h) => a + h.dmg, 0) : 1);
    av.pose({ sinceHit: m.sinceHit, untilHit: m.untilHit, time: s, charge: charge * (m.untilHit > 0.06 ? 1 : 0), raise, power: m.next ? m.next.power : 1 });
    this.aura.userData.update(s, auraK * (tool === 'mythic' ? 1 : 0));
    this.pillar.userData.set(s, pillarK);
    this.pillar.position.copy(V3(0, 0, 0));

    // Ore: broken ore disappears; starter ore never breaks.
    const maxHp = sh.id === 'starter' ? tl.starter.hp : sh.u ? sh.u.hp : 1e9;
    const om = mining(s, hits, maxHp);
    const broken = sh.id !== 'starter' && hits.length && om.hp <= 0;
    const kick = om.sinceHit < 10 ? Math.exp(-om.sinceHit * 18) : 0;
    ore.update(sh.id === 'starter' ? om.damage * 6 : om.damage, kick, s, !broken && sh.id !== 'end');
    sc.fx.update(s);
    this.cur.om = om; this.cur.hits = hits;

    // Camera shake + post from impacts (in sim time, so slow-mo stretches it too).
    const shake = impulse(s, hits.map((h) => ({ t: h.t, power: h.power })), 7) * 0.9;
    placeCamera(this.cam, this.cam.position.toArray(), this.cam.getWorldDirection(V3()).add(this.cam.position).toArray(), { fov: this.cam.fov, shake: Math.min(1.6, shake), t: e, seed: 3 });
    // Flash/zoom use edit time: hits sit at the start of each slow-mo, so they stay 1-2 frames long.
    const big = impulse(e, hits.filter((h) => h.power >= 1).map((h) => ({ t: h.t, power: h.power >= 1.5 ? 1 : 0.35 })), 14);
    fx.flash = impulse(e, hits.filter((h) => h.power >= 1).map((h) => ({ t: h.t, power: h.power >= 1.5 ? 0.7 : 0.25 })), 32);
    fx.ca = 0.003 + big * 0.03 + shake * 0.006;
    fx.zoomBlur = big * 0.12;
    fx.bloom = sh.key === 'shadow' ? 0.75 : 0.5;
    // Cut transitions: 3-frame zoom punch into each new shot.
    const cuts = [1.0, ...tl.upgrades.map((u) => u.t0), tl.op.t0, tl.end.t0];
    for (const c of cuts) { const d = e - c; if (d >= 0 && d < 0.12) { fx.zoomBlur = Math.max(fx.zoomBlur, 0.2 * (1 - d / 0.12)); fx.ca = Math.max(fx.ca, 0.02 * (1 - d / 0.12)); } }
    for (const u of [...tl.upgrades, tl.op]) { const d = e - u.t0; if (d >= 0 && d < 0.1) fx.flash = Math.max(fx.flash, 0.4 * (1 - d / 0.1)); }
    if (sh.id === 'rewind') {
      const k = (e - 0.8) / 0.2;
      Object.assign(fx, { sat: 0.25, contrast: 1.25, zoomBlur: 0.18, ca: 0.03, tint: [0.85, 0.95, 1.2], dirBlur: [0.02 * Math.sin(k * 30), 0] });
    }
    // Anime impact frames: 2 frames of inverted high-contrast B&W on the mythic hits.
    for (const h of hits) if (h.power >= 1.5) {
      const d = Math.round((e - h.t) * tl.fps);
      if (d === 0 || d === 1) Object.assign(fx, { invert: 1, sat: 0, contrast: 2.6, flash: 0, zoomBlur: 0.08, ca: 0.02, bloom: 0.2, vignette: 0.2 });
      else if (d === 2) fx.flash = 0.6;
    }
    if (sh.id === 'starter') { fx.sat = 0.85; fx.vignette = 0.55; }
    if (sh.id === 'op' && e < tl.op.hit && e > tl.op.equipEnd) { fx.vignette = 0.6 + 0.3 * smooth((e - tl.op.equipEnd) / 0.38); fx.sat = 1.2; }
    if (sh.id === 'end') fx.bloom = 0.7;
    this.eng.setViews([{ scene: sc.scene, camera: this.cam }]);
    this.eng.fx(fx);
  }

  draw2d(ctx, e) {
    const tl = this.tl, T = tl.text, { s, sh, ore, om, hits } = this.cur, P = (v) => this.eng.project(v, this.cam), lang = this.lang;
    const big = impulse(e, hits.filter((h) => h.power >= 1).map((h) => ({ t: h.t, power: 1 })), 10);

    // Floating damage numbers from each hit.
    const tipScreen = P(this.cur.sc.tip.clone().add(V3(0, 0.5, 0)));
    hits.forEach((h, hi) => {
      const k = (s - h.t) / (h.power >= 1 ? 1.1 : 0.8);
      if (k < 0 || k > 1) return;
      const val = sh.id === 'starter' ? '1' : sh.u ? fmt.short(sh.u.dmg, lang) : '999K';
      const crit = h.power >= 1 || (sh.u && sh.u.crit);
      damage(ctx, val, clamp(tipScreen.x + (hi % 2 ? 110 : -70), 300, 780), clamp(tipScreen.y - 40 - (hi % 2) * 60, h.power >= 1.5 ? 1000 : 780, 1350), k, { crit, size: sh.id === 'starter' ? 64 : crit ? (h.power >= 1 ? 170 : 120) : 96, time: e, color: h.power >= 1 ? 'rainbow' : undefined, rise: h.power >= 1.5 ? 50 : 150, critLabel: h.power < 1.5 });
    });

    // HP bar over the ore (starter + upgrades).
    if ((sh.id === 'starter' || (sh.u && e - sh.u.t0 > 0.42)) && om.hp > 0) {
      const top = P(ore.top().add(V3(0, 0.35, 0)));
      const max = sh.id === 'starter' ? tl.starter.hp : sh.u.hp;
      const label = sh.id === 'starter' ? T.ore.stone : ore.cfg.label[lang];
      hpBar(ctx, clamp(top.x, 250, 830), Math.max(sh.id === 'starter' ? 920 : 560, top.y), 360, om.frac, om.ghost, { label, hpText: `${fmt.short(om.hp, lang)} / ${fmt.short(max, lang)}`, time: e, shake: Math.exp(-om.sinceHit * 12) });
    }

    // HOOK title — fully visible on frame 0 (thumbnail), punches on impact.
    if (e < 0.8) {
      const punch = 1 + 0.18 * big;
      text(ctx, [['0 ', '#ffffff'], ['→ ', COLORS.yellow], ['OP', 'rainbow']], W / 2, 470, { size: 250, scale: punch, rotate: -0.05, time: e, strokeW: 36 });
    }
    if (sh.id === 'rewind') {
      const k = (e - 0.8) / 0.2;
      ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff';
      for (let i = 0; i < 2; i++) { ctx.beginPath(); const x = 470 + i * 110; ctx.moveTo(x + 90, 860); ctx.lineTo(x, 960); ctx.lineTo(x + 90, 1060); ctx.closePath(); ctx.fill(); ctx.lineWidth = 12; ctx.strokeStyle = COLORS.ink; ctx.stroke(); }
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#000'; for (let y = (k * 400) % 12; y < 1920; y += 12) ctx.fillRect(0, y, 1080, 5); ctx.restore();
    }

    // Starter meme caption.
    if (sh.id === 'starter') {
      const a = pop(e, 1.04), b = pop(e, 1.24);
      text(ctx, T.was1, W / 2, 600, { size: 78, scale: a.s, alpha: a.a, rotate: -0.03 });
      text(ctx, T.was2, W / 2, 712, { size: 128, fill: [COLORS.yellow, '#ffb21a'], scale: b.s, alpha: b.a, rotate: -0.03 });
    }

    // Damage-per-hit counter (the through-line of the video).
    if (e >= 1.0 && e < tl.end.t0) {
      let i = 0; while (i + 1 < this.dmgSteps.length && e >= this.dmgSteps[i + 1].t) i++;
      const cur = this.dmgSteps[i], prev = this.dmgSteps[Math.max(0, i - 1)];
      const k = i === 0 ? 1 : ease.outCubic(clamp((e - cur.t) / 0.32));
      const v = Math.exp(lerp(Math.log(prev.v), Math.log(cur.v), k)); // log roll so 1 -> 999K reads as a climb
      const rc = RARITY[cur.r].c, fill = rc === 'rainbow' ? 'rainbow' : [ '#ffffff', rc[0], rc[1]];
      const punch = 1 + 0.35 * Math.exp(-(e - cur.t) * 7) * (i > 0 ? 1 : 0) + 0.1 * big;
      const y = 330;
      text(ctx, T.dmgLabel, W / 2, y - 92, { size: 40, font: FONTS.label, strokeW: 7, shadow: 0, fill: '#ffffff' });
      text(ctx, fmt.short(v, lang), W / 2, y + 15, { size: 120, fill, scale: punch, time: e, strokeW: 18, glow: cur.r === 'mythic' ? '#ff4fd8' : null });
    }

    // Upgrade: rays + rarity badge on equip.
    const equipT0 = sh.u ? sh.u.t0 : sh.id === 'op' ? tl.op.t0 : null;
    if (equipT0 !== null && e - equipT0 < 0.55) {
      const k = e - equipT0, r = sh.u ? sh.u.rarity : 'mythic';
      const head = P(this.avatar.toolTipWorld());
      const col = { rare: '120,190,255', epic: '210,130,255', legendary: '255,215,110', mythic: '255,140,240' }[r];
      rays(ctx, head.x, head.y, (1 - smooth((k - 0.3) / 0.25)) * (r === 'mythic' ? 1.2 : 0.9), e, { color: col });
      const b = pop(e, equipT0 + 0.02, equipT0 + 0.42);
      const R = RARITY[r];
      badge(ctx, R[lang], W / 2, 1180, { size: r === 'mythic' ? 92 : 74, bg: R.c, scale: b.s, alpha: b.a, time: e, rotate: -0.04 });
    }

    // OP: charge + stamp.
    if (sh.id === 'op') {
      if (e >= tl.op.equipEnd && e < tl.op.hit) {
        const k = smooth((e - tl.op.equipEnd) / 0.38);
        speedLines(ctx, k, e, { color: '255,180,250' });
        const q = pop(e, tl.op.equipEnd + 0.04);
        text(ctx, T.oneHit, W / 2, 620, { size: 190, scale: q.s * (1 + 0.06 * Math.sin(e * 40)), alpha: q.a, rotate: -0.06, fill: [COLORS.yellow, '#ff9a1a'] });
      }
      if (e >= tl.op.hit) {
        const k = e - tl.op.hit;
        const sc = k < 0.12 ? lerp(2.4, 1, ease.outCubic(k / 0.12)) : 1;
        text(ctx, T.oneHitDone, W / 2, 620, { size: 190, scale: sc, alpha: clamp(1 - (k - 0.9) / 0.15), rotate: -0.06, fill: 'rainbow', time: e, glow: '#ff4fd8' });
      }
      // Reward gems fly from the ore to the stat pill.
      if (e >= 9.05) {
        const from = P(ore.center()), to = { x: W / 2 + 90, y: 470 };
        for (let i = 0; i < 14; i++) {
          const t0 = 9.05 + i * 0.045, k = clamp((e - t0) / 0.45);
          if (k <= 0 || k >= 1) continue;
          const kk = ease.inOutCubic(k), x = lerp(from.x + (i % 5 - 2) * 40, to.x, kk), y = lerp(from.y, to.y, kk) - Math.sin(kk * Math.PI) * 220;
          gemIcon(ctx, x, y, 26, ['#ff4fd8', '#4ff3ff', '#ffe14a', '#7dff6a'][i % 4], 1, e * 6 + i);
        }
        const g = pop(e, 9.1);
        badge(ctx, lang === 'pt' ? '+2,5M' : '+2.5M', W / 2 + 90, 470, { size: 52, bg: ['#5ef0ff', '#1f8fff'], scale: g.s * (1 + 0.12 * Math.max(0, Math.sin((e - 9.5) * 30)) * (e < 9.8 ? 1 : 0)), alpha: g.a });
        gemIcon(ctx, W / 2 - 70, 470, 30, '#4ff3ff', g.a);
      }
    }

    if (sh.id === 'end') endCard(ctx, clamp((e - tl.end.t0) / 0.5), e - tl.end.t0, lang, { y: 860 });
  }
}
