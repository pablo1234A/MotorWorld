import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath as toPath } from 'node:url';
import { apiEnv, SINK_FILE } from './global-setup';

const HERE = path.dirname(toPath(import.meta.url));

export const PASSWORD = 'Contraseña-de-prueba-1';
const API_LOG = path.join(HERE, '.output', 'api.log');

// Un dominio distinto por cuenta: la regla «una prueba gratuita por dominio de empresa y año»
// sigue activa en las pruebas de extremo a extremo (como en producción).
export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}@${randomUUID().slice(0, 8)}.ejemplo.test`;
}

/**
 * Registra los errores del navegador durante la prueba. Se ignoran únicamente las
 * respuestas 401 de /me (así es como la aplicación detecta que no hay sesión).
 */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/status of 401/.test(text)) return;
    problems.push(text);
  });
  page.on('response', (r) => {
    if (r.status() === 401 && r.url().endsWith('/api/v1/me')) return;
    if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return problems;
}

export async function registerViaUi(page: Page, companyName: string) {
  const email = uniqueEmail();
  await page.goto('/registro');
  await page.getByLabel('Tu nombre y apellidos').fill('Laura Ensayo');
  await page.getByLabel('Nombre de la empresa').fill(companyName);
  await page.getByLabel('Email de trabajo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Laura' })).toBeVisible();
  return email;
}

export async function loginViaUi(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Último enlace con token enviado a un email, leído de la salida de la API (MAIL_TRANSPORT=log, solo pruebas). */
export function lastMailLink(to: string, pathPart: string): string {
  const log = readFileSync(API_LOG, 'utf8');
  const blocks = log.split('[MAIL DEV · no enviado]').filter((b) => b.includes(`Para: ${to}`) && b.includes(`${pathPart}?token=`));
  const block = blocks.at(-1);
  const match = block?.match(new RegExp(`https?://[^\\s]*${pathPart}\\?token=[A-Za-z0-9_-]{43}`));
  if (!match) throw new Error(`No se encontró el enlace ${pathPart} para ${to}`);
  return new URL(match[0]).pathname + new URL(match[0]).search;
}

/** Sin infracciones de accesibilidad graves ni críticas (WCAG 2.x A/AA). */
export async function expectAccessible(page: Page, context: string) {
  // (cast: @axe-core/playwright tipa contra otra versión menor de Playwright)
  const results = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`),
    `Accesibilidad en ${context}`,
  ).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page, context: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `Desbordamiento horizontal en ${context}`).toBeLessThanOrEqual(0);
}

/** Un ciclo del proceso de envío (npm run worker -- --once), con el mismo entorno que la API de pruebas. */
export function runWorkerOnce() {
  const result = spawnSync('npx', ['tsx', 'src/worker.ts', '--once'], {
    cwd: path.resolve(HERE, '../../api'),
    env: apiEnv(process.env.TEST_DATABASE_URL!),
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.status !== 0) throw new Error(`El proceso de envío falló: ${result.stderr || result.stdout}`);
}

/** Mensajes que ha recibido el simulador local del proveedor (no se envía nada real). */
export function simulatedEmails(to: string): Array<Record<string, string>> {
  if (!existsSync(SINK_FILE)) return [];
  return readFileSync(SINK_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, string>)
    .filter((m) => m.to === to);
}

/** Termina ya la prueba gratuita de una empresa con la herramienta de operación (rol propietario). */
export function endTrialNow(companyId: string) {
  const result = spawnSync('npx', ['tsx', 'scripts/ops.ts', 'plan', '--company', companyId, '--plan', 'starter', '--status', 'trialing', '--trial-days', '0'], {
    cwd: path.resolve(HERE, '../../api'),
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MIGRATION_DATABASE_URL: process.env.TEST_MIGRATION_DATABASE_URL },
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.status !== 0) throw new Error(`No se pudo terminar la prueba: ${result.stderr || result.stdout}`);
}
