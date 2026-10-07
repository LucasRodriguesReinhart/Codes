// Headless renderer: node render.mjs <video> <lang> [--stills 0,0.3,1.5] [--from s --to s]
// Serves the project over HTTP, drives the page frame by frame and pipes JPEGs into ffmpeg.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const video = args[0] || 'v001', lang = args[1] || 'pt';
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const stills = opt('--stills', null), edl = opt('--edl', null);
const tag = edl ? `${edl}_${lang}` : `${video}_${lang}`;
const outDir = path.join(ROOT, 'out');
fs.mkdirSync(outDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// Default: CPU (SwiftShader) so it runs anywhere. On a PC with a GPU, AMS_GPU=1 is much faster.
const glArgs = process.env.AMS_GPU ? ['--ignore-gpu-blocklist', '--enable-gpu'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: glArgs, headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?video=${video}&lang=${lang}${edl ? `&edl=${edl}` : ''}`);
await page.waitForFunction(() => window.AMS_READY || window.AMS_ERROR, null, { timeout: 120000 });
const err = await page.evaluate(() => window.AMS_ERROR);
if (err) { console.error(err); process.exit(1); }
const { duration, fps } = await page.evaluate(() => ({ duration: window.AMS.duration, fps: window.AMS.fps }));

const grab = async (i, mime, q) => {
  const url = await page.evaluate(([i, m, q]) => window.AMS.frame(i, m, q), [i, mime, q]);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
};

if (stills) {
  const dir = path.join(outDir, 'stills'); fs.mkdirSync(dir, { recursive: true });
  for (const s of stills.split(',').map(Number)) {
    const i = Math.round(s * fps);
    fs.writeFileSync(path.join(dir, `${tag}_${s.toFixed(2)}.jpg`), await grab(i, 'image/jpeg', 0.9));
    console.log('still', s);
  }
} else {
  const from = Math.round(Number(opt('--from', 0)) * fps), to = Math.round(Number(opt('--to', duration)) * fps);
  const file = path.join(outDir, `${tag}_video.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = from; i < to; i++) {
    const buf = await grab(i, 'image/jpeg', 0.95);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 30 === 0) console.log(`${video}/${lang} frame ${i}/${to} ${((Date.now() - t0) / 1000 / (i - from + 1)).toFixed(2)}s/f`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', file);
}
await browser.close();
server.close();
