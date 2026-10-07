// Real-footage build: node footage.mjs edl/<name>.json
// 1) extracts the frames/audio each clip needs from your OBS recordings
// 2) synthesizes music + SFX (+ the original game audio) from the EDL cues
// 3) renders the edit layer over the footage and muxes out/AMS_<name>_<lang>.mp4
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const edlPath = process.argv[2];
if (!edlPath) { console.error('usage: node footage.mjs edl/<name>.json'); process.exit(1); }
const id = path.basename(edlPath, '.json');
const edl = JSON.parse(fs.readFileSync(edlPath, 'utf8'));
const lang = edl.lang || 'pt';
// The render page loads edl/<id>.json, so keep a copy there.
fs.mkdirSync('edl', { recursive: true });
if (path.resolve(edlPath) !== path.resolve('edl', `${id}.json`)) fs.copyFileSync(edlPath, path.join('edl', `${id}.json`));
const dir = path.join('out', 'footage', id);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const kfLinear = (t, keys) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) if (t <= keys[i + 1][0]) return keys[i][1] + (keys[i + 1][1] - keys[i][1]) * ((t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]));
  return keys[keys.length - 1][1];
};
const srcOffset = (c, dt) => {
  if (typeof c.speed !== 'object' || c.speed === null) return dt * (c.speed ?? 1);
  let s = 0; const step = 1 / 240;
  for (let x = 0; x < dt; x += step) s += kfLinear(c.t0 + x, c.speed) * Math.min(step, dt - x);
  return s;
};

const manifest = { clips: [] }, clipAudio = [];
// Extract the frames one source needs (scaled to 1920px tall; the page crops/zooms on the GPU).
const extract = (c, out, label) => {
  if (!fs.existsSync(c.file)) throw new Error(`${label}: file not found: ${c.file}`);
  const fpsStr = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', c.file]).trim();
  const [a, b] = fpsStr.split('/').map(Number); const fps = b ? a / b : a;
  const dur = srcOffset(c, c.t1 - c.t0) + 0.1;
  fs.mkdirSync(out);
  run('ffmpeg', ['-v', 'error', '-ss', String(c.in ?? 0), '-t', String(dur), '-i', c.file, '-vf', 'scale=-2:1920:flags=lanczos', '-q:v', '2', path.join(out, '%05d.jpg')]);
  const frames = fs.readdirSync(out).length;
  console.log(`${label}: ${frames} frames @ ${fps.toFixed(2)}fps`);
  const constantSpeed = typeof c.speed !== 'object' && (c.speed ?? 1) === 1;
  if ((c.audio ?? 0.8) > 0 && constantSpeed) {
    const wav = `${out}.wav`;
    try {
      run('ffmpeg', ['-v', 'error', '-ss', String(c.in ?? 0), '-t', String(c.t1 - c.t0), '-i', c.file, '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', wav]);
      clipAudio.push({ file: wav, t: c.t0, dur: c.t1 - c.t0, gain: c.audio ?? 0.8 });
    } catch { console.warn(`${label}: no audio track, skipping game audio`); }
  }
  return { fps, frames };
};
edl.clips.forEach((c, i) => {
  const entry = extract(c, path.join(dir, `clip${i}`), `clip ${i}`);
  if (c.bottom) entry.bottom = extract({ audio: 0, ...c.bottom, t0: c.t0, t1: c.t1 }, path.join(dir, `clip${i}b`), `clip ${i} (bottom)`);
  manifest.clips.push(entry);
});
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));

const cues = path.join('out', `${id}_${lang}_cues.json`);
fs.writeFileSync(cues, JSON.stringify({ duration: edl.duration, sfx: edl.sfx || [], music: edl.music || { bpm: 150, sections: [] }, clips: clipAudio }));
const wav = path.join('out', `${id}_${lang}_audio.wav`);
const PY = ['python3', 'python', 'py'].find((p) => spawnSync(p, ['--version']).status === 0);
execFileSync(PY, ['audio/synth.py', cues, wav], { stdio: 'inherit' });
execFileSync('node', ['render.mjs', 'footage', lang, '--edl', id], { stdio: 'inherit' });
const final = path.join('out', `AMS_${id}_${lang}.mp4`);
execFileSync('node', ['mux.mjs', path.join('out', `${id}_${lang}_video.mp4`), wav, final], { stdio: 'inherit' });
console.log('done', final);
