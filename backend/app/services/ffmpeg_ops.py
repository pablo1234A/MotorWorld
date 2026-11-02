"""Deterministic video/audio processing with FFmpeg (no generative AI).

Every function writes a *new* file (originals are never modified) and can
report real progress parsed from ``ffmpeg -progress``.
"""
from __future__ import annotations

import asyncio
import logging
import math
import shutil
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter

from ..config import get_settings
from ..media import MediaInfo, inspect
from ..storage import tmp_path

log = logging.getLogger(__name__)
ProgressCb = Callable[[float], Awaitable[None]] | None

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

VIDEO_OPS = {
    "trim": "Cortar (start, end en segundos)",
    "speed": "Velocidad (factor: 0.25–4; <1 cámara lenta, >1 cámara rápida)",
    "slow_motion": "Cámara lenta suave con interpolación (factor 0.25–0.9)",
    "interpolate": "Interpolación de fotogramas (fps destino, p. ej. 60)",
    "stabilize": "Estabilización (deshake)",
    "color": "Corrección de color (brightness, contrast, saturation, gamma) y/o preset",
    "reframe": "Recorte inteligente a otra relación de aspecto (aspect, mode: smart|center)",
    "scale": "Reescalar (height) con Lanczos — sin IA",
    "sharpen": "Enfoque (amount)",
    "denoise": "Reducción de ruido de vídeo (hqdn3d)",
    "grain": "Grano de película (amount)",
    "vignette": "Viñeta",
    "letterbox": "Bandas cinemascope 2.39:1",
    "fade": "Fundido de entrada/salida (in, out en segundos)",
    "reverse": "Invertir (clips ≤ 60 s)",
    "subtitles": "Subtítulos quemados (cues: [{start, end, text}])",
    "text": "Texto sobreimpreso (text, position: top|center|bottom, start, end, size)",
    "volume": "Volumen de audio (db)",
    "audio_denoise": "Reducir ruido de audio",
    "normalize_audio": "Normalizar sonoridad (EBU R128)",
    "mute": "Quitar audio",
    "segment": "Aplicar operaciones solo a un tramo (start, end, ops)",
    "extract_frame": "Extraer fotograma (at: segundos | last)",
    "extract_audio": "Extraer la pista de audio",
}

COLOR_PRESETS = {
    "cinematic": "colorbalance=rs=-0.06:bs=0.08:rm=0.02:bm=-0.02:rh=0.08:gh=0.02:bh=-0.07,eq=contrast=1.08:saturation=1.08",
    "teal_orange": "colorbalance=rs=-0.1:bs=0.12:rh=0.12:bh=-0.1,eq=contrast=1.1:saturation=1.15",
    "noir": "hue=s=0,eq=contrast=1.35:brightness=-0.03",
    "warm": "colorbalance=rs=0.06:gs=0.02:bs=-0.06:rm=0.05:bm=-0.05",
    "cool": "colorbalance=rs=-0.05:bs=0.07:rm=-0.04:bm=0.06",
    "vintage": "curves=preset=vintage,eq=saturation=0.85",
    "bleach_bypass": "eq=saturation=0.55:contrast=1.25",
    "day_for_night": "eq=brightness=-0.16:saturation=0.7:gamma=0.85,colorbalance=bs=0.14:bm=0.08:rs=-0.06",
    "vivid": "eq=saturation=1.35:contrast=1.06",
}


def ffmpeg() -> str:
    return get_settings().ffmpeg_bin


def find_font() -> str | None:
    return next((f for f in FONT_CANDIDATES if Path(f).exists()), None)


async def run_ffmpeg(args: list[str], *, total: float | None = None, on_progress: ProgressCb = None, timeout: float = 3600) -> None:
    cmd = [ffmpeg(), "-hide_banner", "-y", "-nostdin", "-threads", str(get_settings().ffmpeg_threads), "-progress", "pipe:1", "-nostats", *args]
    log.debug("ffmpeg %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    err_chunks: list[bytes] = []

    async def read_err():
        assert proc.stderr
        while True:
            chunk = await proc.stderr.read(4096)
            if not chunk:
                break
            err_chunks.append(chunk)
            if len(err_chunks) > 200:
                err_chunks.pop(0)

    async def read_out():
        assert proc.stdout
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            if on_progress and total and line.startswith(b"out_time_us="):
                try:
                    us = int(line.split(b"=", 1)[1])
                    await on_progress(max(0.0, min(0.99, us / 1e6 / total)))
                except ValueError:
                    pass

    try:
        await asyncio.wait_for(asyncio.gather(read_err(), read_out(), proc.wait()), timeout=timeout)
    except TimeoutError:
        proc.kill()
        raise RuntimeError("FFmpeg superó el tiempo máximo")
    if proc.returncode != 0:
        tail = b"".join(err_chunks).decode(errors="ignore")[-1200:]
        raise RuntimeError(f"FFmpeg falló: {tail}")


def _atempo_chain(factor: float) -> str:
    parts = []
    f = factor
    while f > 2.0:
        parts.append("atempo=2.0")
        f /= 2.0
    while f < 0.5:
        parts.append("atempo=0.5")
        f /= 0.5
    parts.append(f"atempo={f:.4f}")
    return ",".join(parts)


def _srt_time(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    ms = int(round((s - int(s)) * 1000))
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{ms:03d}"


def write_srt(cues: list[dict[str, Any]], dest: Path | None = None) -> Path:
    dest = dest or tmp_path(".srt")
    lines = []
    for i, c in enumerate(sorted(cues, key=lambda c: float(c["start"])), 1):
        text = str(c.get("text", "")).replace("\r", "").strip()
        if not text:
            continue
        lines += [str(i), f"{_srt_time(float(c['start']))} --> {_srt_time(float(c['end']))}", text, ""]
    dest.write_text("\n".join(lines), encoding="utf-8")
    return dest


def _filter_path(p: Path) -> str:
    return str(p).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")


async def smart_crop_offset(src: Path, info: MediaInfo, target_w: int, target_h: int, axis: str) -> int:
    """Find the crop window with the most visual detail (edge energy) across sampled frames."""
    samples = 8
    dur = info.duration or 1
    frames_dir = tmp_path("_frames")
    frames_dir.mkdir(parents=True, exist_ok=True)
    try:
        await run_ffmpeg(["-i", str(src), "-vf", f"fps={samples / max(dur, 0.5):.4f},scale=320:-2", "-frames:v", str(samples),
                          str(frames_dir / "f%03d.png")], timeout=300)
        files = sorted(frames_dir.glob("*.png"))
        if not files:
            return 0
        acc: list[float] | None = None
        scale_w = scale_h = 1.0
        for fp in files:
            with Image.open(fp) as im:
                e = im.convert("L").filter(ImageFilter.FIND_EDGES)
                scale_w = info.width / e.width if info.width else 1
                scale_h = info.height / e.height if info.height else 1
                w, h = e.size
                px = e.load()
                if axis == "x":
                    prof = [sum(px[x, y] for y in range(0, h, 2)) for x in range(w)]
                else:
                    prof = [sum(px[x, y] for x in range(0, w, 2)) for y in range(h)]
            acc = prof if acc is None else [a + b for a, b in zip(acc, prof)]
        assert acc is not None
        win = int(round((target_w / scale_w) if axis == "x" else (target_h / scale_h)))
        win = max(1, min(win, len(acc)))
        best, best_i, cur = -1.0, 0, sum(acc[:win])
        for i in range(0, len(acc) - win + 1):
            if i:
                cur += acc[i + win - 1] - acc[i - 1]
            if cur > best:
                best, best_i = cur, i
        return int(best_i * (scale_w if axis == "x" else scale_h))
    finally:
        shutil.rmtree(frames_dir, ignore_errors=True)


async def apply_video_ops(src: Path, ops: list[dict[str, Any]], on_progress: ProgressCb = None) -> Path:
    info = await inspect(src)
    if info.kind != "video":
        raise ValueError("Se esperaba un vídeo")
    vf: list[str] = []
    af: list[str] = []
    pre: list[str] = []
    duration = info.duration or 0
    fps = info.fps or 24
    w, h = info.width or 1280, info.height or 720
    has_audio = bool(info.has_audio)
    mute = False
    temp_files: list[Path] = []

    for op in ops:
        name = op.get("op")
        if name == "trim":
            start = max(0.0, float(op.get("start") or 0))
            end = float(op.get("end") or duration)
            end = min(end, duration) if duration else end
            if end <= start:
                raise ValueError("El corte final debe ser mayor que el inicial")
            vf.append(f"trim=start={start}:end={end},setpts=PTS-STARTPTS")
            af.append(f"atrim=start={start}:end={end},asetpts=PTS-STARTPTS")
            duration = end - start
        elif name in ("speed", "slow_motion"):
            factor = float(op.get("factor") or (0.5 if name == "slow_motion" else 2.0))
            factor = max(0.25, min(4.0, factor))
            vf.append(f"setpts=PTS/{factor:.4f}")
            if name == "slow_motion" or op.get("interpolate"):
                vf.append(f"minterpolate=fps={fps:.3f}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
            af.append(_atempo_chain(factor))
            duration = duration / factor
        elif name == "interpolate":
            target = max(fps, min(120.0, float(op.get("fps") or 60)))
            vf.append(f"minterpolate=fps={target:.3f}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
            fps = target
        elif name == "stabilize":
            vf.append("deshake=rx=32:ry=32:edge=mirror")
        elif name == "color":
            preset = op.get("preset")
            if preset:
                if preset not in COLOR_PRESETS:
                    raise ValueError(f"Preset de color desconocido: {preset}")
                vf.append(COLOR_PRESETS[preset])
            eq = []
            for key in ("brightness", "contrast", "saturation", "gamma"):
                if op.get(key) is not None:
                    eq.append(f"{key}={float(op[key]):.3f}")
            if eq:
                vf.append("eq=" + ":".join(eq))
        elif name == "reframe":
            aspect = str(op.get("aspect") or "9:16")
            aw, ah = (float(x) for x in aspect.split(":"))
            target = aw / ah
            cur = w / h
            if abs(cur - target) > 0.01:
                if cur > target:  # crop width
                    cw, ch = int(h * target) // 2 * 2, h // 2 * 2
                    x = (w - cw) // 2
                    if op.get("mode", "smart") == "smart":
                        x = min(w - cw, max(0, await smart_crop_offset(src, info, cw, ch, "x")))
                    vf.append(f"crop={cw}:{ch}:{x}:0")
                else:
                    cw, ch = w // 2 * 2, int(w / target) // 2 * 2
                    y = (h - ch) // 2
                    if op.get("mode", "smart") == "smart":
                        y = min(h - ch, max(0, await smart_crop_offset(src, info, cw, ch, "y")))
                    vf.append(f"crop={cw}:{ch}:0:{y}")
                w, h = cw, ch
        elif name == "scale":
            nh = int(op.get("height") or 1080)
            vf.append(f"scale=-2:{nh}:flags=lanczos")
            w, h = int(w * nh / h) // 2 * 2, nh
        elif name == "sharpen":
            amt = float(op.get("amount") or 1.0)
            vf.append(f"unsharp=5:5:{min(2.5, 0.6 * amt):.2f}:5:5:0")
        elif name == "denoise":
            vf.append("hqdn3d=3:3:6:6")
        elif name == "grain":
            amt = int(max(1, min(40, float(op.get("amount") or 10))))
            vf.append(f"noise=alls={amt}:allf=t")
        elif name == "vignette":
            vf.append("vignette=PI/5")
        elif name == "letterbox":
            vf.append("drawbox=x=0:y=0:w=iw:h='max(0,(ih-iw/2.39)/2)':color=black:t=fill,"
                      "drawbox=x=0:y='ih-max(0,(ih-iw/2.39)/2)':w=iw:h='max(0,(ih-iw/2.39)/2)':color=black:t=fill")
        elif name == "fade":
            fin, fout = float(op.get("in") or 0), float(op.get("out") or 0)
            if fin > 0:
                vf.append(f"fade=t=in:st=0:d={fin}")
                af.append(f"afade=t=in:st=0:d={fin}")
            if fout > 0 and duration:
                st = max(0.0, duration - fout)
                vf.append(f"fade=t=out:st={st:.3f}:d={fout}")
                af.append(f"afade=t=out:st={st:.3f}:d={fout}")
        elif name == "reverse":
            if duration > 60:
                raise ValueError("Invertir solo está disponible para clips de hasta 60 s")
            vf.append("reverse")
            af.append("areverse")
        elif name == "subtitles":
            cues = op.get("cues") or []
            if not cues:
                continue
            srt = write_srt(cues)
            temp_files.append(srt)
            size = int(op.get("size") or 22)
            style = f"FontName=DejaVu Sans,FontSize={size},PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=28"
            vf.append(f"subtitles='{_filter_path(srt)}':force_style='{style}'")
        elif name == "text":
            font = find_font()
            if not font:
                raise ValueError("No hay fuentes instaladas para texto sobreimpreso")
            tf = tmp_path(".txt")
            tf.write_text(str(op.get("text", "")), encoding="utf-8")
            temp_files.append(tf)
            pos = {"top": "y=h*0.08", "center": "y=(h-text_h)/2", "bottom": "y=h*0.86-text_h"}.get(op.get("position", "bottom"), "y=h*0.86-text_h")
            size = int(op.get("size") or max(18, h // 18))
            enable = ""
            if op.get("start") is not None or op.get("end") is not None:
                enable = f":enable='between(t,{float(op.get('start') or 0)},{float(op.get('end') or 1e9)})'"
            vf.append(f"drawtext=fontfile='{_filter_path(Path(font))}':textfile='{_filter_path(tf)}':fontcolor=white:fontsize={size}:"
                      f"borderw=2:bordercolor=black@0.6:x=(w-text_w)/2:{pos}{enable}")
        elif name == "volume":
            af.append(f"volume={float(op.get('db') or 0):.2f}dB")
        elif name == "audio_denoise":
            af.append("afftdn=nf=-25")
        elif name == "normalize_audio":
            af.append("loudnorm=I=-16:TP=-1.5:LRA=11")
        elif name == "mute":
            mute = True
        else:
            raise ValueError(f"Operación de vídeo desconocida: {name}")

    vf.append("scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p")
    dest = tmp_path(".mp4")
    args = [*pre, "-i", str(src), "-filter:v", ",".join(vf)]
    if has_audio and not mute:
        if af:
            args += ["-filter:a", ",".join(af)]
        args += ["-c:a", "aac", "-b:a", "192k"]
    else:
        args += ["-an"]
    args += ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", str(dest)]
    try:
        await run_ffmpeg(args, total=duration or None, on_progress=on_progress)
    finally:
        for f in temp_files:
            f.unlink(missing_ok=True)
    return dest


async def extract_frame(src: Path, at: float | str = "last") -> Path:
    dest = tmp_path(".png")
    if at == "last":
        await run_ffmpeg(["-sseof", "-0.6", "-i", str(src), "-update", "1", "-q:v", "1", str(dest)], timeout=300)
    else:
        await run_ffmpeg(["-ss", f"{float(at):.3f}", "-i", str(src), "-frames:v", "1", str(dest)], timeout=300)
    if not dest.exists():
        raise RuntimeError("No se pudo extraer el fotograma")
    return dest


async def normalise_clip(src: Path, width: int, height: int, fps: float, *, start: float = 0, end: float | None = None,
                         speed: float = 1.0, volume_db: float = 0.0, still_duration: float | None = None) -> Path:
    """Re-encode any clip (video or still image) to a uniform intermediate with an audio track."""
    info = await inspect(src)
    dest = tmp_path(".mp4")
    fit = (f"scale={width}:{height}:force_original_aspect_ratio=decrease:flags=lanczos,"
           f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={fps},format=yuv420p")
    if info.kind == "image":
        dur = float(still_duration or 3.0)
        args = ["-loop", "1", "-t", f"{dur:.3f}", "-i", str(src), "-f", "lavfi", "-t", f"{dur:.3f}",
                "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                "-filter:v", fit, "-map", "0:v", "-map", "1:a", "-shortest"]
    else:
        end = end if end is not None else (info.duration or 0)
        seg = max(0.04, end - start)
        vchain = f"trim=start={start}:end={end},setpts=(PTS-STARTPTS)/{speed},{fit}"
        if info.has_audio:
            achain = f"atrim=start={start}:end={end},asetpts=PTS-STARTPTS,{_atempo_chain(speed)},volume={volume_db}dB,aresample=48000,aformat=channel_layouts=stereo"
            args = ["-i", str(src), "-filter_complex", f"[0:v]{vchain}[v];[0:a]{achain}[a]", "-map", "[v]", "-map", "[a]"]
        else:
            args = ["-i", str(src), "-f", "lavfi", "-t", f"{seg / speed:.3f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                    "-filter_complex", f"[0:v]{vchain}[v]", "-map", "[v]", "-map", "1:a", "-shortest"]
    args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(dest)]
    await run_ffmpeg(args, timeout=1800)
    return dest


async def concat_with_transitions(clips: list[tuple[Path, float]], transitions: list[dict[str, Any] | None],
                                  on_progress: ProgressCb = None) -> Path:
    """Join normalised clips. ``transitions[i]`` applies between clip i and i+1 (xfade + acrossfade)."""
    if not clips:
        raise ValueError("No hay clips que unir")
    if len(clips) == 1:
        return clips[0][0]
    args: list[str] = []
    for p, _ in clips:
        args += ["-i", str(p)]
    fc: list[str] = []
    v_prev, a_prev = "[0:v]", "[0:a]"
    offset = clips[0][1]
    total = clips[0][1]
    for i in range(1, len(clips)):
        t = transitions[i - 1] if i - 1 < len(transitions) else None
        dur = clips[i][1]
        if t and t.get("type") and t["type"] != "cut":
            d = max(0.1, min(float(t.get("duration") or 0.5), clips[i - 1][1] / 2, dur / 2))
            kind = {"crossfade": "fade", "fade_black": "fadeblack", "fade_white": "fadewhite", "wipe_left": "wipeleft",
                    "wipe_right": "wiperight", "slide_left": "slideleft", "slide_up": "slideup", "dissolve": "dissolve",
                    "circle_open": "circleopen", "zoom": "zoomin"}.get(t["type"], "fade")
            off = max(0.0, offset - d)
            fc.append(f"{v_prev}[{i}:v]xfade=transition={kind}:duration={d:.3f}:offset={off:.3f}[v{i}]")
            fc.append(f"{a_prev}[{i}:a]acrossfade=d={d:.3f}[a{i}]")
            offset = off + dur
            total = total + dur - d
        else:
            fc.append(f"{v_prev}{a_prev}[{i}:v][{i}:a]concat=n=2:v=1:a=1[v{i}][a{i}]")
            offset += dur
            total += dur
        v_prev, a_prev = f"[v{i}]", f"[a{i}]"
    dest = tmp_path(".mp4")
    args += ["-filter_complex", ";".join(fc), "-map", v_prev, "-map", a_prev, "-c:v", "libx264", "-preset", "medium",
             "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(dest)]
    await run_ffmpeg(args, total=total, on_progress=on_progress)
    return dest


# ---------------------------------------------------------------------------
# Audio
# ---------------------------------------------------------------------------
AUDIO_OPS = {
    "trim": "Cortar (start, end)",
    "volume": "Volumen (db)",
    "normalize": "Normalizar sonoridad EBU R128 (-16 LUFS)",
    "denoise": "Eliminar ruido (afftdn)",
    "fade": "Fundidos (in, out)",
    "speed": "Velocidad (factor)",
    "highpass": "Filtro paso alto (hz)",
    "lowpass": "Filtro paso bajo (hz)",
    "reverb": "Reverberación ligera",
}


async def apply_audio_ops(src: Path, ops: list[dict[str, Any]], on_progress: ProgressCb = None) -> Path:
    info = await inspect(src)
    if not info.has_audio:
        raise ValueError("El archivo no contiene audio")
    af: list[str] = []
    duration = info.duration or 0
    for op in ops:
        n = op.get("op")
        if n == "trim":
            s, e = float(op.get("start") or 0), float(op.get("end") or duration)
            af.append(f"atrim=start={s}:end={e},asetpts=PTS-STARTPTS")
            duration = e - s
        elif n == "volume":
            af.append(f"volume={float(op.get('db') or 0):.2f}dB")
        elif n == "normalize":
            af.append("loudnorm=I=-16:TP=-1.5:LRA=11")
        elif n == "denoise":
            af.append(f"afftdn=nf={float(op.get('floor') or -25):.0f}")
        elif n == "fade":
            fin, fout = float(op.get("in") or 0), float(op.get("out") or 0)
            if fin:
                af.append(f"afade=t=in:st=0:d={fin}")
            if fout and duration:
                af.append(f"afade=t=out:st={max(0, duration - fout):.3f}:d={fout}")
        elif n == "speed":
            f = max(0.25, min(4.0, float(op.get("factor") or 1)))
            af.append(_atempo_chain(f))
            duration /= f
        elif n == "highpass":
            af.append(f"highpass=f={float(op.get('hz') or 80):.0f}")
        elif n == "lowpass":
            af.append(f"lowpass=f={float(op.get('hz') or 12000):.0f}")
        elif n == "reverb":
            af.append("aecho=0.8:0.85:40|80:0.25|0.15")
        else:
            raise ValueError(f"Operación de audio desconocida: {n}")
    dest = tmp_path(".mp3")
    args = ["-i", str(src), "-vn"]
    if af:
        args += ["-filter:a", ",".join(af)]
    args += ["-c:a", "libmp3lame", "-b:a", "256k", str(dest)]
    await run_ffmpeg(args, total=duration or None, on_progress=on_progress)
    return dest


async def mix_tracks(tracks: list[dict[str, Any]], on_progress: ProgressCb = None, duration: float | None = None) -> Path:
    """Mix several audio sources: ``[{path, volume_db, delay}]`` -> one stereo track."""
    if not tracks:
        raise ValueError("No hay pistas que mezclar")
    args: list[str] = []
    fc: list[str] = []
    for i, t in enumerate(tracks):
        args += ["-i", str(t["path"])]
        delay_ms = int(float(t.get("delay") or 0) * 1000)
        fc.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,volume={float(t.get('volume_db') or 0):.2f}dB,"
                  f"adelay={delay_ms}|{delay_ms}[m{i}]")
    fc.append("".join(f"[m{i}]" for i in range(len(tracks))) + f"amix=inputs={len(tracks)}:duration=longest:normalize=0[out]")
    dest = tmp_path(".mp3")
    args += ["-filter_complex", ";".join(fc), "-map", "[out]"]
    if duration:
        args += ["-t", f"{duration:.3f}"]
    args += ["-c:a", "libmp3lame", "-b:a", "256k", str(dest)]
    await run_ffmpeg(args, total=duration, on_progress=on_progress)
    return dest


async def extract_audio(src: Path) -> Path:
    dest = tmp_path(".mp3")
    await run_ffmpeg(["-i", str(src), "-vn", "-c:a", "libmp3lame", "-b:a", "256k", str(dest)])
    return dest


def ceil2(v: float) -> int:
    return int(math.ceil(v / 2) * 2)


async def apply_segment_ops(src: Path, start: float, end: float, ops: list[dict[str, Any]], on_progress: ProgressCb = None) -> Path:
    """Apply ``ops`` only to [start, end] and keep the rest of the video intact (edit by segments)."""
    info = await inspect(src)
    dur = info.duration or 0
    start, end = max(0.0, start), min(end, dur) if dur else end
    if end <= start:
        raise ValueError("Segmento vacío")
    w, h, fps = (info.width or 1280) // 2 * 2, (info.height or 720) // 2 * 2, info.fps or 24
    parts: list[tuple[Path, float]] = []
    temps: list[Path] = []
    try:
        if start > 0.05:
            p = await normalise_clip(src, w, h, fps, start=0, end=start)
            temps.append(p)
            parts.append((p, start))
        mid = await normalise_clip(src, w, h, fps, start=start, end=end)
        temps.append(mid)
        mid2 = await apply_video_ops(mid, ops)
        temps.append(mid2)
        mid3 = await normalise_clip(mid2, w, h, fps)  # restore uniform size/audio after e.g. reframe
        temps.append(mid3)
        parts.append((mid3, (await inspect(mid3)).duration or (end - start)))
        if dur - end > 0.05:
            p = await normalise_clip(src, w, h, fps, start=end, end=dur)
            temps.append(p)
            parts.append((p, dur - end))
        out = await concat_with_transitions(parts, [None] * (len(parts) - 1), on_progress)
        if out in temps:
            temps.remove(out)
        return out
    finally:
        for t in temps:
            t.unlink(missing_ok=True)
