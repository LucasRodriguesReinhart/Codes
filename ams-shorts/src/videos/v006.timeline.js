// V006 — "THE RAREST ORE": rarity + tension + reward, 9s, ends on frame 1 for a seamless loop.
// NOTE: placeholder numbers (HP, odds, damage) — use the real AMS values before posting.

export const fps = 30;

export function timeline(lang) {
  const L = (pt, en) => (lang === 'pt' ? pt : en);
  const hits = [1.9, 2.3, 2.7, 3.1, 3.4, 3.7, 4.0, 4.3, 4.6, 4.9, 5.25, 5.6];
  const tl = {
    id: 'v006', fps, duration: 9.0, hp: 50e6, hits, final: 6.0, slow: { from: 6.0, to: 6.9, k: 0.3 },
    walk: { from: 1.0, to: 1.6 }, reveal: 6.35, ask: 7.2, logo: 8.0, respawn: 8.35,
    text: {
      l1: L('O MINÉRIO MAIS', 'THE RAREST ORE'), l2: L('RARO DO JOGO', 'IN THE GAME'),
      odds: L('CHANCE: 0,0001%', 'CHANCE: 0.0001%'),
      ore: L('SECRETO', 'SECRET'),
      got: L('SECRETO!', 'SECRET!'),
      ask: L('VOCÊ JÁ ACHOU UM?', 'HAVE YOU FOUND ONE?'),
    },
  };
  const sfx = [];
  const add = (t, name, o = {}) => sfx.push({ t, name, ...o });
  add(0, 'shimmer', { dur: 1.1, gain: 1.0 }); add(0, 'drone', { dur: 1.2, gain: 1.0 });
  add(0.95, 'whoosh', { gain: 0.7 });
  hits.forEach((t, i) => { add(t, 'hit', { power: 0.55 + i * 0.03 }); if (i % 3 === 2) add(t, 'crit'); });
  add(4.0, 'whoosh', { gain: 0.5 }); add(4.9, 'heartbeat'); add(5.35, 'heartbeat', { gain: 1.1 }); add(5.7, 'heartbeat', { gain: 1.2 });
  add(5.2, 'riser', { dur: 0.8 }); add(5.72, 'charge', { dur: 0.28 });
  add(6.0, 'impact_huge'); add(6.0, 'break_big'); add(6.0, 'sub_drop');
  add(6.35, 'equip', { tier: 'mythic' }); add(6.4, 'stamp'); add(6.45, 'reward_flurry', { dur: 0.8 });
  add(7.2, 'pop', { gain: 0.8 });
  add(8.0, 'whoosh', { gain: 0.6 }); add(8.1, 'logo_hit'); add(8.35, 'shimmer', { dur: 0.6, gain: 0.8 });
  tl.sfx = sfx;
  tl.music = {
    bpm: 150,
    sections: [
      { t0: 0.0, t1: 1.0, mode: 'tension' },
      { t0: 1.0, t1: 3.0, mode: 'full' },
      { t0: 3.0, t1: 5.6, mode: 'tension' },
      { t0: 6.0, t1: 9.0, mode: 'drop' },
    ],
  };
  return tl;
}
