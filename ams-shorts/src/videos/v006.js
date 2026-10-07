// V006 — THE RAREST ORE (9s, loopable). Hero reveal -> mining tension -> shatter -> reward -> back to frame 1.
import * as THREE from 'three';
import { placeCamera, impulse, mining } from '../engine.js';
import { makeOre, rainbowMaterial } from '../lib/ore.js';
import { makeAvatar, makePickaxe } from '../lib/actors.js';
import { lightPillar } from '../lib/fx.js';
import { text, badge, damage, hpBar, endCard, pop, gemIcon, COLORS, W, H } from '../lib/overlay.js';
import { clamp, ease, kf, lerp, smooth, fmt, pulse } from '../lib/util.js';
import { themedScene, sharedRainbow, hitFX, breakFX, rays } from './kit.js';
export { timeline } from './v006.timeline.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export class Video {
  constructor(eng, tl, lang) {
    this.eng = eng; this.tl = tl; this.lang = lang;
    this.cam = new THREE.PerspectiveCamera(45, 1080 / 1920, 0.1, 1500);
    const sc = (this.sc = themedScene('void', { seed: 21 }));
    this.avatar = makeAvatar();
    this.avatar.setTool(makePickaxe('gold', sharedRainbow()));
    sc.scene.add(this.avatar.root);
    this.avatar.pose({ untilHit: 0 });
    const tip = (this.tip = this.avatar.toolTipWorld());
    this.ore = makeOre('secret', 9);
    this.ore.group.position.set(0, 0, tip.z + this.ore.radius * 0.72);
    sc.scene.add(this.ore.group);
    this.ore.group.updateMatrixWorld(true);
    this.ore.setHitFrom(V3(0, this.ore.radius * 0.9, 0));
    this.oreC = this.ore.center();

    // Orbiting shards + light pillar make the ore read as "special" before any text.
    this.shards = [];
    const mat = rainbowMaterial(2.2);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.OctahedronGeometry(0.13 + (i % 3) * 0.05, 0); g.scale(1, 1.8, 1);
      const m = new THREE.Mesh(g, mat); sc.scene.add(m); this.shards.push(m);
    }
    this.shardMat = mat;
    this.pillar = lightPillar('#9fe8ff', 70, 0.8);
    this.pillar.position.set(0, 0, this.ore.group.position.z);
    sc.scene.add(this.pillar);
    // Reward gem revealed after the break.
    const gg = new THREE.OctahedronGeometry(0.75, 0); gg.scale(0.8, 1.25, 0.8);
    this.gem = new THREE.Mesh(gg, rainbowMaterial(2.6)); sc.scene.add(this.gem);

    this.hits = tl.hits.map((t, i) => ({ t, dmg: tl.hp / (tl.hits.length + 1.6), power: 0.55 + i * 0.03 }));
    const used = this.hits.reduce((a, h) => a + h.dmg, 0);
    this.hits.push({ t: tl.final, dmg: tl.hp - used, power: 2 });
    this.hits.forEach((h, i) => hitFX(sc.fx, h.t, tip, h.power, this.ore, 600 + i));
    breakFX(sc.fx, tl.final, this.ore, 1.7, 699);
  }

  sim(e) {
    const { from, to, k } = this.tl.slow;
    if (e < from) return e;
    if (e < to) return from + (e - from) * k;
    return from + (to - from) * k + (e - to);
  }

  // Camera rig per beat. Returns [pos, target, fov, roll]. Shots are authored relative to the ore.
  camera(e) {
    const o = this.oreC, tl = this.tl;
    const R = (x, y, z) => [o.x + x, y, o.z + z]; // offset from the ore (x/z), absolute height
    const orbit = (a, r, y, fov = 44) => [[o.x + Math.sin(a) * r, y, o.z + Math.cos(a) * r], [o.x, o.y + 0.25, o.z], fov, 0];
    if (e < 1.0) return orbit(lerp(0.55, 0.95, e), 6.6, lerp(2.3, 2.0, e));
    if (e < 3.0) { const k = smooth((e - 1.0) / 2.0); const az = this.avatarZ(e); return [[lerp(3.0, 2.5, k), lerp(4.8, 4.3, k), az - lerp(6.4, 5.4, k)], [0, 1.0, o.z], 50, 0.03]; }
    if (e < 4.0) { const k = e - 3; return [R(lerp(5.8, 5.2, k), 1.9, lerp(3.4, 3.0, k)), R(-0.4, 1.2, -1.6), 44, -0.03]; }
    if (e < 4.9) { const k = (e - 4) / 0.9; return [R(lerp(3.6, 3.2, k), 1.8, lerp(4.6, 4.1, k)), [o.x, o.y, o.z], 42, -0.05]; }
    if (e < 5.6) { const k = (e - 4.9) / 0.7; return [R(lerp(3.0, 2.7, k), 1.5, lerp(4.2, 3.8, k)), [o.x, o.y, o.z], 40, 0.07]; }
    if (e < 5.75) return [R(2.4, 1.4, 3.4), [o.x, o.y, o.z], 38, 0.08];
    if (e < tl.final) { const k = smooth((e - 5.75) / 0.25); return [R(lerp(2.4, 4.6, k), lerp(1.4, 0.7, k), lerp(3.4, 4.8, k)), R(0, 1.7, -2.4), lerp(38, 48, k), lerp(0.08, -0.05, k)]; }
    if (e < tl.logo) { const k = (e - tl.final) / (tl.logo - tl.final); return [R(lerp(4.6, 3.2, ease.outCubic(k)), lerp(0.7, 1.5, k), lerp(4.8, 4.4, k)), [o.x, lerp(1.7, 2.3, k), o.z], 48, lerp(-0.05, 0, k)]; }
    // ease back into the opening orbit so the last frame matches frame 1
    const k = ease.inOutCubic(clamp((e - tl.logo) / (tl.duration - tl.logo)));
    const [p0, t0] = orbit(0.55, 6.6, 2.3), p1 = R(3.2, 1.5, 4.4);
    return [p1.map((v, i) => lerp(v, p0[i], k)), [lerp(o.x, t0[0], k), lerp(2.3, t0[1], k), lerp(o.z, t0[2], k)], 48 - 4 * k, 0];
  }

  avatarZ(e) {
    const { from, to } = this.tl.walk;
    if (e < from || e >= this.tl.logo + 0.2) return -7;
    return lerp(-2.6, 0, ease.outCubic(clamp((e - from) / (to - from))));
  }

  update(e) {
    const tl = this.tl, s = this.sim(e), av = this.avatar, ore = this.ore;
    const m = mining(s, this.hits, tl.hp);
    const respawn = e >= tl.respawn ? ease.outBack(clamp((e - tl.respawn) / 0.35), 2) : 0;
    const broken = m.hp <= 0 && !respawn;
    this.m = m;

    // Avatar
    const az = this.avatarZ(e);
    av.root.position.set(0, 0, az);
    const walking = e >= tl.walk.from && e < tl.walk.to;
    const charge = e > 5.72 && e < tl.final - 0.06 ? smooth((e - 5.72) / 0.2) : 0;
    av.pose({ sinceHit: m.sinceHit, untilHit: m.untilHit, time: s, walk: walking ? 1 : 0, charge, power: m.next ? m.next.power : 1 });
    av.root.visible = e >= tl.walk.from && e < tl.logo + 0.2;

    // Ore (respawns at the end for the loop)
    const kick = m.sinceHit < 10 ? Math.exp(-m.sinceHit * 18) : 0;
    const tremble = m.frac < 0.2 && !broken ? 0.25 : 0;
    ore.update(respawn ? 0 : m.damage, Math.max(kick, tremble * (0.5 + 0.5 * Math.sin(e * 60))), s, !broken);
    ore.group.scale.setScalar(respawn ? respawn : 1);
    this.sc.fx.update(s);

    // Shards orbit, tighten and speed up as HP drops.
    this.shardMat.userData.u.time.value = s;
    const tight = respawn ? 1 : 1 - m.damage * 0.35;
    this.shards.forEach((sh, i) => {
      const a = s * (0.9 + m.damage * 2.5) + (i / this.shards.length) * Math.PI * 2;
      const r = ore.radius * (1.55 + 0.25 * Math.sin(i * 2.1)) * tight;
      sh.position.set(this.oreC.x + Math.cos(a) * r, this.oreC.y + 0.4 + Math.sin(s * 2 + i) * 0.45, this.oreC.z + Math.sin(a) * r);
      sh.rotation.set(s * 2 + i, s * 3, 0);
      sh.visible = !broken;
    });
    this.pillar.userData.set(s, broken ? 0 : (0.35 + 0.15 * Math.sin(e * 3)) * (e < 1 || respawn ? 1 : 0.5));

    // Reward gem: rises out of the debris, spins.
    const rk = clamp((e - tl.final - 0.15) / 0.6);
    this.gem.visible = e > tl.final + 0.1 && e < tl.respawn + 0.1;
    this.gem.position.set(this.oreC.x, lerp(this.oreC.y, 2.6, ease.outBack(rk, 1.4)), this.oreC.z);
    this.gem.rotation.set(0, s * 3, 0.15 * Math.sin(s * 2));
    this.gem.scale.setScalar(ease.outBack(clamp((e - tl.final - 0.1) / 0.3), 2) * (e > tl.respawn - 0.15 ? clamp((tl.respawn + 0.1 - e) / 0.25) : 1));
    this.gem.material.userData.u.time.value = s;

    const [p, t, fov, roll] = this.camera(e);
    const shake = Math.min(1.6, impulse(s, this.hits.map((h) => ({ t: h.t, power: h.power * 0.8 })), 8) + tremble * 0.5 + charge * 0.4);
    placeCamera(this.cam, p, t, { fov, roll, shake, t: e, seed: 6 });

    const fx = { time: e, ca: 0.004, vignette: 0.45, bloom: 0.5, sat: 1.15 };
    const d = Math.round((e - tl.final) * tl.fps);
    if (d === 0 || d === 1) Object.assign(fx, { invert: 1, sat: 0, contrast: 2.6, bloom: 0.2, ca: 0.02 });
    else if (d === 2) fx.flash = 0.6;
    for (const c of [1.0, 3.0, 4.0, 4.9, 5.6]) { const k = e - c; if (k >= 0 && k < 0.1) { fx.zoomBlur = 0.18 * (1 - k / 0.1); fx.ca = 0.02; } }
    if (m.frac < 0.2 && !broken) { fx.vignette = 0.75; fx.tint = [1.1, 0.92, 0.95]; }
    if (respawn) fx.flash = Math.max(fx.flash || 0, 0.35 * pulse(e, tl.respawn, 0.02, 12));
    this.eng.setViews([{ scene: this.sc.scene, camera: this.cam }]);
    this.eng.fx(fx);
  }

  draw2d(ctx, e) {
    const tl = this.tl, T = tl.text, lang = this.lang, m = this.m, s = this.sim(e);
    const P = (v) => this.eng.project(v, this.cam);

    // HOOK title — full on frame 0, and back again on the final frames (loop).
    // Title is full on frame 0 and fades back in on the last frames, so the loop point is invisible.
    const titleA = e < 1.0 ? 1 - smooth((e - 0.85) / 0.15) : smooth((e - (tl.duration - 0.25)) / 0.2);
    if (titleA > 0) {
      text(ctx, T.l1, W / 2, 380, { size: 104, alpha: titleA, rotate: -0.03 });
      text(ctx, T.l2, W / 2, 500, { size: 150, fill: 'rainbow', time: e, alpha: titleA, rotate: -0.03, glow: '#9fe8ff' });
      badge(ctx, T.odds, W / 2, 650, { size: 52, bg: ['#1f2b4a', '#0b1226'], alpha: titleA, rotate: -0.03 });
    }

    // HP bar + damage numbers while mining.
    if (e >= 1.0 && m.hp > 0 && e < tl.respawn) {
      const top = P(this.ore.top().add(V3(0, 0.6, 0)));
      const low = m.frac < 0.2;
      const pct = Math.ceil(m.frac * 100);
      hpBar(ctx, clamp(top.x, 260, 820), clamp(top.y, 420, 900), 420, m.frac, m.ghost,
        { label: T.ore, rarityFill: 'rainbow', hpText: `${fmt.short(m.hp, lang)} / ${fmt.short(tl.hp, lang)}`, time: e, shake: Math.exp(-m.sinceHit * 12) + (low ? 0.4 : 0), scale: low ? 1 + 0.05 * Math.sin(e * 18) : 1 });
      if ([4.0, 4.9, 5.6].some((c) => e >= c && e < c + 0.5)) {
        const c = [4.0, 4.9, 5.6].find((c) => e >= c && e < c + 0.5), q = pop(e, c, c + 0.35);
        text(ctx, `${pct}%`, W / 2, 1250, { size: 150, fill: low ? [COLORS.red, '#a0001a'] : [COLORS.yellow, '#ff9a1a'], scale: q.s, alpha: q.a, rotate: -0.05 });
      }
    }
    // Red pulse when it's about to break.
    if (m.frac < 0.2 && m.hp > 0) {
      const k = 0.5 + 0.5 * Math.sin(e * 14);
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(255,0,40,0)'); g.addColorStop(1, `rgba(255,0,40,${0.18 * k})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const tipS = P(this.tip.clone().add(V3(0, 0.4, 0)));
    this.hits.forEach((h, i) => {
      const big = h.power >= 1.5;
      const k = big ? (e - h.t) / 1.0 : (s - h.t) / 0.6; // big number lives in edit time, not slow-mo
      if (k < 0 || k > 1) return;
      damage(ctx, fmt.short(h.dmg, lang), big ? W / 2 : W / 2 + [-210, 50, 250][i % 3], big ? 1150 : 920 + [0, -120, 70][i % 3], k,
        { size: big ? 180 : 90, crit: big || i % 3 === 2, critLabel: !big, color: big ? 'rainbow' : i % 3 === 2 ? undefined : ['#ffffff', '#cfe9ff'], time: e, rise: big ? 40 : 140 });
    });

    // Reward reveal.
    if (e >= tl.reveal && e < tl.logo + 0.1) {
      const g = P(this.gem.position);
      rays(ctx, g.x, g.y, (1 - smooth((e - tl.logo + 0.4) / 0.4)) * 1.1, e, { color: '170,235,255' });
      const st = e - tl.reveal, sc = st < 0.12 ? lerp(2.6, 1, ease.outCubic(st / 0.12)) : 1 + 0.03 * Math.sin(e * 8);
      text(ctx, T.got, W / 2, 470, { size: 190, fill: 'rainbow', time: e, scale: sc, rotate: -0.05, glow: '#9fe8ff', alpha: clamp((tl.logo + 0.1 - e) / 0.15) });
      const b = pop(e, tl.reveal + 0.25);
      badge(ctx, '+1', W / 2 + 70, 640, { size: 58, bg: ['#5ef0ff', '#1f8fff'], scale: b.s, alpha: b.a * clamp((tl.logo + 0.1 - e) / 0.15) });
      gemIcon(ctx, W / 2 - 50, 640, 34, '#9fe8ff', b.a * clamp((tl.logo + 0.1 - e) / 0.15), e * 2);
    }
    if (e >= tl.ask && e < tl.logo + 0.1) {
      const q = pop(e, tl.ask, tl.logo - 0.05);
      text(ctx, T.ask, W / 2, 1300, { size: lang === 'pt' ? 96 : 92, fill: [COLORS.yellow, '#ff9a1a'], scale: q.s, alpha: q.a, rotate: -0.04 });
    }
    // Name, then fade so the last frame hands back to frame 1.
    if (e >= tl.logo) {
      const k = clamp((e - tl.logo) / 0.4), out = clamp((tl.duration - 0.12 - e) / 0.3);
      endCard(ctx, k, e - tl.logo, lang, { y: 1000, dim: false, alpha: out });
    }
  }
}
