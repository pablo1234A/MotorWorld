"""Film production studio: story development, prompt building for consistent
characters, batch production of shots and automatic timeline assembly."""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_sessionmaker
from ..models import Asset, Film, Timeline
from .film_schema import LLM_SCENE, LLM_SCRIPT, Character, Scene, Script
from .llm import complete_json
from .prompting import CAMERA_MOVES, IMAGE_STYLES, LENSES, SHOT_TYPES, compose_video_prompt
from .timeline import TimelineData, empty_timeline

log = logging.getLogger(__name__)

SYSTEM_DEVELOP = """Eres guionista y director de fotografía de cine y publicidad.
Desarrollas ideas en guiones de producción listos para generarse con modelos de IA de imagen y vídeo.
Reglas:
- Escribe argumento, diálogos y descripciones en el idioma indicado; los campos image_prompt, video_prompt y sfx_prompt SIEMPRE en inglés, descriptivos y visuales.
- Cada plano dura entre 3 y 10 segundos (los modelos de vídeo generan clips cortos).
- Usa ids cortos y estables: personajes "char_1", "char_2"…; localizaciones "loc_1"…; refiérete a ellos por id en scenes[].location_id, shots[].characters y dialogue[].character_id.
- Describe a cada personaje con rasgos visuales concretos y constantes (edad aparente, rostro, cabello, vestuario, accesorios, colores) para mantener la consistencia.
- image_prompt describe el fotograma clave del plano (sujeto, acción, entorno, luz); NO repitas la descripción del personaje (se añade automáticamente).
- video_prompt describe el movimiento dentro del plano (acción de los personajes, ambiente, movimiento de cámara).
- No incluyas personas reales ni marcas registradas."""


async def develop_script(idea: str, user_creds: dict[str, str], *, language: str = "es", target_duration_s: int = 60,
                         genre: str = "", tone: str = "", max_scenes: int = 6) -> tuple[Script, str]:
    user = (f"Idioma: {language}\nDuración objetivo: {target_duration_s} segundos (máximo {max_scenes} escenas)\n"
            f"Género: {genre or 'libre'}\nTono: {tone or 'libre'}\n\nIdea de la película:\n{idea}")
    data, provider = await complete_json(SYSTEM_DEVELOP, user, LLM_SCRIPT, user_creds)
    return script_from_llm(data, language, target_duration_s), provider


def script_from_llm(data: dict[str, Any], language: str, target: int) -> Script:
    script = Script.model_validate({**data, "language": language, "target_duration_s": target,
                                    "style": {**Script().style.model_dump(), **(data.get("style") or {})}})
    _sanitize_refs(script)
    script.renumber()
    return script


def _sanitize_refs(script: Script) -> None:
    char_ids = {c.id for c in script.characters}
    loc_ids = {loc.id for loc in script.locations}
    for sc in script.scenes:
        if sc.location_id not in loc_ids:
            sc.location_id = ""
        for sh in sc.shots:
            sh.characters = [c for c in sh.characters if c in char_ids]
            sh.duration = max(2.0, min(10.0, float(sh.duration or 5)))
            for d in sh.dialogue:
                if d.character_id not in char_ids:
                    d.character_id = ""


async def rewrite_scene(script: Script, scene_id: str, instruction: str, user_creds: dict[str, str]) -> tuple[Script, str]:
    scene = next((s for s in script.scenes if s.id == scene_id), None)
    if scene is None:
        raise ValueError("Escena no encontrada")
    context = {"title": script.title, "synopsis": script.synopsis,
               "characters": [{"id": c.id, "name": c.name, "description": c.description} for c in script.characters],
               "locations": [{"id": loc.id, "name": loc.name} for loc in script.locations],
               "scene": scene.model_dump(include={"title", "summary", "location_id", "mood", "shots"})}
    user = f"Guion actual (JSON):\n{json.dumps(context, ensure_ascii=False)}\n\nReescribe SOLO esta escena siguiendo la instrucción:\n{instruction}"
    data, provider = await complete_json(SYSTEM_DEVELOP, user, LLM_SCENE, user_creds, effort="medium")
    new_scene = Scene.model_validate({**data, "id": scene.id})
    script.scenes = [new_scene if s.id == scene_id else s for s in script.scenes]
    _sanitize_refs(script)
    script.renumber()
    return script, provider


# ---------------------------------------------------------------------------
# Prompt building with consistency anchors
# ---------------------------------------------------------------------------
def style_suffix(script: Script) -> str:
    st = script.style
    preset = IMAGE_STYLES.get(st.visual_style, {}).get("suffix", st.visual_style)
    return ", ".join(x for x in (preset, st.lighting, st.color_grade, st.aesthetic) if x)


def character_sheet_prompt(script: Script, ch: Character) -> str:
    return (f"Character reference sheet of {ch.descriptor() or ch.description}. {ch.description}. Full body and face clearly visible, "
            f"neutral studio background, even soft lighting, front view, photorealistic, {style_suffix(script)}")


def shot_image_prompt(script: Script, scene: Scene, shot) -> str:
    loc = script.location(scene.location_id)
    chars = [script.character(c) for c in shot.characters]
    parts = [shot.image_prompt or shot.description]
    for c in chars:
        if c:
            parts.append(c.descriptor())
    if loc:
        parts.append(f"Location: {loc.description} {loc.time_of_day} {loc.lighting}".strip())
    parts.append(SHOT_TYPES.get(shot.shot_type, shot.shot_type))
    parts.append(LENSES.get(shot.lens, shot.lens))
    parts.append(style_suffix(script))
    return ". ".join(p for p in parts if p)


def shot_video_prompt(script: Script, scene: Scene, shot, model_id: str) -> str:
    base = shot.video_prompt or shot.description
    return compose_video_prompt(base, {"camera_movement": shot.camera_movement if shot.camera_movement in CAMERA_MOVES else None,
                                       "shot_type": shot.shot_type, "lens": shot.lens}, model_id)


def shot_reference_assets(script: Script, shot) -> list[str]:
    refs: list[str] = []
    for cid in shot.characters:
        c = script.character(cid)
        if c and c.ref_asset_ids:
            refs.append(c.ref_asset_ids[0])
    return refs[:3]


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------
async def load_script(film: Film) -> Script:
    return Script.model_validate(film.script or {})


async def link_output(film_id: str, user_id: str, target: dict[str, Any], asset_id: str) -> None:
    """Attach a generated asset to a shot/character/line of the film (read-modify-write with version bump)."""
    async with get_sessionmaker()() as db:
        film = await db.get(Film, film_id, with_for_update=db.bind.dialect.name == "postgresql")
        if film is None or film.user_id != user_id:
            return
        script = Script.model_validate(film.script or {})
        kind = target.get("kind")
        if kind in ("keyframe", "clip", "sfx"):
            _, shot = script.find_shot(target.get("shot_id", ""))
            if shot:
                setattr(shot, {"keyframe": "keyframe_asset_id", "clip": "clip_asset_id", "sfx": "sfx_asset_id"}[kind], asset_id)
        elif kind == "dialogue":
            _, shot = script.find_shot(target.get("shot_id", ""))
            idx = int(target.get("line", 0))
            if shot and 0 <= idx < len(shot.dialogue):
                shot.dialogue[idx].audio_asset_id = asset_id
        elif kind == "character_ref":
            ch = script.character(target.get("character_id", ""))
            if ch and asset_id not in ch.ref_asset_ids:
                ch.ref_asset_ids.insert(0, asset_id)
        elif kind == "location_ref":
            loc = script.location(target.get("location_id", ""))
            if loc and asset_id not in loc.ref_asset_ids:
                loc.ref_asset_ids.insert(0, asset_id)
        elif kind == "music":
            script.music.asset_id = asset_id
        film.script = script.model_dump()
        film.version = (film.version or 1) + 1
        await db.commit()


async def assemble_timeline(db: AsyncSession, film: Film) -> Timeline:
    """Build (or rebuild) the film's timeline from the produced shots."""
    script = Script.model_validate(film.script or {})
    data = TimelineData.model_validate(empty_timeline())
    tracks = {t.id: t for t in data.tracks}
    asset_ids = {a for sc in script.scenes for sh in sc.shots for a in (sh.clip_asset_id, sh.keyframe_asset_id) if a}
    assets = {a.id: a for a in (await db.execute(select(Asset).where(Asset.id.in_(asset_ids), Asset.user_id == film.user_id))).scalars()}
    t = 0.0
    from .timeline import Clip, Transition

    for sc in script.scenes:
        for i, sh in enumerate(sc.shots):
            aid = sh.clip_asset_id if sh.clip_asset_id in assets else (sh.keyframe_asset_id if sh.keyframe_asset_id in assets else None)
            if not aid:
                continue
            a = assets[aid]
            dur = float(a.duration or sh.duration) if a.kind == "video" else float(sh.duration)
            clip = Clip(id=sh.id, asset_id=aid, start=t, in_=0, out=dur if a.kind == "video" else None, still_duration=sh.duration,
                        label=f"E{sc.number}·P{sh.number}",
                        transition_in=Transition(type="crossfade", duration=0.5) if (i == 0 and t > 0) else None)
            tracks["v1"].clips.append(clip)
            cursor = t + 0.2
            for d in sh.dialogue:
                ch = script.character(d.character_id)
                if d.audio_asset_id:
                    audio = await db.get(Asset, d.audio_asset_id)
                    if audio and audio.user_id == film.user_id:
                        ad = float(audio.duration or 2)
                        tracks["a1"].clips.append(Clip(asset_id=audio.id, start=cursor, in_=0, out=ad, label=ch.name if ch else ""))
                        tracks["s1"].clips.append(Clip(start=cursor, end=cursor + ad, text=(f"{ch.name}: " if ch else "") + d.line))
                        cursor += ad + 0.15
                        continue
                if d.line:
                    est = max(1.5, len(d.line.split()) * 0.4)
                    tracks["s1"].clips.append(Clip(start=cursor, end=cursor + est, text=(f"{ch.name}: " if ch else "") + d.line))
                    cursor += est
            if sh.sfx_asset_id:
                tracks["a3"].clips.append(Clip(asset_id=sh.sfx_asset_id, start=t, in_=0, out=dur, volume_db=-8))
            t += dur - (0.5 if clip.transition_in else 0)
    if script.music.asset_id:
        m = await db.get(Asset, script.music.asset_id)
        if m and m.user_id == film.user_id:
            tracks["a2"].clips.append(Clip(asset_id=m.id, start=0, in_=0, out=min(float(m.duration or t), t), volume_db=-14, fade_in=1, fade_out=2))
    if script.style.aspect_ratio == "9:16":
        data.width, data.height = 1080, 1920
    elif script.style.aspect_ratio == "1:1":
        data.width, data.height = 1080, 1080
    payload = data.model_dump(by_alias=True)
    tl = await db.get(Timeline, film.timeline_id) if film.timeline_id else None
    if tl is None or tl.user_id != film.user_id:
        tl = Timeline(user_id=film.user_id, project_id=film.project_id, name=f"Montaje · {film.title}", data=payload)
        db.add(tl)
        await db.flush()
        film.timeline_id = tl.id
    else:
        tl.data = payload
        tl.version = (tl.version or 1) + 1
    await db.commit()
    return tl
