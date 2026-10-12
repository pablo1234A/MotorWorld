// Corrector objetivo. Uso: node grade.js <iteration-dir>
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const { chromium } = require(process.env.PW || 'playwright');
const it = path.resolve(process.argv[2]);
const CACHE = path.join(__dirname, '.three-cache');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const allText = dir => { let s=''; const walk=d=>{ for (const f of fs.readdirSync(d)) { const p=path.join(d,f);
  if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(py|md|txt|html|js|toml|cfg|env|example|sh|json)$/i.test(f) || f.startsWith('.env')) s+='\n'+read(p);} }; try{walk(dir);}catch{} return s; };
const findFile = (dir, re) => { let r=null; const walk=d=>{ for (const f of fs.readdirSync(d)) { const p=path.join(d,f);
  if (fs.statSync(p).isDirectory()) walk(p); else if (!r && re.test(f)) r=p; } }; try{walk(dir);}catch{} return r; };

async function pageChecks(file, b, extra) {
  const out = {};
  for (const w of [360, 1280]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    await p.route(/three/, async route => {
      const u = route.request().url();
      const m = u.match(/three@?([\d.]+)?\/(.*)$/) || u.match(/three\.js\/r(\d+)\/(.*)$/);
      if (!m) return route.continue();
      let ver = m[1] && m[1].includes('.') ? m[1] : (m[1] ? '0.' + m[1] + '.0' : '0.160.0');
      const dir = path.join(CACHE, 'three-' + ver);
      if (!fs.existsSync(path.join(dir, 'node_modules/three'))) execSync(`npm i -s --prefix "${dir}" three@${ver}`, { stdio: 'ignore' });
      let rel = m[2].split('?')[0]; if (rel === '' || rel === 'three') rel = 'build/three.module.js';
      const fp = path.join(dir, 'node_modules/three', rel);
      if (!fs.existsSync(fp)) return route.fulfill({ status: 404, body: 'nf ' + rel });
      route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(fp) });
    });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type()==='error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.goto('file://' + file, { waitUntil: 'load', timeout: 30000 }).catch(e => errs.push('load: '+e.message));
    await p.waitForTimeout(2500);
    if (extra) await extra(p).catch(()=>{});
    out['err'+w] = errs;
    out['hscroll'+w] = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1).catch(()=>true);
    await p.screenshot({ path: path.join(path.dirname(file), `shot-${w}.png`) }).catch(()=>{});
    await p.close();
  }
  return out;
}

const STRICT = process.env.STRICT === '1';
const SK = path.join(__dirname, '..', 'skill-v2', 'scripts');
function runScript(name, file, out, extra = []) {
  let code = 0, err = '';
  try { execSync(`node "${path.join(SK, name)}" "${file}" --out "${out}" ${extra.join(' ')}`, { stdio: 'pipe', timeout: 400000, env: process.env }); }
  catch (e) { code = e.status ?? 1; err = String(e.stderr || e.message).slice(0, 200); }
  let json = null; try { json = JSON.parse(fs.readFileSync(path.join(out, 'resultado.json'), 'utf8')); } catch {}
  return { code, json, err };
}
async function movesWithW(b, file) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.route(/cdn\.jsdelivr\.net|unpkg\.com/, async route => { const m = route.request().url().match(/three@([\d.]+)\/(.*)$/); if (!m) return route.abort();
    const dir = path.join(CACHE, 'three-' + m[1]); if (!fs.existsSync(path.join(dir, 'node_modules/three'))) execSync(`npm i -s --prefix "${dir}" three@${m[1]}`, { stdio: 'ignore' });
    const fp = path.join(dir, 'node_modules/three', m[2].split('?')[0]); fs.existsSync(fp) ? route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(fp) }) : route.abort(); });
  try {
    await p.goto('file://' + file, { waitUntil: 'load' }); await p.waitForTimeout(2000);
    const box = await p.evaluate(() => { const re = /jugar|play|start|empezar|comenzar|iniciar|desplegar/i; const el = [...document.querySelectorAll('button,a,[role=button]')].find(x => re.test(x.textContent) && x.offsetParent);
      if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.click(box ? box.x : 640, box ? box.y : 360); await p.waitForTimeout(1500);
    const a = await p.screenshot(); await p.keyboard.down('KeyW'); await p.waitForTimeout(2000); await p.keyboard.up('KeyW'); const c = await p.screenshot();
    const d = await p.evaluate(async ([x, y]) => { const ld = async b64 => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const cv = document.createElement('canvas'); cv.width = 160; cv.height = 90; const g = cv.getContext('2d'); g.drawImage(i, 0, 0, 160, 90); return g.getImageData(0, 0, 160, 90).data; };
      const A = await ld(x), B = await ld(y); let s = 0; for (let i = 0; i < A.length; i += 4) s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); return s / (A.length / 4) / 3; }, [a.toString('base64'), c.toString('base64')]);
    await p.close(); return { pass: d > 3, detail: `diferencia media entre fotogramas ${d.toFixed(1)} (inicio: ${box ? 'botón' : 'clic central'})` };
  } catch (e) { await p.close(); return { pass: false, detail: e.message.slice(0, 120) }; }
}
const E = (text, passed, evidence) => ({ text, passed: !!passed, evidence: String(evidence).slice(0, 300) });

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  for (const evalDir of fs.readdirSync(it).filter(d => fs.existsSync(path.join(it, d, 'eval_metadata.json')))) {
    for (const cfg of (process.env.CFGS ? process.env.CFGS.split(',') : ['with_skill', 'old_skill', 'without_skill'])) {
      const run = path.join(it, evalDir, cfg); const outs = path.join(run, 'outputs');
      if (!fs.existsSync(outs)) continue;
      const exp = [];
      if (evalDir === 'landing-taller') {
        const f = findFile(outs, /\.html$/i); const h = read(f);
        exp.push(E('Entrega un único archivo HTML', f, f || 'no html'));
        const pc = f ? await pageChecks(f, b) : {};
        exp.push(E('Sin errores de JavaScript en consola (360 y 1280 px)', f && !pc.err360.length && !pc.err1280.length, JSON.stringify([pc.err360, pc.err1280])));
        exp.push(E('Sin scroll horizontal en móvil (360 px)', f && !pc.hscroll360, 'hscroll360=' + pc.hscroll360));
        exp.push(E('Respeta prefers-reduced-motion', /prefers-reduced-motion/.test(h), 'grep prefers-reduced-motion'));
        exp.push(E('Estilos de foco visibles (:focus-visible)', /focus-visible/.test(h), 'grep focus-visible'));
        exp.push(E('Exactamente un h1', (h.match(/<h1[\s>]/g)||[]).length === 1, 'h1 count=' + (h.match(/<h1[\s>]/g)||[]).length));
        exp.push(E('Colores definidos como tokens CSS en :root', /:root\s*{[^}]*--/.test(h), 'grep :root --'));
        exp.push(E('CTA de contacto directo (tel: o WhatsApp)', /href="(tel:|https:\/\/wa\.me)/.test(h), 'grep tel:/wa.me'));
        exp.push(E('Datos estructurados LocalBusiness/AutoRepair (SEO local)', /"@type"\s*:\s*"(AutoRepair|LocalBusiness)"/.test(h), 'grep JSON-LD'));
        exp.push(E('Meta description y Open Graph', /name="description"/.test(h) && /property="og:/.test(h), 'grep meta'));
        exp.push(E('Sin texto de relleno (lorem/TODO)', !/lorem ipsum/i.test(h) && !/\bTODO\b/.test(h), 'grep lorem/TODO'));
        if (STRICT && f) { const r = runScript('check-web.mjs', f, path.join(run, 'check-web')); const graves = (r.json?.results || []).filter(x => x.sev === 'grave' && !x.pass);
          exp.push(E('Pasa scripts/check-web.mjs sin fallos imprescindibles', r.code === 0, graves.map(x => x.name + (x.detail ? ': ' + x.detail : '')).join(' | ') || 'ok')); }
      } else if (evalDir === 'fps-navegador') {
        const f = findFile(outs, /\.html$/i); const h = read(f);
        exp.push(E('Entrega un archivo HTML', f, f || 'no html'));
        exp.push(E('Three.js cargado con versión fijada', /three@\d+\.\d+\.\d+|three\/r?\d{3}|three\.js\/r\d+/.test(h), (h.match(/https?:[^"']*three[^"']*/)||['none'])[0]));
        const pc = f ? await pageChecks(f, b, async p => { await p.mouse.click(640, 400); await p.keyboard.press('Enter'); await p.waitForTimeout(2000); }) : {};
        exp.push(E('Carga y arranca sin errores de JavaScript', f && !pc.err1280.length, JSON.stringify(pc.err1280)));
        exp.push(E('Usa Pointer Lock para apuntar con el ratón', /requestPointerLock/.test(h), 'grep requestPointerLock'));
        exp.push(E('Controles WASD', /KeyW|'w'|"w"/.test(h) && /KeyS|'s'|"s"/.test(h), 'grep KeyW/KeyS'));
        exp.push(E('Recarga con R', /KeyR|'r'|"r"/.test(h), 'grep KeyR'));
        exp.push(E('Movimiento independiente de FPS (delta clamped)', /getDelta|Math\.min\([^)]*(dt|delta)|delta\s*=\s*Math\.min/.test(h), 'grep delta'));
        exp.push(E('Pantalla de game over con reinicio', /game\s*over|gameOver/i.test(h) && /(restart|reiniciar|reintentar|volver a jugar|play again|resetGame|again)/i.test(h), 'grep game over/restart'));
        exp.push(E('Retroceso de arma (recoil)', /recoil|retroceso/i.test(h), 'grep recoil'));
        exp.push(E('Colisiones con el mapa (el jugador no atraviesa paredes)', /(collid|colisi|Box3|intersectsBox|AABB)/i.test(h), 'grep collision'));
        exp.push(E('Soporte táctil o aviso para móvil', /touch|ontouchstart|pointer:\s*coarse|móvil|mobile/i.test(h), 'grep touch/mobile'));
        exp.push(E('Sonido (Web Audio) en disparos', /AudioContext/.test(h), 'grep AudioContext'));
        if (STRICT && f) {
          const r = runScript('test-juego.mjs', f, path.join(run, 'test-juego'), ['--segundos', '6']); const c = n => (r.json?.checks || []).find(x => x.name === n);
          exp.push(E('Se juega 6 s sin errores de JavaScript (prueba automática)', c('Sin errores de JavaScript')?.pass, c('Sin errores de JavaScript')?.detail || r.err));
          exp.push(E('La escena se dibuja durante la partida', c('La escena se dibuja durante la partida')?.pass, c('La escena se dibuja durante la partida')?.detail));
          const mv = await movesWithW(b, f); exp.push(E('El jugador se mueve al pulsar W tras empezar con un clic real', mv.pass, mv.detail));
        }
      } else if (evalDir === 'gmail-claude-csv') {
        const py = findFile(outs, /\.py$/); const all = allText(outs); const s = read(py);
        let compiles = false; try { execSync(`python3 -I -m py_compile "${py}"`, { stdio: 'pipe' }); compiles = true; } catch (e) {}
        exp.push(E('El script Python compila', py && compiles, py || 'no .py'));
        exp.push(E('IMAP sobre SSL', /IMAP4_SSL/.test(s), 'grep IMAP4_SSL'));
        exp.push(E('Credenciales desde variables de entorno (nada hardcodeado)', /os\.environ|getenv|dotenv/.test(s) && !/password\s*=\s*["'][^"'{]{6,}["']/i.test(s), 'grep environ'));
        exp.push(E('Usa el SDK oficial de Anthropic', /import anthropic|from anthropic/.test(s), 'grep anthropic'));
        exp.push(E('Restringe la salida a las 5 categorías válidas', /urgente/.test(s) && /factura/.test(s) && /(not in|in CATEG|enum|Literal|VALID|valid)/i.test(s), 'grep categories validation'));
        exp.push(E('Fallback si la respuesta del modelo no es JSON válido', /(JSONDecodeError|except[^\n]*json|ValueError)/.test(s), 'grep JSONDecodeError'));
        exp.push(E('Escribe con el módulo csv', /import csv|csv\.(writer|DictWriter)/.test(s), 'grep csv'));
        exp.push(E('No marca como leídos sin querer (BODY.PEEK) o lo documenta', /BODY\.PEEK|PEEK/.test(s) || /marca(r)? como leído/i.test(all), 'grep PEEK'));
        exp.push(E('Evita duplicados entre ejecuciones (UIDs guardados o dedupe)', /(uid|UID).*(seen|procesad|processed|state|guard)|processed|procesados/i.test(s), 'grep processed uids'));
        exp.push(E('Limita el tamaño del texto enviado a Claude (ahorro de tokens)', /\[:\s*[\w\[\]'\"]+\]|MAX_(BODY|CHARS)|truncat|body_chars/i.test(s), 'grep truncation'));
        exp.push(E('Instrucciones de contraseña de aplicación de Gmail', /contraseña de aplicación|app password|apppasswords/i.test(all), 'grep app password'));
        const defModel = (s.match(/(?:getenv|environ\.get)\([^)]*?["']([^"']*claude[^"']*)["']\s*\)/i) || s.match(/MODEL[A-Z_]*\s*=\s*[^\n]*?["'](claude-[^"']+)["']/i) || [])[1] || '';
        exp.push(E('Modelo pequeño (Haiku) por defecto para clasificar', /haiku/i.test(defModel), defModel || 'no encontrado'));
        exp.push(E('Instrucciones para programarlo cada mañana (cron/Programador de tareas)', /cron|Programador de tareas|Task Scheduler|launchd|schedule/i.test(all), 'grep cron'));
      }
      const passed = exp.filter(x => x.passed).length;
      const grading = { expectations: exp, summary: { passed, failed: exp.length - passed, total: exp.length, pass_rate: +(passed / exp.length).toFixed(3) } };
      fs.writeFileSync(path.join(run, 'grading.json'), JSON.stringify(grading, null, 1));
      console.log(evalDir, cfg, `${passed}/${exp.length}`);
    }
  }
  await b.close();
})();
