from __future__ import annotations

import logging
import time
from collections import defaultdict

from redis.asyncio import Redis

from .config import get_settings

log = logging.getLogger(__name__)
_redis: Redis | None = None
_redis_ok: bool | None = None


async def get_redis() -> Redis | None:
    """Return a Redis client, or None when Redis is unreachable (dev/tests)."""
    global _redis, _redis_ok
    if _redis_ok is False:
        return None
    if _redis is None:
        _redis = Redis.from_url(get_settings().redis_url, decode_responses=True, socket_connect_timeout=1.5)
    if _redis_ok is None:
        try:
            await _redis.ping()
            _redis_ok = True
        except Exception:  # noqa: BLE001
            log.warning("Redis unreachable at %s; using in-process fallbacks", get_settings().redis_url)
            _redis_ok = False
            return None
    return _redis


async def close_redis() -> None:
    global _redis, _redis_ok
    if _redis is not None:
        await _redis.aclose()
    _redis = None
    _redis_ok = None


class _MemoryWindow:
    def __init__(self) -> None:
        self.hits: dict[str, list[float]] = defaultdict(list)

    def hit(self, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        bucket = [t for t in self.hits[key] if now - t < window]
        if len(bucket) >= limit:
            self.hits[key] = bucket
            return False
        bucket.append(now)
        self.hits[key] = bucket
        return True


_memory = _MemoryWindow()


async def rate_limit_hit(key: str, limit: int, window_seconds: int = 60) -> bool:
    """Fixed-window limiter. Returns True when the request is allowed."""
    r = await get_redis()
    if r is None:
        return _memory.hit(key, limit, window_seconds)
    bucket = f"rl:{key}:{int(time.time() // window_seconds)}"
    count = await r.incr(bucket)
    if count == 1:
        await r.expire(bucket, window_seconds + 1)
    return count <= limit


def reset_memory_limits() -> None:
    _memory.hits.clear()


def reset_redis_client() -> None:
    """Forget the cached client (tests run each case in a fresh event loop)."""
    global _redis, _redis_ok
    _redis = None
    _redis_ok = None
