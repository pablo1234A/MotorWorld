"""Central job service.

Lifecycle: ``create_generation`` validates + persists a ``queued`` row and
enqueues it; a worker calls ``execute_generation`` which selects a provider
route (falling back to the next configured route on retryable failures),
submits, polls until done (honouring cancellation), downloads every output
into our storage as new Assets, and records cost + attempt log.
"""
from __future__ import annotations

import asyncio
import logging
import mimetypes
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_sessionmaker
from ..errors import bad_request, too_many
from ..models import ACTIVE_STATUSES, Asset, Generation, JobStatus, UsageEvent, User
from ..providers.base import (
    InputFile, JobState, OutputItem, ProviderCancelled, ProviderError, ProviderNotConfigured, ProviderRequest,
)
from ..providers.catalog import ModelSpec, estimate_cost, get_model
from ..providers.http import download
from ..providers.registry import candidate_routes, user_credentials
from ..storage import get_storage, tmp_path
from .assets import asset_local_copy, ingest_file

log = logging.getLogger(__name__)

LOCAL_TASKS = {"local_image_op", "local_video_op", "local_audio_op", "timeline_render", "video_extend"}
PIPELINE_TASKS = {"video_extend", "timeline_render", "film_develop", "edit_chain", "film_batch", "multi_shot"}
PIPELINE_REMOTE_TASKS = {"film_develop", "edit_chain", "film_batch", "multi_shot"}
ROLE_KIND = {"image": "image", "end_image": "image", "mask": "image", "reference": "image", "video": "video", "audio": "audio"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def queue_for(task: str, model: ModelSpec | None, first_provider: str | None = None) -> str:
    """Independent queues so slow local renders never block remote generations."""
    s = get_settings()
    if first_provider == "diffusers":
        return s.queue_gpu
    if task in PIPELINE_REMOTE_TASKS:
        return s.queue_generate
    if task in LOCAL_TASKS or (model and model.local_only) or first_provider == "local":
        return s.queue_media
    return s.queue_generate


async def check_user_limits(db: AsyncSession, user: User) -> None:
    s = get_settings()
    active = (await db.execute(
        select(func.count()).select_from(Generation).where(Generation.user_id == user.id, Generation.status.in_(ACTIVE_STATUSES))
    )).scalar_one()
    if active >= s.max_active_jobs_per_user:
        raise too_many(f"Tienes {active} trabajos en curso (máximo {s.max_active_jobs_per_user}). Espera a que terminen o cancela alguno.",
                       code="concurrency_limit")
    since = utcnow() - timedelta(days=1)
    today = (await db.execute(
        select(func.count()).select_from(Generation).where(Generation.user_id == user.id, Generation.created_at >= since)
    )).scalar_one()
    if today >= s.daily_generation_limit:
        raise too_many(f"Has alcanzado el límite diario de {s.daily_generation_limit} trabajos.", code="daily_limit")


async def create_generation(
    db: AsyncSession, user: User, *, task: str, model_id: str, prompt: str = "", negative_prompt: str = "",
    params: dict[str, Any] | None = None, inputs: dict[str, str | list[str]] | None = None, project_id: str | None = None,
    provider: str | None = None, parent_generation_id: str | None = None, enqueue: bool = True, skip_limits: bool = False,
    is_child: bool = False,
) -> Generation:
    model = get_model(model_id)
    if model is None:
        raise bad_request(f"Modelo desconocido: {model_id}", code="unknown_model")
    if task not in model.tasks:
        raise bad_request(f"{model.name} no admite la operación '{task}'", code="unsupported_task")
    params = dict(params or {})
    if negative_prompt and not model.supports_negative_prompt:
        negative_prompt = ""  # never pretend: drop it and tell the user in the record
        params["_dropped"] = ["negative_prompt"]
    # Validate inputs belong to the user and have the right media kind.
    input_ids: list[str] = []
    roles: dict[str, list[str]] = {}
    for role, ids in (inputs or {}).items():
        for aid in [ids] if isinstance(ids, str) else list(ids):
            if not aid:
                continue
            a = await db.get(Asset, aid)
            if a is None or a.user_id != user.id or a.deleted_at is not None:
                raise bad_request("Archivo de entrada no encontrado", code="input_not_found")
            want = ROLE_KIND.get(role)
            if want and a.kind != want and not (role == "audio" and a.kind == "video"):
                raise bad_request(f"La entrada '{role}' debe ser {want}, no {a.kind}", code="input_kind")
            roles.setdefault(role, []).append(aid)
            input_ids.append(aid)
    params["_roles"] = roles
    if not skip_limits:
        await check_user_limits(db, user)

    creds = await user_credentials(db, user.id)
    routes = candidate_routes(model, task, creds, provider, (user.preferences or {}).get("provider_order"))
    if not routes and task not in ("film_develop",):
        needed = sorted({r.provider for r in model.routes if task in r.endpoints})
        raise bad_request(
            f"Ningún proveedor configurado para {model.name}. Configura una API key de: {', '.join(needed)} "
            f"(Configuración → Claves API) o elige otro modelo.",
            code="provider_not_configured", providers=needed,
        )
    est, note = (None, "")
    if routes:
        est, note = estimate_cost(model, routes[0].route, params)
    gen = Generation(
        user_id=user.id, project_id=project_id, task=task, model_id=model_id, prompt=prompt, negative_prompt=negative_prompt,
        params=params, input_asset_ids=input_ids, preferred_provider=provider, queue=queue_for(task, model, routes[0].route.provider if routes else None),
        provider=routes[0].route.provider if routes else None, estimated_cost_usd=est, cost_note=note,
        parent_generation_id=parent_generation_id, status=JobStatus.queued, is_child=is_child,
    )
    db.add(gen)
    await db.commit()
    await db.refresh(gen)
    if enqueue:
        from .queue import enqueue_generation

        await enqueue_generation(gen.id, gen.queue)
    return gen


# ---------------------------------------------------------------------------
# Execution (worker side)
# ---------------------------------------------------------------------------
class _Ctx:
    """Small helper persisting job state with short-lived sessions."""

    def __init__(self, gen_id: str):
        self.gen_id = gen_id
        self.sm = get_sessionmaker()

    async def update(self, **values) -> None:
        values.setdefault("heartbeat_at", utcnow())
        async with self.sm() as db:
            await db.execute(update(Generation).where(Generation.id == self.gen_id).values(**values))
            await db.commit()

    async def load(self) -> Generation | None:
        async with self.sm() as db:
            return await db.get(Generation, self.gen_id)

    async def cancelled(self) -> bool:
        async with self.sm() as db:
            res = await db.execute(select(Generation.cancel_requested).where(Generation.id == self.gen_id))
            return bool(res.scalar_one_or_none())


async def _materialise_inputs(gen: Generation) -> list[InputFile]:
    s = get_settings()
    files: list[InputFile] = []
    roles: dict[str, list[str]] = (gen.params or {}).get("_roles", {})
    async with get_sessionmaker()() as db:
        for role, ids in roles.items():
            for aid in ids:
                a = await db.get(Asset, aid)
                if a is None or a.user_id != gen.user_id:
                    raise ProviderError("Entrada no disponible", retryable=False)
                path = await asset_local_copy(a)
                url = None
                if s.storage_backend == "s3" and s.s3_presign_for_providers:
                    url = await get_storage().presigned_url(a.storage_key)
                files.append(InputFile(role=role, path=path, mime=a.mime, url=url))
    return files


async def _store_outputs(gen: Generation, outputs: list[OutputItem], provider: str) -> list[str]:
    ids: list[str] = []
    async with get_sessionmaker()() as db:
        for i, out in enumerate(outputs):
            path: Path
            if out.path:
                path = out.path
            elif out.data is not None:
                ext = mimetypes.guess_extension(out.mime or "") or ".bin"
                path = tmp_path(ext)
                path.write_bytes(out.data)
            elif out.url:
                path = await download(out.url, tmp_path(Path(out.url.split("?")[0]).suffix[:6] or ".bin"))
            else:
                continue
            try:
                parent = (gen.input_asset_ids or [None])[0] if gen.task in (
                    "image_edit", "inpaint", "outpaint", "upscale_image", "remove_background", "local_image_op",
                    "local_video_op", "video_to_video", "upscale_video", "local_audio_op", "video_extend", "image_to_image") else None
                asset = await ingest_file(
                    db, user_id=gen.user_id, path=path, source="edit" if parent else "generation", parent_id=parent,
                    generation_id=gen.id, project_id=gen.project_id, check_user_quota=True,
                    name=f"{gen.model_id}-{gen.id[:8]}-{i + 1}",
                    meta={"provider": provider, "model_id": gen.model_id, "task": gen.task, "prompt": gen.prompt[:2000],
                          "seed": out.meta.get("seed") or (gen.params or {}).get("seed"), **({"provider_meta": out.meta} if out.meta else {})},
                )
                ids.append(asset.id)
            finally:
                path.unlink(missing_ok=True)
        await db.commit()
    return ids


async def _run_route(ctx: _Ctx, gen: Generation, model: ModelSpec, choice, inputs: list[InputFile]) -> list[OutputItem]:
    adapter = choice.adapter
    endpoint = choice.route.endpoints[gen.task]

    async def progress_cb(v: float) -> None:
        await ctx.update(progress=round(v, 3))

    req = ProviderRequest(
        task=gen.task, endpoint=endpoint, prompt=gen.prompt, negative_prompt=gen.negative_prompt,
        params={k: v for k, v in (gen.params or {}).items() if not k.startswith("_")}, inputs=inputs,
        route_options={**choice.route.options, "mapper": choice.route.mapper, "progress_cb": progress_cb},
    )
    est, note = estimate_cost(model, choice.route, gen.params or {})
    await ctx.update(provider=adapter.id, provider_endpoint=endpoint, estimated_cost_usd=est, cost_note=note,
                     status=JobStatus.processing, status_message=f"Enviando a {adapter.name}")
    sub = await adapter.submit(req)
    if sub.immediate is not None:
        state = sub.immediate
    else:
        await ctx.update(provider_job_id=sub.job_id, provider_meta=sub.meta, status_message=f"Enviado a {adapter.name}")
        state = await _poll_until_done(ctx, adapter, sub.job_id, sub.meta)
    if state.status == "cancelled":
        raise ProviderCancelled("Cancelado")
    if state.status == "failed":
        raise ProviderError(state.error or "El proveedor devolvió un error", retryable=False)
    return state.outputs


async def _poll_until_done(ctx: _Ctx, adapter, job_id: str, meta: dict[str, Any]) -> JobState:
    s = get_settings()
    deadline = asyncio.get_event_loop().time() + s.job_timeout_seconds
    interval = s.provider_poll_interval
    consecutive_errors = 0
    while True:
        if await ctx.cancelled():
            try:
                await adapter.cancel(job_id, meta)
            except Exception:  # noqa: BLE001
                log.warning("cancel call failed for %s", job_id)
            return JobState("cancelled")
        try:
            state = await adapter.poll(job_id, meta)
            consecutive_errors = 0
        except ProviderError as e:
            if not e.retryable:
                raise
            consecutive_errors += 1
            if consecutive_errors > 5:
                raise
            state = JobState("processing", message=f"Reintentando consulta ({consecutive_errors})")
        if state.status in ("completed", "failed", "cancelled"):
            return state
        await ctx.update(status=JobStatus.queued if state.status == "queued" else JobStatus.processing,
                         progress=state.progress, status_message=state.message[:500])
        if asyncio.get_event_loop().time() > deadline:
            try:
                await adapter.cancel(job_id, meta)
            finally:
                raise ProviderError("Tiempo máximo de generación superado", retryable=False)
        await asyncio.sleep(interval)
        interval = min(interval * 1.2, 15)


async def execute_generation(gen_id: str) -> None:
    ctx = _Ctx(gen_id)
    gen = await ctx.load()
    if gen is None or gen.status in (JobStatus.completed, JobStatus.cancelled) or gen.deleted_at:
        return
    if gen.cancel_requested:
        await ctx.update(status=JobStatus.cancelled, finished_at=utcnow(), status_message="Cancelado antes de empezar")
        return
    await ctx.update(status=JobStatus.processing, started_at=gen.started_at or utcnow(), attempts=(gen.attempts or 0) + 1,
                     error=None, status_message="Preparando")

    if gen.task in PIPELINE_TASKS:
        from .pipelines import run_pipeline

        try:
            await run_pipeline(gen, ctx)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.exception("pipeline %s failed", gen.task)
            await ctx.update(status=JobStatus.failed, error=str(e)[:4000], finished_at=utcnow(), status_message="Error")
        return

    model = get_model(gen.model_id)
    if model is None:
        await ctx.update(status=JobStatus.failed, error="Modelo eliminado del catálogo", finished_at=utcnow())
        return
    async with get_sessionmaker()() as db:
        creds = await user_credentials(db, gen.user_id)
        user = await db.get(User, gen.user_id)
    routes = candidate_routes(model, gen.task, creds, gen.preferred_provider, ((user.preferences if user else None) or {}).get("provider_order"))
    attempt_log: list[dict[str, Any]] = list(gen.attempt_log or [])
    inputs: list[InputFile] = []
    try:
        inputs = await _materialise_inputs(gen)
        if not routes:
            raise ProviderNotConfigured("No hay proveedores configurados para este modelo")
        # Resume: a job interrupted mid-poll keeps polling the same provider job.
        if gen.provider_job_id and gen.provider:
            choice = next((c for c in routes if c.adapter.id == gen.provider), None)
            if choice is not None:
                await ctx.update(status_message="Reanudando seguimiento del trabajo")
                state = await _poll_until_done(ctx, choice.adapter, gen.provider_job_id, gen.provider_meta or {})
                if state.status == "completed":
                    ids = await _store_outputs(gen, state.outputs, choice.adapter.id)
                    await _finish(ctx, gen, ids, choice.adapter.id, attempt_log)
                    return
        last_error: Exception | None = None
        for choice in routes:
            if await ctx.cancelled():
                raise ProviderCancelled("Cancelado")
            started = utcnow()
            try:
                outputs = await _run_route(ctx, gen, model, choice, inputs)
                attempt_log.append({"provider": choice.adapter.id, "ok": True, "at": started.isoformat()})
                await ctx.update(status_message="Guardando resultados", attempt_log=attempt_log)
                ids = await _store_outputs(gen, outputs, choice.adapter.id)
                if not ids:
                    raise ProviderError("El proveedor no devolvió resultados", retryable=False)
                await _finish(ctx, gen, ids, choice.adapter.id, attempt_log)
                return
            except ProviderCancelled:
                raise
            except ProviderError as e:
                last_error = e
                attempt_log.append({"provider": choice.adapter.id, "ok": False, "error": str(e)[:500], "code": e.code, "at": started.isoformat()})
                await ctx.update(attempt_log=attempt_log, provider_job_id=None, provider_meta={})
                log.warning("generation %s: %s failed (%s), retryable=%s", gen.id, choice.adapter.id, e, e.retryable)
                if not e.retryable:
                    break
                await ctx.update(status_message=f"{choice.adapter.name} falló; probando otro proveedor")
            except Exception as e:  # noqa: BLE001 - network errors etc. are retryable
                last_error = e
                attempt_log.append({"provider": choice.adapter.id, "ok": False, "error": f"{type(e).__name__}: {e}"[:500], "at": started.isoformat()})
                await ctx.update(attempt_log=attempt_log, provider_job_id=None, provider_meta={})
                log.exception("generation %s: unexpected error on %s", gen.id, choice.adapter.id)
        raise last_error or ProviderError("Sin proveedores disponibles")
    except ProviderCancelled:
        await ctx.update(status=JobStatus.cancelled, finished_at=utcnow(), status_message="Cancelado", attempt_log=attempt_log)
    except asyncio.CancelledError:
        await ctx.update(status=JobStatus.cancelled, finished_at=utcnow(), status_message="Cancelado")
        raise
    except Exception as e:  # noqa: BLE001
        await ctx.update(status=JobStatus.failed, error=str(e)[:4000], finished_at=utcnow(), status_message="Error", attempt_log=attempt_log)
    finally:
        for f in inputs:
            f.path.unlink(missing_ok=True)


async def _finish(ctx: _Ctx, gen: Generation, ids: list[str], provider: str, attempt_log: list[dict[str, Any]]) -> None:
    # Optional deterministic post-processing (e.g. FFmpeg slow motion) on generated videos.
    post_ops = (gen.params or {}).get("post_ops")
    if post_ops and gen.task in ("text_to_video", "image_to_video", "first_last_to_video", "video_to_video"):
        from .ffmpeg_ops import apply_video_ops

        new_ids = []
        async with get_sessionmaker()() as db:
            for aid in ids:
                a = await db.get(Asset, aid)
                src = await asset_local_copy(a)
                try:
                    out = await apply_video_ops(src, post_ops)
                    b = await ingest_file(db, user_id=gen.user_id, path=out, source="edit", parent_id=a.id, generation_id=gen.id,
                                          project_id=gen.project_id, name=a.name + "-post", meta={**a.meta, "post_ops": post_ops})
                    new_ids.append(b.id)
                    out.unlink(missing_ok=True)
                finally:
                    src.unlink(missing_ok=True)
            await db.commit()
        ids = ids + new_ids
    link = (gen.params or {}).get("_film_link")
    if link and ids:
        from .film import link_output

        await link_output(link.get("film_id"), gen.user_id, link, ids[0])
    final = await ctx.load()
    async with get_sessionmaker()() as db:
        db.add(UsageEvent(user_id=gen.user_id, generation_id=gen.id, provider=provider, model_id=gen.model_id,
                          estimated_cost_usd=final.estimated_cost_usd if final else None))
        await db.commit()
    await ctx.update(status=JobStatus.completed, progress=1.0, output_asset_ids=ids, finished_at=utcnow(),
                     status_message="Completado", attempt_log=attempt_log)


# ---------------------------------------------------------------------------
# User actions
# ---------------------------------------------------------------------------
async def request_cancel(db: AsyncSession, gen: Generation) -> Generation:
    if gen.status not in ACTIVE_STATUSES:
        raise bad_request("Solo se pueden cancelar trabajos en espera o en proceso", code="not_cancellable")
    gen.cancel_requested = True
    # propagate to running child steps of a pipeline
    await db.execute(update(Generation).where(Generation.parent_generation_id == gen.id, Generation.status.in_(ACTIVE_STATUSES))
                     .values(cancel_requested=True))
    if gen.status == JobStatus.queued and not gen.provider_job_id:
        gen.status = JobStatus.cancelled
        gen.finished_at = utcnow()
        gen.status_message = "Cancelado"
    await db.commit()
    from .queue import abort_job

    await abort_job(gen.id)
    return gen


async def retry_generation(db: AsyncSession, user: User, gen: Generation) -> Generation:
    if gen.status not in (JobStatus.failed, JobStatus.cancelled):
        raise bad_request("Solo se pueden reintentar trabajos fallidos o cancelados", code="not_retryable")
    await check_user_limits(db, user)
    gen.status = JobStatus.queued
    gen.cancel_requested = False
    gen.error = None
    gen.progress = None
    gen.provider_job_id = None
    gen.provider_meta = {}
    gen.finished_at = None
    gen.status_message = "Reintento en cola"
    await db.commit()
    from .queue import enqueue_generation

    await enqueue_generation(gen.id, gen.queue)
    return gen


async def duplicate_generation(db: AsyncSession, user: User, gen: Generation, overrides: dict[str, Any] | None = None) -> Generation:
    params = {k: v for k, v in (gen.params or {}).items() if k not in ("_roles", "_dropped")}
    overrides = overrides or {}
    params.update(overrides.get("params") or {})
    roles = (gen.params or {}).get("_roles", {})
    return await create_generation(
        db, user, task=gen.task, model_id=overrides.get("model_id") or gen.model_id, prompt=overrides.get("prompt", gen.prompt),
        negative_prompt=gen.negative_prompt, params=params, inputs=roles, project_id=gen.project_id,
        provider=overrides.get("provider") or gen.preferred_provider, parent_generation_id=gen.id,
    )


async def recover_stale_jobs() -> int:
    """Re-enqueue jobs whose worker died (no heartbeat for STALE_JOB_MINUTES)."""
    s = get_settings()
    cutoff = utcnow() - timedelta(minutes=s.stale_job_minutes)
    from .queue import enqueue_generation

    n = 0
    async with get_sessionmaker()() as db:
        rows = (await db.execute(
            select(Generation).where(
                Generation.status.in_(ACTIVE_STATUSES),
                func.coalesce(Generation.heartbeat_at, Generation.created_at) < cutoff,
                Generation.deleted_at.is_(None),
            )
        )).scalars().all()
        for g in rows:
            if g.cancel_requested:
                g.status = JobStatus.cancelled
                g.finished_at = utcnow()
            elif (g.attempts or 0) >= s.job_max_attempts:
                g.status = JobStatus.failed
                g.error = "El trabajo se interrumpió repetidamente (worker caído). Puedes reintentarlo."
                g.finished_at = utcnow()
            else:
                g.status = JobStatus.queued
                g.status_message = "Recuperado tras interrupción del worker"
                g.heartbeat_at = utcnow()
                n += 1
                await db.flush()
                await enqueue_generation(g.id, g.queue, defer=False)
        await db.commit()
    return n


def generation_to_dict(g: Generation, assets: dict[str, Asset] | None = None) -> dict[str, Any]:
    from .assets import asset_to_dict

    model = get_model(g.model_id)
    return {
        "id": g.id, "task": g.task, "model_id": g.model_id, "model_name": model.name if model else g.model_id,
        "provider": g.provider, "provider_endpoint": g.provider_endpoint, "status": g.status, "progress": g.progress,
        "status_message": g.status_message, "prompt": g.prompt, "negative_prompt": g.negative_prompt,
        "params": {k: v for k, v in (g.params or {}).items() if not k.startswith("_") or k in ("_dropped",)},
        "inputs": (g.params or {}).get("_roles", {}),
        "input_asset_ids": g.input_asset_ids or [], "output_asset_ids": g.output_asset_ids or [],
        "outputs": [asset_to_dict(assets[a]) for a in (g.output_asset_ids or []) if assets and a in assets],
        "estimated_cost_usd": g.estimated_cost_usd, "cost_note": g.cost_note, "error": g.error, "attempts": g.attempts,
        "attempt_log": g.attempt_log or [], "project_id": g.project_id, "is_saved": g.is_saved,
        "parent_generation_id": g.parent_generation_id, "is_child": g.is_child,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "started_at": g.started_at.isoformat() if g.started_at else None,
        "finished_at": g.finished_at.isoformat() if g.finished_at else None,
    }
