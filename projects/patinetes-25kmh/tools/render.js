// Renderizador determinista: abre render.html en Chromium (Playwright),
// dibuja cada fotograma con renderFrame(t) y lo envía a FFmpeg.
// Uso:
//   node render.js <proyecto> stills 1.5 9 20 ...   -> PNG de control en 09_qa/stills
//   node render.js <proyecto> video [desde] [hasta]  -> 04_animation/scene_renders/video_noaudio.mp4
//   node render.js <proyecto> cues                   -> 05_audio/sfx/cues.json
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

(async () => {
  const [proj, mode, ...rest] = process.argv.slice(2);
  const tl = JSON.parse(fs.readFileSync(path.join(proj, '07_edit/timeline.json'), 'utf8'));
  const nar = JSON.parse(fs.readFileSync(path.join(proj, '01_script/narration.json'), 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', e => { console.error('PAGE ERROR', e.message); process.exit(1); });
  await page.goto('file://' + path.resolve(proj, '04_animation/scene_projects/render.html'));
  const n = await page.evaluate(([a, b]) => window.init(a, b), [tl, nar.captions_display]);
  console.log('caption chunks', n);
  const grab = async t => {
    const url = await page.evaluate(t => { window.renderFrame(t); return document.getElementById('c').toDataURL('image/jpeg', 0.93); }, t);
    return Buffer.from(url.split(',')[1], 'base64');
  };

  if (mode === 'cues') {
    const cues = await page.evaluate(() => window.collectCues());
    fs.mkdirSync(path.join(proj, '05_audio/sfx'), { recursive: true });
    fs.writeFileSync(path.join(proj, '05_audio/sfx/cues.json'), JSON.stringify(cues, null, 1));
    console.log(cues.length, 'cues');
  } else if (mode === 'stills') {
    const out = path.join(proj, '09_qa/stills');
    fs.mkdirSync(out, { recursive: true });
    for (const s of rest) {
      const t = parseFloat(s);
      const png = await page.evaluate(t => { window.renderFrame(t); return document.getElementById('c').toDataURL('image/png'); }, t);
      fs.writeFileSync(path.join(out, `t_${t.toFixed(2)}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
    console.log('stills ok');
  } else if (mode === 'video') {
    const fps = 30;
    const t0 = parseFloat(rest[0] ?? 0), t1 = parseFloat(rest[1] ?? tl.duration);
    const outFile = path.join(proj, '04_animation/scene_renders', rest[2] || 'video_noaudio.mp4');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
    const N = Math.round((t1 - t0) * fps);
    const start = Date.now();
    for (let i = 0; i < N; i++) {
      const buf = await grab(t0 + i / fps);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 150 === 0) console.log(`frame ${i}/${N}  ${((Date.now() - start) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log('video ok', outFile);
  }
  await browser.close();
})();
