"""Crea N clips de un vídeo de YouTube (o de un archivo local) con un solo comando.

Elige los momentos con más energía de audio (más intensos) sin solaparlos
y los exporta en vertical 9:16 (1080x1920) listos para Shorts, Reels o TikTok.

Uso:
  python hacer_clips.py "https://youtu.be/QBP8Nmx_m6Q"
  python hacer_clips.py video.mp4 --clips 10 --duracion 30 --formato horizontal
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, text=True, **kw)


def download(url, out_dir):
    import yt_dlp
    opts = {
        "format": "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
        "merge_output_format": "mp4",
        "outtmpl": str(out_dir / "original.%(ext)s"),
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    return next(out_dir.glob("original.*"))


def duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(path)], capture_output=True)
    return float(r.stdout.strip())


def loudness_per_second(path, total):
    """Volumen (dB RMS) de cada segundo del audio."""
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-vn", "-ac", "1",
         "-af", "asetnsamples=n=44100,astats=metadata=1:reset=1,"
                "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
         "-ar", "44100", "-f", "null", "-"],
        capture_output=True, text=True)
    vals = [float(v) if v not in ("-inf", "inf") else -90.0
            for v in re.findall(r"RMS_level=(-?[\d.]+|-?inf)", r.stdout)]
    n = int(total)
    if len(vals) < n * 0.5:  # sin audio útil: reparte uniformemente
        return [0.0] * n
    return (vals + [-90.0] * n)[:n]


def pick_windows(levels, total, n, length):
    """Las n ventanas de `length` s con más energía, sin solaparse."""
    if total <= length * n:  # vídeo corto: tramos consecutivos
        step = max(0.0, (total - length) / max(1, n - 1))
        return [round(i * step, 2) for i in range(n)]
    L = int(length)
    margin = min(5, int(total * 0.02))  # evita intro/outro
    scores = []
    acc = sum(levels[:L])
    for s in range(0, len(levels) - L + 1):
        if s:
            acc += levels[s + L - 1] - levels[s - 1]
        if margin <= s <= total - L - margin:
            scores.append((acc / L, s))
    scores.sort(reverse=True)
    # Separación mínima: un clip entero; si no caben todos, se relaja poco a poco.
    gap = L
    while True:
        chosen = []
        for _, s in scores:
            if all(abs(s - c) >= gap for c in chosen):
                chosen.append(s)
                if len(chosen) == n:
                    return sorted(chosen)
        if gap == 1:
            return sorted(chosen)
        gap = max(1, int(gap * 0.85))


def export(src, start, length, out, fmt):
    if fmt == "vertical":
        vf = ("[0:v]split[a][b];"
              "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:2[bg];"
              "[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];"
              "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]")
        vargs = ["-filter_complex", vf, "-map", "[v]", "-map", "0:a?"]
    else:
        vargs = ["-map", "0:v", "-map", "0:a?"]
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-ss", f"{start:.2f}", "-t", f"{length:.2f}", "-i", str(src), *vargs,
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)])


def mmss(t):
    return f"{int(t // 60):02d}:{int(t % 60):02d}"


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("fuente", help="Enlace de YouTube o ruta a un vídeo")
    p.add_argument("--clips", type=int, default=10)
    p.add_argument("--duracion", type=float, default=30)
    p.add_argument("--formato", choices=["vertical", "horizontal"], default="vertical")
    p.add_argument("--salida", default="clips")
    a = p.parse_args()

    out = Path(a.salida)
    out.mkdir(parents=True, exist_ok=True)
    src = Path(a.fuente)
    if not src.exists():
        print("Descargando vídeo…")
        src = download(a.fuente, out)

    total = duration(src)
    length = min(a.duracion, total)
    print(f"Duración: {mmss(total)}. Analizando el audio para elegir los mejores momentos…")
    starts = pick_windows(loudness_per_second(src, total), total, a.clips, length)

    lines = []
    for i, s in enumerate(starts, 1):
        name = out / f"clip_{i:02d}_{mmss(s).replace(':', 'm')}s.mp4"
        print(f"  [{i}/{len(starts)}] {mmss(s)} → {mmss(s + length)}  {name.name}")
        export(src, s, length, name, a.formato)
        lines.append(f"{i:02d}  {mmss(s)} - {mmss(s + length)}  {name.name}")
    (out / "indice.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nListo: {len(starts)} clips en '{out}'.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.exit(f"Error ejecutando FFmpeg: {e}")
