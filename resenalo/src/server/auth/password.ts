import { hash, verify } from "@node-rs/argon2";

// Parámetros Argon2id (OWASP 2024: m=19 MiB, t=2, p=1 como mínimo).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}

// Hash ficticio para igualar tiempos cuando el usuario no existe (evita enumeración).
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummy ??= hashPassword("resenalo-dummy-password-for-timing");
  await verifyPassword(await dummy, password);
}

const COMMON = new Set([
  "1234567890", "contraseña", "contrasena", "password123", "qwertyuiop", "123456789a", "resenalo123", "password1234", "12345678910",
]);

/** Devuelve un mensaje de error o null si la contraseña es aceptable. */
export function passwordPolicyError(password: string, email?: string): string | null {
  if (password.length < 10) return "La contraseña debe tener al menos 10 caracteres.";
  if (password.length > 128) return "La contraseña no puede superar los 128 caracteres.";
  if (!/[a-zA-ZÀ-ÿ]/.test(password) || !/\d/.test(password)) return "La contraseña debe combinar letras y números.";
  if (COMMON.has(password.toLowerCase())) return "Esa contraseña es demasiado común.";
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4)
    return "La contraseña no debe contener tu dirección de correo.";
  return null;
}
