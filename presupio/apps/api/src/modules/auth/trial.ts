import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { Trx } from '../../db/database.js';

/*
 * Protección proporcionada contra el abuso de la prueba gratuita (P2-01).
 *
 * Reglas (al crear una empresa nueva, no al unirse a una existente):
 *  1. Una dirección de email solo disfruta de UNA prueba. Se normaliza: minúsculas, sin
 *     «+etiqueta» y, en Gmail, sin puntos (ana.p+x@gmail.com = anap@gmail.com).
 *  2. Un dominio de empresa (no los de correo gratuito) solo abre una prueba cada
 *     TRIAL_DOMAIN_RULE_DAYS días (365 por defecto; 0 la desactiva).
 *  3. Los dominios de correo desechable conocidos no abren prueba.
 * Quien no cumple puede registrarse igualmente: la cuenta queda sin plan (solo lectura) y
 * puede contratar un plan; soporte puede conceder una prueba (npm run ops -- plan … trialing).
 *
 * Privacidad: solo se guardan huellas SHA-256 (trial_claims), 24 meses como máximo.
 * Falsos positivos conocidos (docs/facturacion.md): dos personas distintas del mismo dominio
 * de empresa en menos de un año, o alguien que se da de baja y vuelve.
 */

export const TRIAL_CLAIM_RETENTION_DAYS = 730;

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.es', 'msn.com',
  'yahoo.com', 'yahoo.es', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'gmx.com', 'gmx.es', 'gmx.net',
  'proton.me', 'protonmail.com', 'pm.me', 'zoho.com', 'zohomail.eu', 'yandex.com', 'mail.com', 'tutanota.com', 'tuta.io',
  'fastmail.com', 'hey.com', 'mailbox.org', 'telefonica.net', 'movistar.es', 'terra.es', 'orange.es', 'vodafone.es',
  'ono.com', 'wanadoo.es', 'jazztel.es', 'euskaltel.net', 'ya.com',
]);

// Lista corta de proveedores desechables conocidos: no pretende ser exhaustiva.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com', '10minutemail.com', 'temp-mail.org',
  'tempmail.com', 'yopmail.com', 'yopmail.fr', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc',
  'throwawaymail.com', 'emailondeck.com', 'mohmal.com', 'mailnesia.com', 'tempr.email', 'fakeinbox.com',
]);

const hash = (kind: 'email' | 'domain', value: string) =>
  createHash('sha256').update(`presupio-trial:${kind}:${value}`).digest('hex');

function split(email: string): [string, string] {
  const at = email.lastIndexOf('@');
  return [email.slice(0, at), email.slice(at + 1)];
}

/** Dirección normalizada para reconocer la misma bandeja de entrada. */
export function normalizeTrialEmail(email: string): string {
  const [local, domain] = split(email.trim().toLowerCase());
  let user = local.split('+')[0]!;
  let host = domain;
  if (host === 'gmail.com' || host === 'googlemail.com') {
    user = user.replace(/\./g, '');
    host = 'gmail.com';
  }
  return `${user}@${host}`;
}

/** Dominio de empresa del email, o null si es de un proveedor de correo gratuito. */
export function trialCompanyDomain(email: string): string | null {
  const domain = split(email.trim().toLowerCase())[1];
  return domain && !FREE_EMAIL_DOMAINS.has(domain) && !DISPOSABLE_DOMAINS.has(domain) ? domain : null;
}

export type TrialDenial = 'email' | 'domain' | 'disposable';

/** ¿Puede esta dirección abrir una prueba gratuita? (bloquea el dominio hasta el final de la transacción) */
export async function trialEligibility(trx: Trx, email: string, domainRuleDays: number, now = new Date()): Promise<TrialDenial | null> {
  const lower = email.trim().toLowerCase();
  const domain = split(lower)[1];
  if (DISPOSABLE_DOMAINS.has(domain)) return 'disposable';
  const day = 86_400_000;
  // También la forma sin normalizar: las huellas anteriores a 0010 solo pasaron a minúsculas.
  const emailHashes = [...new Set([hash('email', normalizeTrialEmail(lower)), hash('email', lower)])];
  const since = new Date(now.getTime() - TRIAL_CLAIM_RETENTION_DAYS * day);
  if (await claimed(trx, 'email', emailHashes, since)) return 'email';
  const company = trialCompanyDomain(lower);
  if (company && domainRuleDays > 0) {
    // Dos altas simultáneas del mismo dominio no pueden obtener ambas la prueba.
    await sql`select pg_advisory_xact_lock(hashtextextended(${hash('domain', company)}, 0))`.execute(trx);
    if (await claimed(trx, 'domain', [hash('domain', company)], new Date(now.getTime() - domainRuleDays * day))) return 'domain';
  }
  return null;
}

async function claimed(trx: Trx, kind: 'email' | 'domain', hashes: string[], since: Date): Promise<boolean> {
  const { rows } = await sql<{ claimed: boolean }>`select app_trial_claimed(${kind}, ${hashes}::text[], ${since}) as claimed`.execute(trx);
  return rows[0]?.claimed === true;
}

/** Deja la huella de la prueba concedida (dentro del contexto de la empresa nueva). */
export async function recordTrialClaim(trx: Trx, companyId: string, email: string): Promise<void> {
  const values: Array<{ kind: 'email' | 'domain'; valueHash: string; companyId: string }> = [
    { kind: 'email', valueHash: hash('email', normalizeTrialEmail(email)), companyId },
  ];
  const company = trialCompanyDomain(email);
  if (company) values.push({ kind: 'domain', valueHash: hash('domain', company), companyId });
  await trx.insertInto('trialClaims').values(values).execute();
}
