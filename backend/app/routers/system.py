from __future__ import annotations

import shutil
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user
from ..models import Asset, Generation, UsageEvent, User
from ..redis_client import get_redis
from ..storage import get_storage

router = APIRouter(tags=["sistema"])

REQUESTS = Counter("mw_http_requests_total", "HTTP requests", ["method", "route", "status"])
LATENCY = Histogram("mw_http_request_seconds", "HTTP latency", ["route"])
JOBS = Gauge("mw_jobs", "Jobs by status", ["status"])


@router.get("/api/health")
async def health(db: AsyncSession = Depends(get_db)):
    checks: dict[str, dict] = {}
    t = time.perf_counter()
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = {"ok": True, "ms": round((time.perf_counter() - t) * 1000, 1)}
    except Exception as e:  # noqa: BLE001
        checks["database"] = {"ok": False, "error": type(e).__name__}
    r = await get_redis()
    if r is None:
        checks["redis"] = {"ok": get_settings().queue_mode == "inline", "error": None if get_settings().queue_mode == "inline" else "no disponible",
                           "mode": get_settings().queue_mode}
    else:
        try:
            await r.ping()
            checks["redis"] = {"ok": True}
        except Exception as e:  # noqa: BLE001
            checks["redis"] = {"ok": False, "error": type(e).__name__}
    try:
        st = get_storage()
        await st.put_bytes("healthcheck/ping", b"ok", "text/plain")
        checks["storage"] = {"ok": True, "backend": get_settings().storage_backend}
    except Exception as e:  # noqa: BLE001
        checks["storage"] = {"ok": False, "error": type(e).__name__}
    checks["ffmpeg"] = {"ok": shutil.which(get_settings().ffmpeg_bin) is not None}
    ok = all(c["ok"] for c in checks.values())
    return {"ok": ok, "checks": checks, "version": "1.0.0", "environment": get_settings().environment}


@router.get("/api/metrics")
async def metrics(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Generation.status, func.count()).group_by(Generation.status))).all()
    for status, n in rows:
        JOBS.labels(status=status).set(n)
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@router.get("/api/usage")
async def usage(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=30)
    by_status = dict((await db.execute(select(Generation.status, func.count()).where(Generation.user_id == user.id, Generation.is_child.is_(False))
                                       .group_by(Generation.status))).all())
    spend = (await db.execute(select(func.coalesce(func.sum(UsageEvent.estimated_cost_usd), 0.0))
                              .where(UsageEvent.user_id == user.id, UsageEvent.created_at >= since))).scalar_one()
    by_provider = (await db.execute(select(UsageEvent.provider, func.count(), func.coalesce(func.sum(UsageEvent.estimated_cost_usd), 0.0))
                                    .where(UsageEvent.user_id == user.id, UsageEvent.created_at >= since).group_by(UsageEvent.provider))).all()
    storage = (await db.execute(select(func.coalesce(func.sum(Asset.size_bytes), 0)).where(Asset.user_id == user.id, Asset.deleted_at.is_(None)))).scalar_one()
    counts = dict((await db.execute(select(Asset.kind, func.count()).where(Asset.user_id == user.id, Asset.deleted_at.is_(None), Asset.source != "mask")
                                    .group_by(Asset.kind))).all())
    s = get_settings()
    return {"generations_by_status": by_status, "estimated_spend_30d_usd": round(float(spend), 4),
            "by_provider_30d": [{"provider": p, "jobs": n, "estimated_usd": round(float(c), 4)} for p, n, c in by_provider],
            "storage_bytes": int(storage), "storage_quota_bytes": s.user_storage_quota_mb * 1024 * 1024, "assets_by_kind": counts,
            "limits": {"max_active_jobs": s.max_active_jobs_per_user, "daily_generations": s.daily_generation_limit}}
