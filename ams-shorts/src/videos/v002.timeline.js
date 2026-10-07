// V002 — "COMMON vs MYTHIC": same ore, two Units, split screen, 15s.
// NOTE: placeholder numbers — swap in the real AMS stats (HP, damage, times) before posting.

export const fps = 30;

export function timeline(lang) {
  const L = (pt, en) => (lang === 'pt' ? pt : en);
  const start = 1.0;                      // GO
  const myth = { beamFrom: 1.3, beamTo: 4.1, tick: 0.1, tickDmg: 33000, final: 4.2 };
  const comm = { every: 0.36, dmg: 25 };
  const hp = 1000000;
  const commonBreakElapsed = 167.9;       // 2:47.9 on the stopwatch
  const lapse = { from: 4.6, to: 8.45 };  // edit-time window of the top-half time-lapse
  const commonBreakEdit = 8.6;
  const tl = {
    id: 'v002', fps, duration: 15.0, start, myth, comm, hp, lapse, commonBreakElapsed, commonBreakEdit,
    mythTime: myth.final - start,
    results: { t0: 8.85, t1: 11.6 },
    ask: { t0: 11.6, t1: 13.4 },
    end: { t0: 13.4, t1: 15.0 },
    text: {
      common: L('COMUM', 'COMMON'), mythic: L('MÍTICO', 'MYTHIC'), vs: 'VS',
      sub: L('MESMA PEDRA. DUAS UNITS.', 'SAME ORE. TWO UNITS.'),
      go: L('VAI!', 'GO!'),
      faster: (x) => L(`${x}x MAIS RÁPIDO`, `${x}x FASTER`),
      ask: L('QUAL VOCÊ USARIA?', 'WHICH ONE WOULD YOU USE?'),
      askSub: L('COMENTA AÍ', 'COMMENT BELOW'),
      ore: L('DIAMANTE', 'DIAMOND'),
      lapse: '>> 50x',
    },
  };

  const sfx = [];
  const add = (t, name, o = {}) => sfx.push({ t, name, ...o });
  add(0.0, 'shimmer', { dur: 1.0, gain: 0.8 }); add(0.0, 'drone', { dur: 1.1, gain: 0.8 });
  add(0.12, 'vs'); add(0.55, 'pop', { gain: 0.6 });
  add(start, 'stamp'); add(start, 'ding');
  for (let t = start + 0.2; t < lapse.from; t += comm.every) add(t, 'punch', { gain: 0.45, pan: -0.3 });
  add(start, 'charge', { dur: 0.3 });
  add(myth.beamFrom, 'beam', { dur: myth.beamTo - myth.beamFrom, gain: 0.85, pan: 0.2 });
  add(myth.final, 'impact_huge'); add(myth.final, 'break_big'); add(myth.final + 0.06, 'ding');
  add(lapse.from - 0.05, 'whoosh', { gain: 0.8 }); add(lapse.from, 'glitch', { dur: 0.2 });
  for (let t = lapse.from + 0.1, dt = 0.12; t < lapse.to - 0.1; t += dt, dt = Math.max(0.05, dt * 0.93)) add(t, 'tick', { gain: 0.8 });
  add(commonBreakEdit - 0.36, 'punch', { gain: 0.6, pan: -0.3 }); add(commonBreakEdit, 'punch', { gain: 0.8 });
  add(commonBreakEdit, 'break', { size: 0.9 }); add(commonBreakEdit + 0.06, 'ding');
  add(tl.results.t0, 'whoosh', { gain: 0.7 }); add(tl.results.t0 + 0.15, 'pop'); add(tl.results.t0 + 0.4, 'pop');
  add(tl.results.t0 + 0.75, 'stamp'); add(tl.results.t0 + 0.75, 'crit');
  add(tl.ask.t0, 'pop', { gain: 0.8 });
  add(tl.end.t0, 'whoosh', { gain: 0.6 }); add(tl.end.t0 + 0.12, 'logo_hit');
  tl.sfx = sfx;
  tl.music = {
    bpm: 150,
    sections: [
      { t0: 0.0, t1: 1.0, mode: 'tension' },
      { t0: 1.0, t1: 4.2, mode: 'full' },
      { t0: 4.6, t1: 8.6, mode: 'full' },
      { t0: 8.85, t1: 13.4, mode: 'drop' },
      { t0: 13.4, t1: 15.0, mode: 'outro' },
    ],
  };
  return tl;
}
