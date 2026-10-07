// node build.mjs v001 pt  -> out/AMS_v001_pt.mp4  (works on Windows, Mac and Linux)
// cues (from the timeline) -> synthesized audio -> rendered frames -> -14 LUFS mux
import { execFileSync, spawnSync } from 'node:child_process';
const [video = 'v001', lang = 'pt'] = process.argv.slice(2);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
export const PY = ['python3', 'python', 'py'].find((p) => spawnSync(p, ['--version']).status === 0);
if (!PY) { console.error('Python 3 not found (install it and run: pip install numpy scipy)'); process.exit(1); }
run('node', ['export_cues.mjs', video, lang]);
run(PY, ['audio/synth.py', `out/${video}_${lang}_cues.json`, `out/${video}_${lang}_audio.wav`]);
run('node', ['render.mjs', video, lang]);
run('node', ['mux.mjs', `out/${video}_${lang}_video.mp4`, `out/${video}_${lang}_audio.wav`, `out/AMS_${video}_${lang}.mp4`]);
console.log(`done out/AMS_${video}_${lang}.mp4`);
