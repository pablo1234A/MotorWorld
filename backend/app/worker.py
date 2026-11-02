"""arq worker entrypoint.

Run one process per queue type so heavy work never blocks other work::

    arq app.worker.GenerateWorker   # remote provider calls (high concurrency, I/O bound)
    arq app.worker.MediaWorker      # FFmpeg/Pillow (CPU bound, low concurrency)
    arq app.worker.GpuWorker        # local Diffusers (one job per GPU)

Scale horizontally by starting more containers of each type.
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path

from arq import cron
from arq.connections import RedisSettings

from .config import get_settings
from .db import reset_engine
from .logging_setup import setup_logging

log = logging.getLogger("motorworld.worker")


async def run_generation(ctx, gen_id: str) -> None:
    from .services.generation import execute_generation

    await execute_generation(gen_id)


async def recover_stale(ctx) -> None:
    from .services.generation import recover_stale_jobs

    n = await recover_stale_jobs()
    if n:
        log.warning("Recuperados %d trabajos interrumpidos", n)


async def cleanup_tmp(ctx) -> None:
    s = get_settings()
    cutoff = time.time() - s.tmp_max_age_hours * 3600
    removed = 0
    for p in Path(s.tmp_dir).glob("*"):
        try:
            if p.stat().st_mtime < cutoff:
                if p.is_dir():
                    import shutil

                    shutil.rmtree(p, ignore_errors=True)
                else:
                    p.unlink(missing_ok=True)
                removed += 1
        except FileNotFoundError:
            pass
    if removed:
        log.info("Limpieza: %d archivos temporales eliminados", removed)


async def startup(ctx) -> None:
    setup_logging()
    get_settings().tmp_dir.mkdir(parents=True, exist_ok=True)
    log.info("Worker iniciado (cola=%s)", ctx.get("queue_name"))


async def shutdown(ctx) -> None:
    await reset_engine()


_s = get_settings()
_redis = RedisSettings.from_dsn(_s.redis_url)
_common = dict(functions=[run_generation], on_startup=startup, on_shutdown=shutdown, redis_settings=_redis,
               job_timeout=_s.job_timeout_seconds + 120, allow_abort_jobs=True, max_tries=1, keep_result=3600)


class GenerateWorker:
    queue_name = _s.queue_generate
    max_jobs = int(os.getenv("WORKER_CONCURRENCY", "20"))
    cron_jobs = [cron(recover_stale, minute=set(range(0, 60, 2)), run_at_startup=True), cron(cleanup_tmp, minute={7, 37})]


class MediaWorker:
    queue_name = _s.queue_media
    max_jobs = int(os.getenv("WORKER_CONCURRENCY", "2"))


class GpuWorker:
    queue_name = _s.queue_gpu
    max_jobs = int(os.getenv("WORKER_CONCURRENCY", "1"))


for _cls in (GenerateWorker, MediaWorker, GpuWorker):
    for _k, _v in _common.items():
        setattr(_cls, _k, _v)
