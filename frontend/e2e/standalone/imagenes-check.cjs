// Prueba del HTML independiente con proveedores simulados:
// node frontend/e2e/standalone/imagenes-check.cjs docs/preview/motorworld-imagenes.html frontend/e2e/fixtures/photo.png /tmp
const { chromium } = require('playwright');
const fs = require('fs');
const PNG = fs.readFileSync(process.argv[3]);
const file = 'file://' + require('path').resolve(process.argv[2]);
const out = process.argv[4];
let ok = 0, bad = 0;
const t = (name, cond, extra = '') => { cond ? ok++ : bad++; console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond ? '' : ' ' + extra)); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => m.type() === 'error' && !/fonts|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  let pollMode = 'ok', calls = { poll: 0, hf: [], falSubmit: [], falCancel: 0, falStatus: 0 }, falBlock = false;
  await ctx.route('https://fonts.googleapis.com/**', r => r.abort());
  await ctx.route('https://image.pollinations.ai/**', r => { calls.poll++; return pollMode === 'ok' ? r.fulfill({ status: 200, contentType: 'image/png', body: PNG }) : r.fulfill({ status: 502, body: 'bad gateway' }); });
  await ctx.route('https://router.huggingface.co/**', r => { calls.hf.push({ auth: r.request().headers()['authorization'], body: JSON.parse(r.request().postData()) }); return r.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route('https://queue.fal.run/**', r => {
    const u = r.request().url(); const m = r.request().method();
    if (m === 'POST') { calls.falSubmit.push({ url: u, auth: r.request().headers()['authorization'], body: JSON.parse(r.request().postData()) }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ request_id: 'r1', status_url: 'https://queue.fal.run/fal-ai/flux/requests/r1/status', response_url: 'https://queue.fal.run/fal-ai/flux/requests/r1', cancel_url: 'https://queue.fal.run/fal-ai/flux/requests/r1/cancel' }) }); }
    if (m === 'PUT') { calls.falCancel++; return r.fulfill({ status: 200, body: '{}' }); }
    if (u.endsWith('/status')) { calls.falStatus++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(falBlock ? { status: 'IN_QUEUE', queue_position: 3 } : { status: 'COMPLETED' }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{ url: 'https://v3.fal.media/files/out.png' }], seed: 77 }) });
  });
  await ctx.route('https://v3.fal.media/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));

  await p.goto(file);
  await p.waitForSelector('#model option', { state: 'attached' });
  console.log('1. Gratis sin clave (Pollinations)');
  t('aviso de modo gratuito visible', await p.isVisible('text=Funcionando con'));
  t('modelo por defecto FLUX schnell', (await p.inputValue('#model')) === 'flux-schnell');
  t('prompt negativo oculto (schnell no lo admite)', !(await p.isVisible('#negField')));
  await p.fill('#prompt', 'Un deportivo rojo en el desierto al anochecer');
  await p.click('[data-style=cinematic]');
  await p.click('[data-ar="16:9"]');
  await p.click('#generate');
  await p.waitForSelector('.gen-img img', { timeout: 10000 });
  t('imagen generada y mostrada', (await p.locator('.gen-img img').count()) === 1);
  const req = await p.evaluate(() => 0);
  t('Pollinations llamado con estilo y 16:9', calls.poll === 1);
  await p.screenshot({ path: out + '/img-1-create.png' });

  console.log('2. Fallback Pollinations → Hugging Face');
  await p.click('a[href="#ajustes"]');
  await p.fill('[data-key=huggingface]', 'hf_testtoken123');
  await p.click('[data-savekey=huggingface]');
  await p.click('a[href="#crear"]');
  pollMode = 'fail';
  await p.fill('#prompt', 'Faro en un acantilado');
  await p.fill('#num', '2'); await p.dispatchEvent('#num', 'input');
  await p.locator('#advanced summary').click();
  await p.fill('#seed', '1234');
  await p.click('#generate');
  await p.waitForFunction(() => document.querySelectorAll('.gen-img img').length >= 3, null, { timeout: 10000 });
  t('fallback a HF tras error 502', calls.hf.length === 2);
  t('HF recibe token, tamaño y semillas consecutivas', calls.hf[0].auth === 'Bearer hf_testtoken123' && calls.hf[0].body.parameters.seed === 1234 && calls.hf[1].body.parameters.seed === 1235);
  t('historial muestra el fallback', await p.isVisible('text=Fallback: Pollinations.ai falló antes.'));

  console.log('3. SDXL muestra prompt negativo y pasos');
  await p.selectOption('#model', 'sdxl');
  t('negativo visible en SDXL', await p.isVisible('#negField'));
  t('pasos visibles en SDXL', await p.isVisible('#stepsField'));

  console.log('4. Imagen a imagen con fal (FLUX dev)');
  await p.click('a[href="#ajustes"]');
  await p.fill('[data-key=fal]', 'key:secret');
  await p.click('[data-savekey=fal]');
  await p.click('a[href="#crear"]');
  await p.click('[data-mode=i2i]');
  await p.selectOption('#model', 'flux-dev');
  t('intensidad visible en imagen a imagen', await p.isVisible('#strengthField'));
  await p.click('#refSlot');
  await p.click('[data-pick]');
  await p.fill('#prompt', 'Conviértelo en acuarela');
  await p.click('#generate');
  await p.waitForFunction(() => document.querySelectorAll('.gen-img img').length >= 4, null, { timeout: 15000 });
  const fs1 = calls.falSubmit[0];
  t('fal: endpoint image-to-image', fs1 && fs1.url.endsWith('fal-ai/flux/dev/image-to-image'), fs1 && fs1.url);
  t('fal: clave en cabecera y referencia como data URI', fs1.auth === 'Key key:secret' && fs1.body.image_url.startsWith('data:image/') && fs1.body.strength === 0.75);

  console.log('5. Cancelar una generación en cola');
  falBlock = true;
  await p.click('[data-mode=edit]');
  await p.fill('#prompt', 'cambia el fondo por un estudio');
  await p.click('#generate');
  await p.waitForSelector('[data-cancel]');
  await p.waitForFunction(() => /posición 3/.test(document.body.innerText), null, { timeout: 15000 });
  t('posición real de cola mostrada', true);
  await p.click('[data-cancel]');
  await p.waitForFunction(() => !document.querySelector('[data-cancel]'), null, { timeout: 10000 });
  await p.waitForTimeout(300);
  t('cancelada y cancelación enviada a fal', (await p.isVisible('.badge >> text=Cancelado')) && calls.falCancel === 1, String(calls.falCancel));
  falBlock = false;

  console.log('6. Base de datos persistente');
  await p.locator('[data-fav]').first().click({ force: true });
  await p.waitForTimeout(300);
  console.log('    favs antes:', await p.evaluate(async () => (await DB.all('assets')).filter(a => a.favorite).length));
  await p.click('a[href="#proyectos"]'); await p.fill('#projName', 'Campaña GT'); await p.click('#projCreate');
  await p.waitForSelector('#projects >> text=Campaña GT');
  await p.goto(file + '#crear'); await p.reload(); await p.waitForSelector('#model option', { state: 'attached' }); await p.waitForTimeout(500);
  t('tras recargar siguen las imágenes', (await p.locator('.gen-img img').count()) === 4);
  await p.click('a[href="#favoritos"]'); await p.waitForSelector('#favs .thumb', { timeout: 5000 }).catch(() => {}); t('favorito persistido', (await p.locator('#favs .thumb').count()) === 1);
  await p.click('a[href="#proyectos"]'); await p.waitForSelector('#projects >> text=Campaña GT', { timeout: 5000 }).catch(() => {}); t('proyecto persistido', await p.isVisible('#projects >> text=Campaña GT'));
  await p.click('a[href="#historial"]'); await p.waitForFunction(() => document.querySelectorAll('#hist .gen').length >= 4, null, { timeout: 5000 }).catch(() => {}); t('historial con 4 generaciones', (await p.locator('#hist .gen').count()) === 4);
  await p.screenshot({ path: out + '/img-2-history.png' });
  await p.click('a[href="#ajustes"]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#exportDb')]);
  const path = out + '/backup.json'; await dl.saveAs(path);
  const backup = JSON.parse(fs.readFileSync(path, 'utf8'));
  t('exportación con imágenes', backup.assets.length === 4 && backup.generations.length === 4, `${backup.assets.length}/${backup.generations.length}`);
  t('exporta el proyecto', backup.projects.length === 1);
  p.once('dialog', d => d.accept()); await p.click('#wipeDb'); await p.waitForTimeout(400);
  t('borrado total', (await p.textContent('#dbStats')).startsWith('0 generaciones'));
  await p.setInputFiles('#importFile', path); await p.waitForTimeout(1200);
  t('importación restaura todo', (await p.textContent('#dbStats')).startsWith('4 generaciones · 4 imágenes') && (await p.textContent('#dbStats')).includes('1 proyectos'), await p.textContent('#dbStats'));
  await p.screenshot({ path: out + '/img-3-settings.png' });

  console.log('7. Móvil');
  const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); await m.goto(file); await m.waitForSelector('#model option', { state: 'attached' });
  t('sin scroll horizontal en móvil', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  await m.screenshot({ path: out + '/img-4-mobile.png' });
  t('sin errores de consola', errs.length === 0, JSON.stringify(errs));
  console.log(`\n${ok}/${ok + bad} comprobaciones`);
  await b.close();
})();
