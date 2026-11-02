"""Multi-track timeline: validation, FFmpeg rendering and OTIO/SRT export.

Data model (stored as JSON in ``Timeline.data``)::

    {
      "fps": 24, "width": 1920, "height": 1080, "burn_subtitles": true,
      "tracks": [
        {"id": "v1", "kind": "video", "name": "Vídeo 1", "muted": false, "volume_db": 0,
         "clips": [{"id": "c1", "asset_id": "...", "start": 0, "in": 0, "out": 5,
                    "speed": 1, "volume_db": 0, "still_duration": 3,
                    "transition_in": {"type": "crossfade", "duration": 0.5},
                    "effects": [{"op": "color", "preset": "cinematic"}]}]},
        {"id": "v2", "kind": "video", ...}            # upper tracks overlay the main one
        {"id": "a1", "kind": "audio", "clips": [{"asset_id": "...", "start": 2, "in": 0, "out": 8,
                                                "volume_db": -6, "fade_in": 0.5, "fade_out": 1}]},
        {"id": "s1", "kind": "subtitle", "clips": [{"start": 1, "end": 3, "text": "Hola"}]}
      ]
    }

The first video track is *magnetic* (clips play back-to-back in ``start``
order; transitions overlap neighbours). Upper video tracks, audio and
subtitle tracks are positioned absolutely in seconds.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from ..media import inspect
from ..storage import tmp_path
from . import ffmpeg_ops as ff

log = logging.getLogger(__name__)


class Transition(BaseModel):
    type: Literal["cut", "crossfade", "fade_black", "fade_white", "wipe_left", "wipe_right", "slide_left", "slide_up",
                  "dissolve", "circle_open", "zoom"] = "cut"
    duration: float = Field(0.5, ge=0.1, le=5)


class Clip(BaseModel):
    id: str = ""
    asset_id: str | None = None
    start: float = Field(0, ge=0)
    end: float | None = None  # subtitle clips
    in_: float = Field(0, ge=0, alias="in")
    out: float | None = None
    speed: float = Field(1.0, ge=0.25, le=4)
    volume_db: float = Field(0, ge=-60, le=24)
    still_duration: float = Field(3.0, ge=0.2, le=600)
    transition_in: Transition | None = None
    effects: list[dict[str, Any]] = Field(default_factory=list)
    fade_in: float = Field(0, ge=0, le=30)
    fade_out: float = Field(0, ge=0, le=30)
    text: str = ""
    label: str = ""

    model_config = {"populate_by_name": True, "extra": "ignore"}


class Track(BaseModel):
    id: str = ""
    kind: Literal["video", "audio", "subtitle"]
    name: str = ""
    muted: bool = False
    volume_db: float = Field(0, ge=-60, le=24)
    clips: list[Clip] = Field(default_factory=list)


class TimelineData(BaseModel):
    fps: float = Field(24, ge=12, le=60)
    width: int = Field(1920, ge=256, le=3840)
    height: int = Field(1080, ge=256, le=3840)
    burn_subtitles: bool = True
    tracks: list[Track] = Field(default_factory=list)

    @field_validator("width", "height")
    @classmethod
    def _even(cls, v: int) -> int:  # noqa: N805
        return v // 2 * 2

    def asset_ids(self) -> set[str]:
        return {c.asset_id for t in self.tracks for c in t.clips if c.asset_id}

    def subtitle_cues(self) -> list[dict[str, Any]]:
        cues = []
        for t in self.tracks:
            if t.kind == "subtitle" and not t.muted:
                for c in t.clips:
                    if c.text.strip():
                        cues.append({"start": c.start, "end": c.end if c.end is not None else c.start + 2, "text": c.text})
        return sorted(cues, key=lambda c: c["start"])


def empty_timeline() -> dict[str, Any]:
    return TimelineData(tracks=[
        Track(id="v1", kind="video", name="Vídeo principal"), Track(id="v2", kind="video", name="Superposición"),
        Track(id="a1", kind="audio", name="Diálogos"), Track(id="a2", kind="audio", name="Música"),
        Track(id="a3", kind="audio", name="Efectos"), Track(id="s1", kind="subtitle", name="Subtítulos"),
    ]).model_dump(by_alias=True)


async def render(data: TimelineData, asset_paths: dict[str, Path], progress=None) -> tuple[Path, float]:
    """Render the timeline to an H.264/AAC MP4. Returns (path, duration)."""
    W, H, FPS = data.width, data.height, data.fps
    temps: list[Path] = []

    async def stage(v: float):
        if progress:
            await progress(v)

    video_tracks = [t for t in data.tracks if t.kind == "video" and not t.muted]
    main = video_tracks[0] if video_tracks else None
    if main is None or not main.clips:
        raise ValueError("La pista de vídeo principal está vacía")
    try:
        # 1) main magnetic track
        norm: list[tuple[Path, float]] = []
        transitions: list[dict[str, Any] | None] = []
        clips = sorted(main.clips, key=lambda c: c.start)
        for i, c in enumerate(clips):
            src = asset_paths.get(c.asset_id or "")
            if not src:
                raise ValueError(f"Falta el archivo del clip {c.label or c.id}")
            info = await inspect(src)
            if info.kind == "audio":
                raise ValueError("Un clip de audio no puede ir en la pista de vídeo")
            out = c.out if c.out is not None else (info.duration or c.still_duration)
            p = await ff.normalise_clip(src, W, H, FPS, start=c.in_, end=out, speed=c.speed,
                                        volume_db=c.volume_db + main.volume_db, still_duration=c.still_duration)
            temps.append(p)
            if c.effects:
                p2 = await ff.apply_video_ops(p, c.effects)
                temps.append(p2)
                p = p2
            dur = (await inspect(p)).duration or 0
            norm.append((p, dur))
            if i > 0:
                transitions.append(c.transition_in.model_dump() if c.transition_in else None)
            await stage(0.05 + 0.45 * (i + 1) / len(clips))
        base = await ff.concat_with_transitions(norm, transitions)
        if base not in [n[0] for n in norm]:
            temps.append(base)
        total = (await inspect(base)).duration or sum(d for _, d in norm)
        await stage(0.6)

        # 2) overlays, mixed audio and subtitles in one final pass
        args: list[str] = ["-i", str(base)]
        fc: list[str] = []
        idx = 1
        v_label = "[0:v]"
        for t in video_tracks[1:]:
            for c in t.clips:
                src = asset_paths.get(c.asset_id or "")
                if not src:
                    continue
                info = await inspect(src)
                out = c.out if c.out is not None else (info.duration or c.still_duration)
                p = await ff.normalise_clip(src, W, H, FPS, start=c.in_, end=out, speed=c.speed, still_duration=c.still_duration)
                temps.append(p)
                d = (await inspect(p)).duration or 0
                args += ["-i", str(p)]
                fc.append(f"[{idx}:v]setpts=PTS+{c.start:.3f}/TB[ov{idx}]")
                fc.append(f"{v_label}[ov{idx}]overlay=enable='between(t,{c.start:.3f},{c.start + d:.3f})':eof_action=pass[vo{idx}]")
                v_label = f"[vo{idx}]"
                idx += 1
        cues = data.subtitle_cues()
        if cues and data.burn_subtitles:
            srt = ff.write_srt(cues)
            temps.append(srt)
            style = "FontName=DejaVu Sans,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,MarginV=30"
            fc.append(f"{v_label}subtitles='{ff._filter_path(srt)}':force_style='{style}'[vsub]")
            v_label = "[vsub]"
        audio_inputs = ["[0:a]"]
        for t in data.tracks:
            if t.kind != "audio" or t.muted:
                continue
            for c in t.clips:
                src = asset_paths.get(c.asset_id or "")
                if not src:
                    continue
                info = await inspect(src)
                if not info.has_audio:
                    continue
                out = c.out if c.out is not None else (info.duration or 0)
                dur = max(0.05, (out - c.in_) / c.speed)
                args += ["-i", str(src)]
                delay = int(c.start * 1000)
                chain = (f"[{idx}:a]atrim=start={c.in_:.3f}:end={out:.3f},asetpts=PTS-STARTPTS,{ff._atempo_chain(c.speed)},"
                         f"aresample=48000,aformat=channel_layouts=stereo,volume={c.volume_db + t.volume_db:.2f}dB")
                if c.fade_in:
                    chain += f",afade=t=in:st=0:d={c.fade_in:.3f}"
                if c.fade_out:
                    chain += f",afade=t=out:st={max(0, dur - c.fade_out):.3f}:d={c.fade_out:.3f}"
                chain += f",adelay={delay}|{delay}[au{idx}]"
                fc.append(chain)
                audio_inputs.append(f"[au{idx}]")
                idx += 1
        if len(audio_inputs) > 1:
            fc.append("".join(audio_inputs) + f"amix=inputs={len(audio_inputs)}:duration=first:normalize=0,alimiter=limit=0.95[aout]")
            a_label = "[aout]"
        else:
            a_label = "0:a"
        dest = tmp_path(".mp4")
        if fc:
            if v_label == "[0:v]":
                fc.append("[0:v]null[vfinal]")
                v_label = "[vfinal]"
            args += ["-filter_complex", ";".join(fc), "-map", v_label, "-map", a_label]
        else:
            args += ["-map", "0:v", "-map", "0:a"]
        args += ["-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(dest)]

        async def final_progress(v: float):
            await stage(0.6 + 0.39 * v)

        await ff.run_ffmpeg(args, total=total, on_progress=final_progress)
        return dest, total
    finally:
        for p in temps:
            try:
                p.unlink(missing_ok=True)
            except IsADirectoryError:
                pass


def to_srt(data: TimelineData) -> str:
    p = ff.write_srt(data.subtitle_cues())
    try:
        return p.read_text(encoding="utf-8")
    finally:
        p.unlink(missing_ok=True)


def to_otio(data: TimelineData, name: str, asset_names: dict[str, str]) -> str:
    """Export to OpenTimelineIO JSON (importable in DaVinci Resolve, Premiere via adapters, etc.)."""
    import opentimelineio as otio

    rate = data.fps
    tl = otio.schema.Timeline(name=name)
    for t in data.tracks:
        kind = otio.schema.TrackKind.Audio if t.kind == "audio" else otio.schema.TrackKind.Video
        track = otio.schema.Track(name=t.name or t.id, kind=kind)
        cursor = 0.0
        clips = sorted(t.clips, key=lambda c: c.start)
        for c in clips:
            if t.kind == "subtitle":
                dur = (c.end or c.start + 2) - c.start
                if c.start > cursor:
                    track.append(otio.schema.Gap(source_range=otio.opentime.TimeRange(
                        otio.opentime.RationalTime(0, rate), otio.opentime.RationalTime(round((c.start - cursor) * rate), rate))))
                m = otio.schema.Marker(name=c.text, marked_range=otio.opentime.TimeRange(
                    otio.opentime.RationalTime(round(c.start * rate), rate), otio.opentime.RationalTime(round(dur * rate), rate)))
                track.markers.append(m)
                continue
            src_in = c.in_
            src_out = c.out if c.out is not None else c.in_ + c.still_duration
            dur = max(1 / rate, (src_out - src_in) / c.speed)
            if t is not data.tracks[0] and c.start > cursor:
                track.append(otio.schema.Gap(source_range=otio.opentime.TimeRange(
                    otio.opentime.RationalTime(0, rate), otio.opentime.RationalTime(round((c.start - cursor) * rate), rate))))
                cursor = c.start
            ref = otio.schema.ExternalReference(target_url=f"motorworld://assets/{c.asset_id}")
            clip = otio.schema.Clip(
                name=asset_names.get(c.asset_id or "", c.label or c.id or "clip"), media_reference=ref,
                source_range=otio.opentime.TimeRange(otio.opentime.RationalTime(round(src_in * rate), rate),
                                                     otio.opentime.RationalTime(round(dur * rate), rate)),
            )
            clip.metadata["motorworld"] = {"asset_id": c.asset_id, "speed": c.speed, "volume_db": c.volume_db, "effects": c.effects}
            track.append(clip)
            cursor += dur
        tl.tracks.append(track)
    return otio.adapters.write_to_string(tl, "otio_json")
