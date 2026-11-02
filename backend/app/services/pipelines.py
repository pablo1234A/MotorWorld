"""Multi-step jobs executed by the worker: video extension, timeline render,
story development, edit chains and batch film production.

Child steps are real ``Generation`` rows (visible in the history) executed
inline in the same worker so a pipeline counts as a single active job.
"""
from __future__ import annotations

import logging
from typing import Any

from ..db import get_sessionmaker
from ..models import Asset, Film, Generation, JobStatus, Timeline, User
from ..providers.registry import user_credentials
from .assets import asset_local_copy, ingest_file

log = logging.getLogger(__name__)


class PipelineError(Exception):
    pass


async def _child(parent: Generation, ctx, *, task: str, model_id: str, prompt: str = "", negative_prompt: str = "",
                 params: dict | None = None, inputs: dict | None = None, provider: str | None = None, label: str = "") -> Generation:
    from .generation import create_generation, execute_generation

    if await ctx.cancelled():
        raise PipelineError("Cancelado")
    async with get_sessionmaker()() as db:
        user = await db.get(User, parent.user_id)
        child = await create_generation(db, user, task=task, model_id=model_id, prompt=prompt, negative_prompt=negative_prompt,
                                        params=params or {}, inputs=inputs or {}, project_id=parent.project_id, provider=provider,
                                        parent_generation_id=parent.id, enqueue=False, skip_limits=True, is_child=True)
    await ctx.update(status_message=(label or task)[:200])
    await execute_generation(child.id)
    async with get_sessionmaker()() as db:
        done = await db.get(Generation, child.id)
    if done.status != JobStatus.completed:
        raise PipelineError(f"{label or task}: {done.error or done.status}")
    return done


async def run_pipeline(gen: Generation, ctx) -> None:
    handler = {
        "video_extend": _video_extend, "timeline_render": _timeline_render, "film_develop": _film_develop,
        "edit_chain": _edit_chain, "film_batch": _film_batch, "multi_shot": _multi_shot,
    }[gen.task]
    try:
        outputs = await handler(gen, ctx)
    except PipelineError as e:
        if str(e) == "Cancelado" or await ctx.cancelled():
            from .generation import utcnow

            await ctx.update(status=JobStatus.cancelled, finished_at=utcnow(), status_message="Cancelado")
            return
        raise
    from .generation import utcnow

    await ctx.update(status=JobStatus.completed, progress=1.0, output_asset_ids=outputs or [], finished_at=utcnow(),
                     status_message="Completado", provider="local" if gen.task != "film_develop" else gen.provider)


# ---------------------------------------------------------------------------
async def _video_extend(gen: Generation, ctx) -> list[str]:
    from . import ffmpeg_ops as ff

    p = gen.params or {}
    vid_id = (p.get("_roles", {}).get("video") or [None])[0]
    i2v_model = p.get("i2v_model")
    if not vid_id or not i2v_model:
        raise PipelineError("Faltan el vídeo de entrada o el modelo de imagen a vídeo")
    async with get_sessionmaker()() as db:
        video = await db.get(Asset, vid_id)
        src = await asset_local_copy(video)
        await ctx.update(status_message="Extrayendo el último fotograma", progress=0.05)
        frame = await ff.extract_frame(src, "last")
        frame_asset = await ingest_file(db, user_id=gen.user_id, path=frame, source="edit", parent_id=video.id, generation_id=gen.id,
                                        project_id=gen.project_id, name=f"{video.name}-ultimo-fotograma", meta={"from": "last_frame"})
        await db.commit()
        frame.unlink(missing_ok=True)
    try:
        child = await _child(gen, ctx, task="image_to_video", model_id=i2v_model, prompt=gen.prompt, negative_prompt=gen.negative_prompt,
                             params=p.get("i2v_params") or {}, inputs={"image": frame_asset.id}, provider=p.get("provider"),
                             label="Generando la continuación")
        new_clip_id = child.output_asset_ids[0]
        outputs = [frame_asset.id, new_clip_id]
        if p.get("join", True):
            await ctx.update(status_message="Uniendo el vídeo original con la continuación", progress=0.85)
            async with get_sessionmaker()() as db:
                clip = await db.get(Asset, new_clip_id)
                clip_path = await asset_local_copy(clip)
                w, h = (video.width or 1280) // 2 * 2, (video.height or 720) // 2 * 2
                fps = video.fps or 24
                a = await ff.normalise_clip(src, w, h, fps)
                b = await ff.normalise_clip(clip_path, w, h, fps)
                da, db_ = (await ff.inspect(a)).duration or 0, (await ff.inspect(b)).duration or 0
                joined = await ff.concat_with_transitions([(a, da), (b, db_)], [None])
                final = await ingest_file(db, user_id=gen.user_id, path=joined, source="edit", parent_id=video.id, generation_id=gen.id,
                                          project_id=gen.project_id, name=f"{video.name}-extendido", meta={"extended_with": new_clip_id})
                await db.commit()
                for f in (clip_path, a, b, joined):
                    f.unlink(missing_ok=True)
            outputs.append(final.id)
        return outputs
    finally:
        src.unlink(missing_ok=True)


async def _timeline_render(gen: Generation, ctx) -> list[str]:
    from .timeline import TimelineData, render

    tl_id = (gen.params or {}).get("timeline_id")
    async with get_sessionmaker()() as db:
        tl = await db.get(Timeline, tl_id)
        if tl is None or tl.user_id != gen.user_id:
            raise PipelineError("Línea temporal no encontrada")
        data = TimelineData.model_validate(tl.data or {})
        ids = data.asset_ids()
        paths = {}
        for aid in ids:
            a = await db.get(Asset, aid)
            if a is None or a.user_id != gen.user_id or a.deleted_at is not None:
                raise PipelineError("Un clip de la línea temporal hace referencia a un archivo que ya no existe")
            paths[aid] = await asset_local_copy(a)
    try:
        await ctx.update(status_message="Renderizando con FFmpeg", progress=0.02)

        async def prog(v: float):
            await ctx.update(progress=round(v, 3))

        out, duration = await render(data, paths, prog)
        async with get_sessionmaker()() as db:
            asset = await ingest_file(db, user_id=gen.user_id, path=out, source="render", generation_id=gen.id, project_id=gen.project_id,
                                      name=f"{tl.name}-render", meta={"timeline_id": tl.id, "timeline_version": tl.version})
            tl2 = await db.get(Timeline, tl.id)
            tl2.last_render_asset_id = asset.id
            await db.commit()
        out.unlink(missing_ok=True)
        return [asset.id]
    finally:
        for p in paths.values():
            p.unlink(missing_ok=True)


async def _film_develop(gen: Generation, ctx) -> list[str]:
    from .film import develop_script, rewrite_scene
    from .film_schema import Script

    p = gen.params or {}
    async with get_sessionmaker()() as db:
        film = await db.get(Film, p.get("film_id"))
        if film is None or film.user_id != gen.user_id:
            raise PipelineError("Película no encontrada")
        creds = await user_credentials(db, gen.user_id)
        current = Script.model_validate(film.script or {})
    await ctx.update(status_message="El guionista IA está escribiendo", progress=None)
    if p.get("mode") == "rewrite_scene":
        script, provider = await rewrite_scene(current, p.get("scene_id", ""), gen.prompt, creds)
    else:
        script, provider = await develop_script(gen.prompt, creds, language=p.get("language", "es"),
                                                target_duration_s=int(p.get("target_duration_s") or 60), genre=p.get("genre", ""),
                                                tone=p.get("tone", ""), max_scenes=int(p.get("max_scenes") or 6))
        # keep the user's model choices and aspect ratio
        script.style.image_model = current.style.image_model
        script.style.reference_model = current.style.reference_model
        script.style.video_model = current.style.video_model
        script.style.tts_model = current.style.tts_model
        script.style.aspect_ratio = current.style.aspect_ratio
    async with get_sessionmaker()() as db:
        film = await db.get(Film, p.get("film_id"))
        film.script = script.model_dump()
        if script.title and (not film.title or film.title.startswith("Nueva película")):
            film.title = script.title[:200]
        film.version = (film.version or 1) + 1
        await db.commit()
    await ctx.update(provider=provider)
    return []


async def _edit_chain(gen: Generation, ctx) -> list[str]:
    from . import image_ops

    p = gen.params or {}
    roles = p.get("_roles", {})
    media = "video" if roles.get("video") else "image"
    current = (roles.get(media) or [None])[0]
    if not current:
        raise PipelineError("Falta el archivo de entrada")
    steps: list[dict[str, Any]] = p.get("steps") or []
    outputs: list[str] = []
    for i, st in enumerate(steps):
        await ctx.update(progress=round(i / max(1, len(steps)), 3))
        task = st["task"]
        params = dict(st.get("params") or {})
        inputs: dict[str, Any] = {}
        if task == "outpaint":
            ext = params.pop("extend", {"left": 256, "right": 256})
            async with get_sessionmaker()() as db:
                a = await db.get(Asset, current)
                src = await asset_local_copy(a)
                padded, mask = image_ops.prepare_outpaint(src, int(ext.get("top", 0)), int(ext.get("bottom", 0)),
                                                         int(ext.get("left", 0)), int(ext.get("right", 0)))
                pa = await ingest_file(db, user_id=gen.user_id, path=padded, source="edit", parent_id=a.id, generation_id=gen.id, name=a.name + "-lienzo")
                ma = await ingest_file(db, user_id=gen.user_id, path=mask, source="mask", parent_id=a.id, generation_id=gen.id, name=a.name + "-mascara")
                await db.commit()
                for f in (src, padded, mask):
                    f.unlink(missing_ok=True)
            inputs = {"image": pa.id, "mask": ma.id}
        elif task in ("local_video_op", "video_to_video", "upscale_video", "video_to_audio"):
            inputs = {"video": current}
        elif task == "video_extend":
            inputs = {"video": current}
        else:
            inputs = {"image": current}
            if task == "inpaint" and p.get("mask_asset_id"):
                inputs["mask"] = p["mask_asset_id"]
            for ref in st.get("reference_asset_ids") or []:
                inputs.setdefault("reference", []).append(ref)
        child = await _child(gen, ctx, task=task, model_id=st["model_id"], prompt=st.get("prompt", ""), params=params,
                             inputs=inputs, provider=st.get("provider"), label=f"Paso {i + 1}/{len(steps)}: {st.get('label', task)}")
        outs = child.output_asset_ids or []
        outputs += outs
        if task == "video_to_audio":
            continue  # audio result; keep editing the video
        if outs:
            current = outs[-1]
    return outputs


async def _film_batch(gen: Generation, ctx) -> list[str]:
    from .film import character_sheet_prompt, link_output, shot_image_prompt, shot_reference_assets, shot_video_prompt
    from .film_schema import Script

    p = gen.params or {}
    film_id, step = p.get("film_id"), p.get("step")
    async with get_sessionmaker()() as db:
        film = await db.get(Film, film_id)
        if film is None or film.user_id != gen.user_id:
            raise PipelineError("Película no encontrada")
        script = Script.model_validate(film.script or {})
    only = set(p.get("target_ids") or [])
    overwrite = bool(p.get("overwrite"))
    st = script.style
    jobs: list[dict[str, Any]] = []
    if step == "character_refs":
        for ch in script.characters:
            if (only and ch.id not in only) or (ch.ref_asset_ids and not overwrite):
                continue
            jobs.append({"task": "text_to_image", "model_id": p.get("model_id") or st.image_model, "prompt": character_sheet_prompt(script, ch),
                         "params": {"aspect_ratio": "3:4", **({"seed": ch.seed} if ch.seed is not None else {})},
                         "target": {"kind": "character_ref", "character_id": ch.id}, "label": f"Referencia de {ch.name}"})
    for sc in script.scenes:
        for sh in sc.shots:
            if only and sh.id not in only:
                continue
            if step == "keyframes" and (overwrite or not sh.keyframe_asset_id):
                refs = shot_reference_assets(script, sh)
                seed = next((script.character(c).seed for c in sh.characters if script.character(c) and script.character(c).seed is not None), None)
                if refs:
                    jobs.append({"task": "image_edit", "model_id": p.get("reference_model") or st.reference_model, "prompt": shot_image_prompt(script, sc, sh),
                                 "inputs": {"image": refs[0], **({"reference": refs[1:]} if len(refs) > 1 else {})},
                                 "params": {"aspect_ratio": st.aspect_ratio}, "target": {"kind": "keyframe", "shot_id": sh.id},
                                 "label": f"Fotograma E{sc.number}P{sh.number} (con referencias)"})
                else:
                    jobs.append({"task": "text_to_image", "model_id": p.get("model_id") or st.image_model, "prompt": shot_image_prompt(script, sc, sh),
                                 "params": {"aspect_ratio": st.aspect_ratio, **({"seed": seed} if seed is not None else {})},
                                 "target": {"kind": "keyframe", "shot_id": sh.id}, "label": f"Fotograma E{sc.number}P{sh.number}"})
            elif step == "clips" and sh.keyframe_asset_id and (overwrite or not sh.clip_asset_id):
                vm = p.get("model_id") or st.video_model
                jobs.append({"task": "image_to_video", "model_id": vm, "prompt": shot_video_prompt(script, sc, sh, vm),
                             "inputs": {"image": sh.keyframe_asset_id},
                             "params": {"duration": 10 if sh.duration > 7 else 5, "aspect_ratio": st.aspect_ratio},
                             "target": {"kind": "clip", "shot_id": sh.id}, "label": f"Clip E{sc.number}P{sh.number}"})
            elif step == "dialogue":
                for li, d in enumerate(sh.dialogue):
                    if not d.line.strip() or (d.audio_asset_id and not overwrite):
                        continue
                    ch = script.character(d.character_id)
                    tts = p.get("model_id") or st.tts_model
                    params = {"voice_id": ch.voice_id} if (ch and ch.voice_id and tts == "elevenlabs-tts") else {}
                    jobs.append({"task": "text_to_speech", "model_id": tts, "prompt": d.line, "params": params,
                                 "target": {"kind": "dialogue", "shot_id": sh.id, "line": li}, "label": f"Diálogo E{sc.number}P{sh.number}"})
            elif step == "sfx" and sh.sfx_prompt and (overwrite or not sh.sfx_asset_id):
                jobs.append({"task": "text_to_sfx", "model_id": p.get("model_id") or "elevenlabs-sfx", "prompt": sh.sfx_prompt,
                             "params": {"duration": min(22, sh.duration)}, "target": {"kind": "sfx", "shot_id": sh.id}, "label": f"Efectos E{sc.number}P{sh.number}"})
    if step == "music" and script.music.prompt and (overwrite or not script.music.asset_id):
        total = sum(sh.duration for sc in script.scenes for sh in sc.shots) or 30
        jobs.append({"task": "text_to_music", "model_id": p.get("model_id") or "stable-audio", "prompt": script.music.prompt,
                     "params": {"duration": min(47, total)}, "target": {"kind": "music"}, "label": "Banda sonora"})
    if not jobs:
        raise PipelineError("No hay nada que generar en este paso (¿ya está generado o faltan fotogramas clave?)")
    outputs: list[str] = []
    failures: list[str] = []
    for i, j in enumerate(jobs):
        await ctx.update(progress=round(i / len(jobs), 3))
        try:
            child = await _child(gen, ctx, task=j["task"], model_id=j["model_id"], prompt=j["prompt"], params=j.get("params"),
                                 inputs=j.get("inputs"), provider=p.get("provider"), label=f"{i + 1}/{len(jobs)} · {j['label']}")
        except PipelineError as e:
            if str(e) == "Cancelado":
                raise
            failures.append(str(e))
            continue
        if child.output_asset_ids:
            await link_output(film_id, gen.user_id, j["target"], child.output_asset_ids[0])
            outputs.append(child.output_asset_ids[0])
    if failures and not outputs:
        raise PipelineError("Todos los pasos fallaron: " + " | ".join(failures)[:3000])
    if failures:
        await ctx.update(error=f"{len(failures)} de {len(jobs)} elementos fallaron: " + " | ".join(failures)[:3000])
    return outputs


async def _multi_shot(gen: Generation, ctx) -> list[str]:
    """Generate several shots of one sequence; optionally chain them through the last frame
    (visual continuity), then assemble and render them into a single video."""
    from . import ffmpeg_ops as ff
    from .prompting import compose_video_prompt
    from .timeline import Clip, TimelineData, Track, Transition, render

    p = gen.params or {}
    shots: list[dict[str, Any]] = p.get("shots") or []
    model_id = p.get("video_model")
    if not shots or not model_id:
        raise PipelineError("Define al menos un plano y un modelo de vídeo")
    from ..providers.catalog import get_model

    m = get_model(model_id)
    if m is None:
        raise PipelineError("Modelo de vídeo desconocido")
    start_image = (p.get("_roles", {}).get("image") or [None])[0]
    continuity = bool(p.get("continuity", True))
    clips: list[str] = []
    outputs: list[str] = []
    prev_frame: str | None = start_image
    for i, sh in enumerate(shots):
        prompt = compose_video_prompt(sh.get("prompt", ""), sh.get("cinema") or {}, model_id)
        use_image = prev_frame if (i == 0 and start_image) or (i > 0 and continuity) else None
        task = "image_to_video" if use_image and "image_to_video" in m.tasks else "text_to_video"
        if task == "text_to_video" and "text_to_video" not in m.tasks:
            raise PipelineError(f"{m.name} necesita una imagen inicial para el plano {i + 1}")
        child = await _child(gen, ctx, task=task, model_id=model_id, prompt=prompt, params=p.get("video_params") or {},
                             inputs={"image": use_image} if task == "image_to_video" else {}, provider=p.get("provider"),
                             label=f"Plano {i + 1}/{len(shots)}")
        clip_id = child.output_asset_ids[0]
        clips.append(clip_id)
        outputs.append(clip_id)
        await ctx.update(progress=round((i + 1) / (len(shots) + 1), 3))
        if continuity and i < len(shots) - 1:
            async with get_sessionmaker()() as db:
                a = await db.get(Asset, clip_id)
                src = await asset_local_copy(a)
                frame = await ff.extract_frame(src, "last")
                fa = await ingest_file(db, user_id=gen.user_id, path=frame, source="edit", parent_id=a.id, generation_id=gen.id,
                                       project_id=gen.project_id, name=f"plano-{i + 1}-ultimo-fotograma")
                await db.commit()
                src.unlink(missing_ok=True)
                frame.unlink(missing_ok=True)
            prev_frame = fa.id
    await ctx.update(status_message="Montando la secuencia")
    async with get_sessionmaker()() as db:
        assets = {aid: await db.get(Asset, aid) for aid in clips}
        paths = {aid: await asset_local_copy(a) for aid, a in assets.items()}
    first = assets[clips[0]]
    w, h = (first.width or 1280) // 2 * 2, (first.height or 720) // 2 * 2
    trans = p.get("transition") or "cut"
    data = TimelineData(width=w, height=h, fps=first.fps or 24, tracks=[Track(id="v1", kind="video", clips=[
        Clip(id=f"s{i}", asset_id=aid, start=float(i), in_=0, out=assets[aid].duration,
             transition_in=Transition(type=trans, duration=0.4) if i and trans != "cut" else None) for i, aid in enumerate(clips)])])
    try:
        out, _ = await render(data, paths)
    finally:
        for pth in paths.values():
            pth.unlink(missing_ok=True)
    async with get_sessionmaker()() as db:
        final = await ingest_file(db, user_id=gen.user_id, path=out, source="render", generation_id=gen.id, project_id=gen.project_id,
                                  name="secuencia-multiplano", meta={"shots": len(clips), "model_id": model_id})
        await db.commit()
    out.unlink(missing_ok=True)
    return outputs + [final.id]
