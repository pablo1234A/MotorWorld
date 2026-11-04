import { db } from "./support/env";

/**
 * Los E2E hacen muchos registros/accesos desde la misma IP (127.0.0.1): se
 * vacían los contadores de rate limiting antes de empezar para que una
 * ejecución anterior no bloquee esta. (La protección se prueba aparte.)
 */
export default async function globalSetup() {
  await db("delete from private.rate_limit_buckets");
}
