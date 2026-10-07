// V001 — "0 → OP": starter pickaxe to the best pickaxe in 12s.
// Pure data (no three.js) so the audio renderer can read the same cue list.
// NOTE: every number here is a placeholder — swap in the real AMS values before posting.

export const fps = 30;
const BEAT = 0.4; // 150 BPM: every upgrade lands on a bar line

export function timeline(lang) {
  const L = (pt, en) => (lang === 'pt' ? pt : en);
  const upgrades = [
    { id: 'up1', t0: 2.4, theme: 'desert', pick: 'iron', ore: 'copper', rarity: 'rare', dmg: 120, hp: 240, hits: [3.2, 3.6] },
    { id: 'up2', t0: 4.0, theme: 'frost', pick: 'crystal', ore: 'gold', rarity: 'epic', dmg: 4500, hp: 9000, hits: [4.8, 5.2] },
    { id: 'up3', t0: 5.6, theme: 'arena', pick: 'gold', ore: 'diamond', rarity: 'legendary', dmg: 85000, hp: 85000, hits: [6.4], crit: true },
  ];
  const tl = {
    id: 'v001', fps, duration: 12.0, beat: BEAT,
    text: {
      hook: '0 → OP',
      was1: L('ESSA ERA MINHA PICARETA', 'THIS WAS MY PICKAXE'),
      was2: L('HÁ 10 MINUTOS', '10 MINUTES AGO'),
      dmgLabel: L('DANO POR HIT', 'DAMAGE PER HIT'),
      oneHit: '1 HIT?', oneHitDone: '1 HIT!',
      ore: { stone: L('PEDRA', 'STONE') },
    },
    hook: { hit: 0.3, slow: 0.35 },
    starter: { t0: 1.0, t1: 2.4, hits: [1.32, 1.98], dmg: 1, hp: 100 },
    upgrades,
    op: { t0: 7.2, equipEnd: 7.62, hit: 8.0, slowUntil: 9.0, slow: 0.3, t1: 10.4, dmg: 999000 },
    end: { t0: 10.4, t1: 12.0 },
  };

  // ---- audio cues (seconds) ----
  const sfx = [];
  const add = (t, name, o = {}) => sfx.push({ t, name, ...o });
  add(0, 'whoosh_in', { gain: 0.6 });
  add(tl.hook.hit, 'impact_huge'); add(tl.hook.hit, 'break_big'); add(tl.hook.hit, 'sub_drop');
  add(0.8, 'rewind');
  for (const h of tl.starter.hits) add(h, 'tink');
  add(1.05, 'pop', { gain: 0.5 }); add(1.25, 'pop', { gain: 0.6 });
  for (const u of upgrades) {
    add(u.t0 - 0.08, 'whoosh', { gain: 0.7 });
    add(u.t0, 'equip', { tier: u.rarity });
    u.hits.forEach((h, i) => {
      const last = i === u.hits.length - 1;
      add(h, 'hit', { power: 0.45 + upgrades.indexOf(u) * 0.2 });
      if (last) add(h, 'break', { size: 0.6 + upgrades.indexOf(u) * 0.2 });
      if (u.crit) add(h, 'crit');
    });
    add(u.t0 + 0.12, 'count_up');
  }
  add(tl.op.t0 - 0.08, 'whoosh', { gain: 0.9 });
  add(tl.op.t0, 'equip', { tier: 'mythic' });
  add(tl.op.t0 + 0.12, 'count_up');
  add(7.6, 'riser', { dur: 0.4 }); add(7.62, 'charge', { dur: 0.38 }); add(7.66, 'pop', { gain: 0.7 });
  add(tl.op.hit, 'impact_huge'); add(tl.op.hit, 'break_big'); add(tl.op.hit, 'sub_drop'); add(tl.op.hit, 'crit');
  add(tl.op.hit + 0.02, 'stamp');
  add(9.05, 'reward_flurry', { dur: 1.0 });
  add(tl.end.t0, 'whoosh', { gain: 0.6 }); add(tl.end.t0 + 0.12, 'logo_hit');

  tl.sfx = sfx;
  tl.music = {
    bpm: 150,
    sections: [
      { t0: 0.0, t1: 0.3, mode: 'full' },
      { t0: 1.0, t1: 2.4, mode: 'muffled' },
      { t0: 2.4, t1: 7.6, mode: 'full' },
      { t0: 8.0, t1: 10.4, mode: 'drop' },
      { t0: 10.4, t1: 12.0, mode: 'outro' },
    ],
  };
  return tl;
}
