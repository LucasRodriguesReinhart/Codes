// Page bootstrap: ?video=v001&lang=pt  -> exposes window.AMS for the headless renderer.
import { Engine } from './engine.js';

const q = new URLSearchParams(location.search);
const id = q.get('video') || 'v001', lang = q.get('lang') || 'pt';

async function loadFonts() {
  const probes = ['110px "Luckiest Guy"', '60px "Lilita One"', '60px "Inter Display"'];
  await Promise.all(probes.map((f) => document.fonts.load(f, 'AÁÃÇÉÊÍÓÕÚ→0123456789')));
  await document.fonts.ready;
}

(async () => {
  try {
    await loadFonts();
    const mod = await import(`./videos/${id}.js`);
    const tl = await mod.timeline(lang, q);
    const eng = new Engine();
    const video = new mod.Video(eng, tl, lang);
    window.AMS = {
      duration: tl.duration, fps: tl.fps,
      async frame(i, mime = 'image/jpeg', q = 0.94) {
        const t = i / tl.fps;
        if (video.prepare) await video.prepare(t);
        video.update(t);
        eng.render((ctx) => video.draw2d(ctx, t));
        return eng.out.toDataURL(mime, q);
      },
    };
    window.AMS_READY = true;
  } catch (e) {
    window.AMS_ERROR = String(e && e.stack || e);
    console.error(e);
  }
})();
