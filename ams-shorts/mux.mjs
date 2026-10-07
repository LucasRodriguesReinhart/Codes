// node mux.mjs <video.mp4> <audio.wav> <out.mp4>
// Two-pass loudnorm (linear) so every short lands at -14 LUFS / -1 dBTP, then muxes with the video.
import { execFileSync, spawnSync } from 'node:child_process';
const [video, audio, out] = process.argv.slice(2);
const target = 'I=-14:TP=-1.0:LRA=11';
const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', audio, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
const m = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf('{'), probe.stderr.lastIndexOf('}') + 1));
const second = `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
  '-af', second, '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
