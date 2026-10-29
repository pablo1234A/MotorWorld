import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { RateLimitRule } from '../config.js';
import type { Db } from '../db/database.js';

/*
 * Límites de peticiones con almacén compartido en PostgreSQL (tabla rate_limit_counters):
 * el mismo contador para todas las instancias de la API y sin perderse al reiniciar. Cada
 * golpe es UNA sentencia atómica (INSERT … ON CONFLICT DO UPDATE), así que las peticiones
 * simultáneas no se saltan el límite. La clave se guarda resumida (SHA-256): ni IPs ni emails
 * en claro. Si la base de datos falla, el error se propaga (503): no se deja pasar sin límite.
 */

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** Suma un golpe a la clave y devuelve el total de la ventana y el tiempo que le queda. */
export async function hitCounter(db: Db, key: string, windowMs: number): Promise<{ current: number; ttlMs: number }> {
  const { rows } = await sql<{ hits: number; ttl_ms: number }>`
    insert into rate_limit_counters as c (key_hash, hits, reset_at)
    values (${hashKey(key)}, 1, now() + ${windowMs} * interval '1 millisecond')
    on conflict (key_hash) do update set
      hits = case when c.reset_at <= now() then 1 else c.hits + 1 end,
      reset_at = case when c.reset_at <= now() then now() + ${windowMs} * interval '1 millisecond' else c.reset_at end
    returning hits, greatest(0, floor(extract(epoch from (reset_at - now())) * 1000))::bigint as ttl_ms`.execute(db);
  return { current: rows[0]!.hits, ttlMs: Number(rows[0]!.ttl_ms) };
}

/**
 * Limitador por clave (p. ej. email) con la misma semántica que antes: hit() registra un
 * intento y devuelve false si se supera el límite; isBlocked() consulta sin registrar.
 */
export interface KeyedLimiter {
  hit(key: string): Promise<boolean>;
  isBlocked(key: string): Promise<boolean>;
  reset(key: string): Promise<void>;
}

export function createSharedLimiter(db: Db, name: string, rule: RateLimitRule): KeyedLimiter {
  const k = (key: string) => `${name}:${key.toLowerCase()}`;
  return {
    async hit(key) {
      return (await hitCounter(db, k(key), rule.windowMs)).current <= rule.max;
    },
    async isBlocked(key) {
      const { rows } = await sql<{ hits: number }>`
        select hits from rate_limit_counters where key_hash = ${hashKey(k(key))} and reset_at > now()`.execute(db);
      return (rows[0]?.hits ?? 0) >= rule.max;
    },
    async reset(key) {
      await sql`delete from rate_limit_counters where key_hash = ${hashKey(k(key))}`.execute(db);
    },
  };
}

/**
 * Almacén para @fastify/rate-limit con la misma tabla. Cada ruta con límite propio tiene su
 * espacio de claves (método + URL), como el almacén en memoria del complemento.
 */
export function postgresRateLimitStore(db: Db) {
  return class PostgresRateLimitStore {
    constructor(
      _options?: unknown,
      private readonly prefix = 'global',
    ) {}

    incr(key: string, cb: (err: Error | null, res?: { current: number; ttl: number }) => void, timeWindow: number) {
      hitCounter(db, `rl:${this.prefix}:${key}`, timeWindow).then(
        (r) => cb(null, { current: r.current, ttl: r.ttlMs }),
        (err: Error) => cb(err),
      );
    }

    // El complemento llama a child() con los parámetros de cada ruta que tiene límite propio
    // (routeInfo es la definición de la ruta; vacía en los limitadores creados a mano).
    // (Los tipos del complemento lo declaran como RouteOptions; en ejecución llegan los parámetros.)
    child(options: object) {
      const params = options as { groupId?: string; routeInfo?: { method?: string | string[]; url?: string } };
      const route = params.routeInfo ?? {};
      const method = Array.isArray(route.method) ? route.method.join(',') : (route.method ?? '');
      return new PostgresRateLimitStore(undefined, params.groupId ? `group:${params.groupId}` : `${method}:${route.url ?? ''}`);
    }
  };
}

/** Limpieza de contadores caducados (trabajo de retención). */
export async function purgeExpiredCounters(db: Db): Promise<number> {
  const res = await db.deleteFrom('rateLimitCounters').where('resetAt', '<', sql<Date>`now() - interval '1 hour'`).executeTakeFirst();
  return Number(res.numDeletedRows);
}
