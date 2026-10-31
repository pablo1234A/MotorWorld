import IORedis, { type Redis } from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function redis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null, // requerido por BullMQ
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }
  return globalForRedis.redis;
}
