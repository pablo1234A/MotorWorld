// Validación de direcciones de correo (sintaxis práctica compatible con RFC 5321 para envíos reales).
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const DISPOSABLE_TLDS = new Set(["invalid", "test", "example", "localhost", "local"]);

export function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  if (email.length < 6 || email.length > 254) return false;
  if (!EMAIL_RE.test(email)) return false;
  const [local, domain] = email.split("@");
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const tld = domain.split(".").pop()!.toLowerCase();
  if (DISPOSABLE_TLDS.has(tld) || !/^[a-z]{2,}$/i.test(tld) && !/^xn--/.test(tld)) return false;
  return true;
}

export const normalizeEmailAddress = (e: string) => e.trim().toLowerCase();
