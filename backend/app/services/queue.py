"""Job queue facade: arq (Redis) in production, in-process tasks for dev/tests."""
from __future__ import annotations

import asyncio
import logging
import time

from ..config import get_settings

log = logging.getLogger(__name__)
_pool = None
_inline_tasks: dict[str, asyncio.Task] = {}


async def get_pool():
    global _pool
    if _pool is None:
        from arq import create_pool
        from arq.connections import RedisSettings

        _pool = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
    _pool = None


async def enqueue_generation(gen_id: str, queue: str, defer: bool = False) -> None:
    s = get_settings()
    if s.queue_mode == "inline":
        from .generation import execute_generation

        task = asyncio.create_task(execute_generation(gen_id))
        _inline_tasks[gen_id] = task
        task.add_done_callback(lambda _t, gid=gen_id: _inline_tasks.pop(gid, None))
        return
    pool = await get_pool()
    job_id = f"gen-{gen_id}-{int(time.time() * 1000)}"
    await pool.set(f"mw:jobid:{gen_id}", job_id, ex=60 * 60 * 24)
    await pool.enqueue_job("run_generation", gen_id, _queue_name=queue, _job_id=job_id)


async def abort_job(gen_id: str) -> None:
    s = get_settings()
    if s.queue_mode == "inline":
        t = _inline_tasks.get(gen_id)
        # Remote provider polling stops cooperatively via cancel_requested; local
        # FFmpeg work is interrupted directly.
        if t and not t.done():
            from ..models import Generation
            from ..db import get_sessionmaker

            async with get_sessionmaker()() as db:
                g = await db.get(Generation, gen_id)
                local = g is not None and g.provider == "local"
            if local:
                t.cancel()
        return
    try:
        from arq.jobs import Job

        pool = await get_pool()
        job_id = await pool.get(f"mw:jobid:{gen_id}")
        if job_id:
            job = Job(job_id.decode() if isinstance(job_id, bytes) else job_id, pool, _queue_name=None)
            await job.abort(timeout=0)
    except Exception:  # noqa: BLE001
        log.debug("abort failed for %s", gen_id, exc_info=True)


async def wait_inline(timeout: float = 60) -> None:
    """Test helper: wait until all inline jobs finish."""
    end = time.monotonic() + timeout
    while _inline_tasks and time.monotonic() < end:
        await asyncio.sleep(0.05)
