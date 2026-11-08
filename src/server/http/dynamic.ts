import "server-only";

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";

/**
 * Marca una ruta como dinámica (nunca se pregenera ni se cachea). Fuera de una
 * petición de Next (procesos, pruebas) connection() lanza un error normal, que
 * se ignora; las señales internas de Next se relanzan.
 */
export async function dynamicRequest(): Promise<void> {
  try {
    await connection();
  } catch (err) {
    unstable_rethrow(err);
  }
}
