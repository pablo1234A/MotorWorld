import argon2 from 'argon2';

// Argon2id con parámetros recomendados por OWASP (19 MiB, 2 iteraciones).
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verificación contra un hash ficticio para que el tiempo de respuesta no revele
 * si un email está registrado.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('presupio-dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}
