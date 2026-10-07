// node export_cues.mjs v001 pt -> out/v001_pt_cues.json (shared cue list for the audio renderer)
import fs from 'node:fs';
const [video = 'v001', lang = 'pt'] = process.argv.slice(2);
const { timeline } = await import(`./src/videos/${video}.timeline.js`);
const tl = timeline(lang);
fs.mkdirSync('out', { recursive: true });
const file = `out/${video}_${lang}_cues.json`;
fs.writeFileSync(file, JSON.stringify({ duration: tl.duration, sfx: tl.sfx, music: tl.music }, null, 1));
console.log(file);
