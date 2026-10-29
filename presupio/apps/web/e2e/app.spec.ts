import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  expectAccessible,
  expectNoHorizontalOverflow,
  lastMailLink,
  loginViaUi,
  PASSWORD,
  registerViaUi,
  runWorkerOnce,
  simulatedEmails,
  uniqueEmail,
  watchConsole,
} from './support';

test.describe.configure({ mode: 'serial' });

let owner: { context: BrowserContext; page: Page; email: string; problems: string[] };
let firstQuoteUrl = '';
let automaticQuoteUrl = '';

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  owner = { context, page, email: '', problems: watchConsole(page) };
});

test.afterAll(async () => {
  if (owner.problems.length) console.log(owner.problems.join('\n'));
  expect(owner.problems, 'Errores de consola o del servidor durante el flujo principal').toEqual([]);
  await owner.context.close();
});

test('registro: crea la cuenta y muestra un panel vacío honesto', async () => {
  const { page } = owner;
  owner.email = await registerViaUi(page, 'Reformas Ensayo SL');
  // El correo no está configurado en pruebas: la interfaz lo dice, no finge el envío.
  await expect(page.getByText(/no hemos podido enviarte el email de confirmación/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Empieza en tres pasos' })).toBeVisible();
  const ledger = page.locator('.ledger');
  await expect(ledger.locator('.ledger__value')).toHaveText(['0', '0', '0', '0', '0']);
  await expect(page.locator('.account-button__company').first()).toHaveText('Reformas Ensayo SL');
});

test('presupuesto: alta, seguimiento, respuesta (reactivada) y venta con evidencia', async () => {
  const { page } = owner;
  await page.getByRole('link', { name: 'Registrar el primer presupuesto' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo presupuesto' })).toBeVisible();

  // Validación en el navegador antes de enviar.
  await page.getByRole('button', { name: 'Registrar presupuesto' }).click();
  await expect(page.getByText('El nombre del cliente es obligatorio')).toBeVisible();
  await expect(page.getByText('El título es obligatorio')).toBeVisible();

  await page.getByLabel('Nombre del cliente').fill('Cliente Ficticio Uno');
  await page.getByLabel('Email', { exact: false }).first().fill('cliente.uno@ejemplo.test');
  await page.getByLabel('Teléfono').fill('600 11 22 33');
  await page.getByLabel('Título').fill('Reforma integral de cocina');
  await page.getByLabel('Referencia').fill('E2E-001');
  await page.getByLabel('Importe').fill('18.500,50');
  await page.getByRole('button', { name: 'Registrar presupuesto' }).click();

  await expect(page.getByRole('heading', { name: 'Reforma integral de cocina' })).toBeVisible();
  firstQuoteUrl = new URL(page.url()).pathname;
  await expect(page.getByText('Presupuesto registrado.')).toBeVisible();
  await expect(page.locator('.kv').first()).toContainText('18.500,5 €');
  await expect(page.locator('.pill--sent').first()).toHaveText('Pendiente de respuesta');

  // Registrar un contacto realizado.
  await page.getByRole('button', { name: 'Registrar contacto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar un contacto realizado' });
  await dialog.getByLabel('Resultado').selectOption('left_message');
  await dialog.getByLabel('Notas').fill('Le dejé un mensaje en el contestador.');
  await dialog.getByRole('button', { name: 'Registrar contacto' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.fu-list').getByText('Llamada de seguimiento')).toBeVisible();
  await expect(page.getByText('Dejamos mensaje')).toBeVisible();

  // Respuesta del cliente tras el seguimiento → oportunidad reactivada.
  await page.getByRole('button', { name: 'Registrar respuesta del cliente' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Oportunidad reactivada', { exact: true })).toBeVisible();
  await expect(page.locator('.pill--responded').first()).toBeVisible();

  // Confirmar venta: la evidencia es obligatoria.
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  const sale = page.getByRole('dialog', { name: 'Confirmar venta' });
  await sale.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(sale.getByText('Describe la evidencia de la venta')).toBeVisible();
  await sale.getByLabel('Evidencia de la venta').fill('Contrato firmado nº E2E-45');
  await sale.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page.getByText('Venta confirmada tras seguimiento')).toBeVisible();
  await expect(page.getByText(/Contrato firmado nº E2E-45/)).toBeVisible();

  // El historial distingue lo hecho.
  const history = page.locator('.timeline');
  await expect(history).toContainText('cambió el estado a aceptado');
  await expect(history).toContainText('oportunidad reactivada');
  await expect(history).toContainText('registró un contacto realizado (llamada)');

  // El panel refleja datos reales.
  await page.getByRole('link', { name: 'Panel' }).first().click();
  await expect(page.locator('.ledger .ledger__value')).toHaveText(['1', '0', '1', '1', '1']);
});

test('seguimientos: programar, completar y respetar la lista de exclusión', async () => {
  const { page } = owner;
  await page.goto('/presupuestos/nuevo');
  await page.getByLabel('Nombre del cliente').fill('Cliente Ficticio Dos');
  await page.getByLabel('Email', { exact: false }).first().fill('cliente.dos@ejemplo.test');
  await page.getByLabel('Título').fill('Baño completo');
  await page.getByLabel('Importe').fill('9.200');
  await page.getByRole('button', { name: 'Registrar presupuesto' }).click();
  await expect(page.getByRole('heading', { name: 'Baño completo' })).toBeVisible();
  const quoteUrl = new URL(page.url()).pathname;

  await page.getByRole('button', { name: 'Programar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Programar un seguimiento' });
  await dialog.getByLabel('Título').fill('Llamar para resolver dudas');
  await dialog.getByRole('button', { name: 'Programar' }).click();
  await expect(page.getByText('Seguimiento programado.')).toBeVisible();

  await page.goto('/seguimientos');
  const item = page.locator('.fu', { hasText: 'Llamar para resolver dudas' });
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Hecho' }).click();
  await page.getByRole('dialog').getByLabel('Resultado').selectOption('no_answer');
  await page.getByRole('dialog').getByRole('button', { name: 'Marcar como hecho' }).click();
  await expect(page.getByText('No hay seguimientos pendientes')).toBeVisible();
  await page.getByRole('tab', { name: 'Realizados' }).click();
  await expect(page.locator('.fu', { hasText: 'Llamar para resolver dudas' })).toContainText('No contestó');

  // Exclusión por email desde la ficha del contacto.
  await page.goto(quoteUrl);
  await page.getByRole('link', { name: 'Ver ficha' }).click();
  await page.getByRole('button', { name: 'No contactar' }).click();
  const ex = page.getByRole('dialog', { name: 'No contactar' });
  await ex.getByLabel('Canal').selectOption('email');
  await ex.getByRole('button', { name: 'Registrar exclusión' }).click();
  await expect(page.getByRole('heading', { name: 'Lista de exclusión' })).toBeVisible();

  await page.goto(quoteUrl);
  await expect(page.getByText('Contacto en la lista de exclusión')).toBeVisible();
  await page.getByRole('button', { name: 'Registrar contacto' }).click();
  await expect(page.getByRole('radio', { name: /Email/ })).toBeDisabled();
  await expect(page.getByRole('radio', { name: 'Llamada' })).toBeEnabled();
  await page.keyboard.press('Escape');
});

test('cierre de sesión y protección de páginas privadas', async () => {
  const { page } = owner;
  await page.locator('.rail .account-button').click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();

  await page.goto(firstQuoteUrl);
  await expect(page).toHaveURL(/\/iniciar-sesion\?siguiente=/);
  await loginViaUi(page, owner.email, 'clave-incorrecta-1');
  await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toHaveValue('');
  await loginViaUi(page, owner.email);
  await expect(page).toHaveURL(new RegExp(`${firstQuoteUrl}$`));
  await expect(page.getByRole('heading', { name: 'Reforma integral de cocina' })).toBeVisible();
});

test('recuperación de contraseña de extremo a extremo', async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto('/iniciar-sesion');
  await page.getByRole('link', { name: '¿Has olvidado tu contraseña?' }).click();
  await page.getByLabel('Email').fill(owner.email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();

  await expect.poll(() => {
    try {
      return lastMailLink(owner.email, '/restablecer-contrasena');
    } catch {
      return '';
    }
  }).toMatch(/token=/);
  const link = lastMailLink(owner.email, '/restablecer-contrasena');
  await page.goto(link);
  await page.getByLabel('Contraseña nueva').fill('Nueva-contraseña-segura-2');
  await page.getByLabel('Repite la contraseña').fill('Otra-distinta-9');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText('Las contraseñas no coinciden')).toBeVisible();
  await page.getByLabel('Repite la contraseña').fill('Nueva-contraseña-segura-2');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada. Ya puedes iniciar sesión con la nueva.')).toBeVisible();

  // El enlace ya no sirve una segunda vez.
  await page.goto(link);
  await page.getByLabel('Contraseña nueva').fill('Tercera-contraseña-3x');
  await page.getByLabel('Repite la contraseña').fill('Tercera-contraseña-3x');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByText('El enlace ha caducado o ya se ha usado')).toBeVisible();

  await page.goto('/iniciar-sesion');
  await loginViaUi(page, owner.email, 'Nueva-contraseña-segura-2');
  await expect(page.getByRole('heading', { name: 'Hola, Laura' })).toBeVisible();
  expect(problems.filter((p) => !/status of 400/.test(p))).toEqual([]);

  // La sesión anterior del propietario se cerró al restablecer la contraseña.
  await owner.page.goto('/');
  await expect(owner.page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  await loginViaUi(owner.page, owner.email, 'Nueva-contraseña-segura-2');
  await expect(owner.page.getByRole('heading', { name: 'Hola, Laura' })).toBeVisible();
});

test('aislamiento: otra empresa no puede ver los presupuestos de esta', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerViaUi(page, 'Competencia Ensayo SL');
  await page.goto(firstQuoteUrl);
  await expect(page.getByRole('heading', { name: 'Presupuesto no encontrado' })).toBeVisible();
  await expect(page.getByText('Reforma integral de cocina')).toHaveCount(0);
  await page.goto('/presupuestos');
  await expect(page.getByText('Todavía no hay presupuestos')).toBeVisible();
  await page.goto('/contactos');
  await expect(page.getByText('Cliente Ficticio Uno')).toHaveCount(0);
  await context.close();
});

test('equipo: invitación sin correo configurado y rol de solo lectura', async ({ browser }) => {
  const { page } = owner;
  await page.goto('/configuracion/equipo');
  const invited = uniqueEmail('lector');
  await page.getByLabel('Email').fill(invited);
  await page.getByLabel('Rol').selectOption('viewer');
  await page.getByRole('button', { name: 'Invitar' }).click();
  await expect(page.getByText('La invitación se ha creado, pero no se ha enviado ningún email')).toBeVisible();
  const acceptUrl = await page.getByLabel('Enlace de invitación').inputValue();
  await expect(page.getByRole('heading', { name: 'Invitaciones pendientes' })).toBeVisible();

  const context = await browser.newContext();
  const guest = await context.newPage();
  const url = new URL(acceptUrl);
  await guest.goto(url.pathname + url.search);
  await expect(guest.getByRole('heading', { name: 'Únete a Reformas Ensayo SL' })).toBeVisible();
  await guest.getByLabel('Tu nombre y apellidos').fill('Lector Ensayo');
  await guest.getByLabel('Crea una contraseña').fill(PASSWORD);
  await guest.getByRole('checkbox').check();
  await guest.getByRole('button', { name: 'Crear cuenta y unirme' }).click();
  await expect(guest.getByRole('heading', { name: 'Hola, Lector' })).toBeVisible();
  // Solo lectura: sin acciones de escritura y configuración bloqueada.
  await expect(guest.getByRole('link', { name: /Nuevo presupuesto/ })).toHaveCount(0);
  await guest.goto(firstQuoteUrl);
  await expect(guest.getByRole('heading', { name: 'Reforma integral de cocina' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await guest.goto('/configuracion');
  await expect(guest.getByText(/Solo las personas propietarias o administradoras/)).toBeVisible();
  await expect(guest.getByLabel('Nombre comercial')).toBeDisabled();
  await context.close();
});

test('errores de la API: la interfaz los muestra sin inventar datos', async () => {
  const { page } = owner;
  await page.route('**/api/v1/quotes/summary', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Error interno. Inténtalo de nuevo.', requestId: 'e2e-req-1' } }) }),
  );
  await page.goto('/');
  await expect(page.getByText('No se ha podido cargar el estado de la cartera')).toBeVisible();
  await expect(page.getByText(/e2e-req-1/)).toBeVisible();
  await page.unroute('**/api/v1/quotes/summary');

  await page.route('**/api/v1/quotes?**', (route) => route.abort('internetdisconnected'));
  await page.goto('/presupuestos');
  await expect(page.getByText(/No se ha podido conectar con el servidor/)).toBeVisible();
  await page.unroute('**/api/v1/quotes?**');
  owner.problems.length = 0; // los errores provocados en esta prueba son intencionados
});

const PAGES = [
  '/',
  '/presupuestos',
  '/presupuestos/nuevo',
  '/seguimientos',
  '/seguimientos?estado=sent',
  '/resultados',
  '/contactos',
  '/configuracion',
  '/configuracion/seguimiento',
  '/configuracion/automatico',
  '/configuracion/equipo',
  '/configuracion/plan',
  '/configuracion/perfil',
];

test('envío automático: requisitos, activación, aprobación, envío y baja del cliente', async ({ browser }) => {
  test.setTimeout(120_000);
  const { page } = owner;
  const clientEmail = uniqueEmail('cliente.auto');

  // Reglas: todos los días y todo el día, para que la prueba no dependa de la hora en que se ejecute.
  await page.goto('/configuracion/seguimiento');
  await expect(page.getByLabel('Seguimiento 1: días tras el envío')).toHaveValue('3');
  await expect(page.getByLabel('Seguimiento 3: días tras el envío')).toHaveValue('14');
  await page.getByLabel('Sábado').check();
  await page.getByLabel('Domingo').check();
  await page.getByLabel('Desde las').fill('00:00');
  await page.getByLabel('Hasta las').fill('23:59');
  await page.getByRole('button', { name: 'Guardar reglas' }).click();
  await expect(page.getByText('Reglas de seguimiento guardadas.')).toBeVisible();

  // Sin email confirmado, dirección de respuesta ni base legal no se puede activar.
  await page.getByRole('link', { name: 'Envío automático' }).first().click();
  await expect(page.locator('.req--missing')).toContainText(['Una dirección donde recibir las respuestas', 'La base legal', 'Tu email confirmado']);
  await page.goto(lastMailLink(owner.email, '/verificar-email'));
  await page.getByRole('button', { name: 'Confirmar mi email' }).click();
  await expect(page.getByRole('heading', { name: 'Email confirmado' })).toBeVisible();
  await page.goto('/configuracion/automatico');
  await expect(page.getByRole('heading', { name: /Envío automático de emails/ })).toContainText('Desactivado');
  await expect(page.getByRole('button', { name: 'Activar envío automático' })).toBeDisabled();
  await page.getByLabel('Las respuestas llegan a').fill('oficina@ensayo.test');
  await page.getByLabel('Base legal para contactar').fill('Solo escribimos a clientes que nos han pedido un presupuesto (interés legítimo).');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Datos de envío guardados.')).toBeVisible();

  await page.getByRole('button', { name: 'Activar envío automático' }).click();
  const enable = page.getByRole('dialog', { name: 'Activar el envío automático' });
  await enable.getByRole('button', { name: 'Activar' }).click();
  await expect(enable.getByText('Marca la casilla para confirmar la base jurídica.')).toBeVisible();
  await enable.getByRole('checkbox').check();
  await enable.getByRole('button', { name: 'Activar' }).click();
  await expect(page.getByText('Envío automático activado.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Envío automático de emails/ })).toContainText('Activo');
  await expect(page.getByText('Mailgun (región UE)')).toBeVisible();

  // Presupuesto enviado hace 3 días y sin respuesta.
  const sent = new Date(Date.now() - 3 * 86_400_000);
  const sentDate = `${sent.getFullYear()}-${String(sent.getMonth() + 1).padStart(2, '0')}-${String(sent.getDate()).padStart(2, '0')}`;
  await page.goto('/presupuestos/nuevo');
  await page.getByLabel('Nombre del cliente').fill('Cliente Automático');
  await page.getByLabel('Email', { exact: false }).first().fill(clientEmail);
  await page.getByLabel('Título').fill('Reforma de baño automática');
  await page.getByLabel('Fecha de envío').fill(sentDate);
  await page.getByRole('button', { name: 'Registrar presupuesto' }).click();
  await expect(page.getByRole('heading', { name: 'Reforma de baño automática' })).toBeVisible();
  automaticQuoteUrl = new URL(page.url()).pathname;

  // El proceso de envío programa el primer email; con revisión obligatoria, espera aprobación.
  runWorkerOnce();
  await page.reload();
  const item = page.locator('.fu').filter({ hasText: 'Email automático 1 de 3' });
  await expect(item).toContainText('Pendiente de aprobación');
  await expect(item.getByText('Automático', { exact: true })).toBeVisible();
  expect(simulatedEmails(clientEmail)).toHaveLength(0);

  await item.getByRole('button', { name: 'Revisar' }).click();
  const review = page.getByRole('dialog', { name: 'Email automático 1 de 3' });
  await expect(review.getByText('Tu presupuesto de Reforma de baño automática')).toBeVisible();
  await expect(review.getByText(clientEmail)).toBeVisible();
  await expect(review.locator('.email-text')).toContainText('Hola, Cliente Automático:');
  await expect(review.locator('.email-text')).toContainText('puedes darte de baja aquí');
  await expectAccessible(page, 'revisión de un email automático');
  await review.getByRole('button', { name: 'Aprobar envío' }).click();
  await expect(page.getByText(/Email aprobado/)).toBeVisible();

  // Siguiente ciclo: se envía por el adaptador HTTP real, contra el simulador local.
  runWorkerOnce();
  const mails = simulatedEmails(clientEmail);
  expect(mails).toHaveLength(1);
  expect(mails[0]).toMatchObject({ subject: 'Tu presupuesto de Reforma de baño automática', 'h:Reply-To': 'oficina@ensayo.test', 'o:tracking': 'no' });
  await page.reload();
  await expect(item).toContainText('Enviado el');
  await item.getByRole('button', { name: 'Ver envío' }).click();
  const sentDialog = page.getByRole('dialog', { name: 'Email automático 1 de 3' });
  await expect(sentDialog.getByText('Intento 1')).toBeVisible();
  await expect(sentDialog.getByText('Aceptado por el proveedor')).toBeVisible();
  await sentDialog.getByRole('button', { name: 'Cerrar' }).first().click();

  await page.goto('/seguimientos?estado=sent');
  await expect(page.getByRole('link', { name: 'Email automático 1 de 3' })).toBeVisible();

  // El cliente se da de baja desde el enlace del email (sin sesión).
  const link = mails[0]!.text!.match(/https?:\/\/[^\s]+\/baja\?token=[A-Za-z0-9_-]{43}/)![0];
  const anonContext = await browser.newContext();
  const anon = await anonContext.newPage();
  await anon.goto(new URL(link).pathname + new URL(link).search);
  await expect(anon.getByText(/Reformas Ensayo SL/)).toBeVisible();
  await expectAccessible(anon, 'página de baja');
  await anon.getByRole('button', { name: 'No quiero recibir más correos' }).click();
  await expect(anon.getByText('Baja registrada')).toBeVisible();
  await anonContext.close();

  await page.goto(automaticQuoteUrl);
  await expect(page.getByText('Contacto en la lista de exclusión')).toBeVisible();
  await expect(page.locator('.timeline')).toContainText('registró la baja del cliente desde el enlace del email');
  runWorkerOnce();
  expect(simulatedEmails(clientEmail)).toHaveLength(1);
});

test('plan y resultados: consumo real, sin cambios de plan desde el navegador y exportación', async () => {
  const { page } = owner;
  // La venta de «Reforma integral de cocina» (respuesta tras una llamada) es una recuperación.
  await page.goto('/configuracion/plan');
  await expect(page.getByRole('heading', { name: 'Consumo de este periodo' })).toBeVisible();
  await expect(page.locator('.usage-figure')).toHaveText('1 de 25 recuperaciones');
  await expect(page.getByRole('meter', { name: 'Recuperaciones usadas en este periodo' })).toHaveAttribute('aria-valuenow', '1');
  const recoveries = page.getByRole('region', { name: 'Recuperaciones de este periodo (desplazable)' });
  await expect(recoveries.getByRole('link', { name: 'Reforma integral de cocina' })).toBeVisible();
  await expect(recoveries.getByText('Contabilizada')).toBeVisible();
  // No hay ningún control para cambiar de plan.
  await expect(page.getByRole('button', { name: /cambiar|contratar|mejorar/i })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Business.*127,99/ })).toContainText('300');

  await page.goto('/resultados');
  await expect(page.getByRole('heading', { name: 'Resultados', level: 1 })).toBeVisible();
  const recoveriesLedger = page.getByRole('region', { name: 'Recuperaciones' }).or(page.locator('section', { has: page.getByRole('heading', { name: 'Recuperaciones' }) }));
  await expect(recoveriesLedger.first().locator('.ledger__value').first()).toHaveText('1');
  await expect(page.getByText(/sin datos suficientes/)).toBeVisible();
  await expect(page.getByText(/coincidencia en el tiempo, no una prueba/)).toBeVisible();
  await page.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(page).toHaveURL(/mes=\d{4}-\d{2}/);
  await expect(page.locator('.month-nav__label')).not.toContainText('En curso');

  // Exportación de datos (propietario).
  await page.goto('/configuracion');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^presupio-export-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(exported.format).toBe('presupio-export');
  expect(exported.quotes.items.length).toBeGreaterThan(0);
  expect(JSON.stringify(exported)).not.toMatch(/argon2|passwordHash/);
});

test('enlaces internos: ninguno lleva a una página inexistente', async () => {
  const { page } = owner;
  const found = new Set<string>([firstQuoteUrl]);
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    hrefs.forEach((h) => found.add(h));
  }
  for (const href of found) {
    await page.goto(href);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Esta página no existe' }), href).toHaveCount(0);
    await expect(page.getByText('Algo ha fallado al mostrar esta pantalla'), href).toHaveCount(0);
  }
  expect(found.size).toBeGreaterThan(12);
});

test('accesibilidad y diseño adaptable (escritorio y móvil)', async () => {
  test.setTimeout(360_000); // 15 pantallas × 3 tamaños con análisis axe
  const { page } = owner;
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of [...PAGES, firstQuoteUrl, automaticQuoteUrl]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalOverflow(page, `${path} @${viewport.width}px`);
      if (viewport.width !== 768) await expectAccessible(page, `${path} @${viewport.width}px`);
    }
  }
  // Pantallas públicas.
  const context = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 } });
  const anon = await context.newPage();
  for (const path of ['/iniciar-sesion', '/registro', '/recuperar-contrasena', '/baja?token=enlace-roto']) {
    await anon.goto(path);
    await anon.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(anon, path);
    await expectAccessible(anon, path);
  }
  await context.close();
  await page.setViewportSize({ width: 1280, height: 720 });
});

test('navegación por teclado: saltar al contenido y menú de cuenta', async () => {
  const { page } = owner;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hola, Laura' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenido')).toBeFocused();

  const account = page.locator('.rail .account-button');
  await account.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(account).toBeFocused();
});
