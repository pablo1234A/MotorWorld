"""End-to-end check against a *running* stack (API + arq workers + Postgres + Redis + storage).

    python scripts/integration_test.py --base http://localhost:8000

Uses only the public HTTP API. Generates its own media with FFmpeg. Exercises
real local processing through the distributed queue; it does not call paid
providers (it verifies they report "not configured" when no key is present).
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import httpx  # noqa: E402

OK = "\033[32m✓\033[0m"
FAIL = "\033[31m✗\033[0m"
results: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, cond, detail))
    print(f"  {OK if cond else FAIL} {name}" + (f"  ({detail})" if detail and not cond else ""))


def make_media(d: Path) -> dict[str, Path]:
    vid = d / "clip.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=4", "-f", "lavfi", "-i",
                    "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(vid)], check=True)
    img = d / "photo.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "gradients=size=1024x768:speed=0.01", "-frames:v", "1", str(img)], check=True)
    wav = d / "voice.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=d=3:c=pink:a=0.05", "-f", "lavfi", "-i", "sine=f=220:d=3",
                    "-filter_complex", "amix=inputs=2", str(wav)], check=True)
    return {"video": vid, "image": img, "audio": wav}


def wait(c: httpx.Client, gid: str, timeout: float = 300) -> dict:
    end = time.time() + timeout
    seen_progress = False
    while time.time() < end:
        resp = c.get(f"/api/generations/{gid}")
        if resp.status_code == 429:  # rate limiter at work; back off
            time.sleep(2)
            continue
        g = resp.json()
        if g.get("progress") not in (None, 0, 1.0):
            seen_progress = True
        if g["status"] in ("completed", "failed", "cancelled"):
            g["_seen_progress"] = seen_progress
            return g
        time.sleep(1.0)
    raise TimeoutError(gid)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    args = ap.parse_args()
    origin = {"origin": "http://localhost:3000"}
    tmp = Path(tempfile.mkdtemp())
    media = make_media(tmp)
    a = httpx.Client(base_url=args.base, headers=origin, timeout=60)
    b = httpx.Client(base_url=args.base, headers=origin, timeout=60)
    suffix = uuid.uuid4().hex[:6]

    print("Salud y autenticación")
    h = a.get("/api/health").json()
    check("health: base de datos, redis, almacenamiento y ffmpeg", h["ok"], str(h))
    r = a.post("/api/auth/register", json={"email": f"it-a-{suffix}@example.com", "password": "Integracion2025", "accept_terms": True})
    check("registro usuario A", r.status_code == 201, r.text)
    b.post("/api/auth/register", json={"email": f"it-b-{suffix}@example.com", "password": "Integracion2025", "accept_terms": True})
    check("sesión persistente (cookie)", a.get("/api/me").status_code == 200)
    refresh = a.post("/api/auth/refresh")
    check("renovación de sesión (refresh rotativo)", refresh.status_code == 200)

    print("Subidas y biblioteca")
    up = {}
    for k, p in media.items():
        with p.open("rb") as fh:
            r = a.post("/api/assets", files={"file": (p.name, fh)})
        up[k] = r.json()
        check(f"subida {k} validada y analizada", r.status_code == 201 and r.json()["kind"] == k, r.text[:200])
    check("vídeo: metadatos ffprobe", up["video"]["width"] == 1280 and up["video"]["has_audio"])

    print("Trabajos en cola distribuida (arq + workers)")
    r = a.post("/api/generations", json={"task": "local_image_op", "model_id": "local-image", "inputs": {"image": up["image"]["id"]},
                                         "params": {"ops": [{"op": "adjust", "contrast": 1.3, "warmth": 0.4}, {"op": "vignette", "strength": 0.5}]}})
    g = wait(a, r.json()["id"])
    check("edición de imagen local completada", g["status"] == "completed", g.get("error") or "")
    out = g["outputs"][0]
    check("la edición crea un archivo nuevo (original intacto)", out["parent_id"] == up["image"]["id"] and out["id"] != up["image"]["id"])
    d = a.get(out["download_url"])
    check("descarga del resultado", d.status_code == 200 and d.content[:4] == b"\x89PNG")

    r = a.post("/api/generations", json={"task": "local_video_op", "model_id": "local-ffmpeg", "inputs": {"video": up["video"]["id"]},
                                         "params": {"ops": [{"op": "slow_motion", "factor": 0.5}, {"op": "stabilize"}, {"op": "color", "preset": "cinematic"},
                                                            {"op": "reframe", "aspect": "9:16", "mode": "smart"}, {"op": "letterbox"}]}})
    g = wait(a, r.json()["id"], 600)
    check("vídeo: cámara lenta + estabilización + color + reencuadre", g["status"] == "completed", g.get("error") or "")
    if g["status"] == "completed":
        v = g["outputs"][0]
        check("vídeo resultante 9:16 y ~8 s", v["height"] > v["width"] and abs(v["duration"] - 8) < 0.5, f"{v['width']}x{v['height']} {v['duration']}")
        check("progreso real reportado por FFmpeg", g["_seen_progress"] or g["progress"] == 1.0)

    r = a.post("/api/generations", json={"task": "local_audio_op", "model_id": "local-ffmpeg", "inputs": {"audio": [up["audio"]["id"], up["video"]["id"]]},
                                         "params": {"mix": True, "volumes": [0, -9], "delays": [0, 0.5]}})
    g = wait(a, r.json()["id"])
    check("mezcla de audio", g["status"] == "completed", g.get("error") or "")

    print("Montaje multipista")
    tl = a.post("/api/timelines", json={"name": "IT"}).json()
    data = tl["data"]
    data.update(width=1280, height=720, fps=30)
    for t in data["tracks"]:
        if t["id"] == "v1":
            t["clips"] = [{"id": "1", "asset_id": up["video"]["id"], "start": 0, "in": 0, "out": 3},
                          {"id": "2", "asset_id": up["image"]["id"], "start": 1, "still_duration": 2, "transition_in": {"type": "crossfade", "duration": 0.5}}]
        if t["id"] == "a2":
            t["clips"] = [{"asset_id": up["audio"]["id"], "start": 0, "in": 0, "out": 3, "volume_db": -6}]
        if t["id"] == "s1":
            t["clips"] = [{"start": 0.5, "end": 2.5, "text": "Prueba de integración"}]
    r = a.put(f"/api/timelines/{tl['id']}", json={"data": data, "version": tl["version"]})
    check("guardar línea temporal", r.status_code == 200, r.text[:200])
    rr = a.post(f"/api/timelines/{tl['id']}/render")
    check("encolar render", rr.status_code == 201, rr.text[:300])
    g = wait(a, rr.json()["id"], 600) if rr.status_code == 201 else {"status": "failed", "error": rr.text}
    check("render FFmpeg de la línea temporal", g["status"] == "completed", g.get("error") or "")
    if g["status"] == "completed":
        check("duración del render (3 + 2 − 0,5 s)", abs(g["outputs"][0]["duration"] - 4.5) < 0.4, str(g["outputs"][0]["duration"]))
    check("exportación OTIO", a.get(f"/api/timelines/{tl['id']}/export.otio").status_code == 200)
    check("exportación SRT", "Prueba de integración" in a.get(f"/api/timelines/{tl['id']}/export.srt").text)

    print("Proyectos y película (manual, sin LLM)")
    p = a.post("/api/projects", json={"name": "Proyecto IT"}).json()
    f = a.post("/api/films", json={"title": "Película IT", "project_id": p["id"]}).json()
    s = f["script"]
    s["scenes"] = [{"title": "Escena 1", "shots": [{"description": "plano", "keyframe_asset_id": up["image"]["id"], "duration": 3,
                                                     "dialogue": [{"character_id": "", "line": "Hola"}]}]}]
    r = a.put(f"/api/films/{f['id']}", json={"script": s, "version": f["version"]})
    check("guardar guion editado a mano", r.status_code == 200, r.text[:200])
    tl2 = a.post(f"/api/films/{f['id']}/assemble").json()
    check("montaje automático desde el storyboard", "timeline_id" in tl2)
    dev = a.post(f"/api/films/{f['id']}/develop", json={"idea": "Una historia de prueba suficientemente larga"})
    check("sin LLM configurado: error claro", dev.status_code == 400 and dev.json()["detail"]["code"] == "llm_not_configured", dev.text[:200])

    print("Proveedores")
    r = a.post("/api/generations", json={"task": "text_to_image", "model_id": "flux-1.1-pro", "prompt": "un coche"})
    check("modelo de pago sin clave: indica qué configurar", r.status_code == 400 and r.json()["detail"]["code"] == "provider_not_configured", r.text[:200])
    prov = a.get("/api/providers?live=true").json()["items"]
    local = next(x for x in prov if x["id"] == "local")
    check("panel de proveedores: motor local activo", local["configured"] and local["health"]["ok"])

    print("Aislamiento entre usuarios")
    for url in (f"/api/assets/{up['image']['id']}", up["image"]["url"], f"/api/projects/{p['id']}", f"/api/films/{f['id']}", f"/api/timelines/{tl['id']}",
                f"/api/generations/{g['id']}"):
        check(f"B no accede a {url.split('/api/')[1][:30]}…", b.get(url).status_code == 404)
    r = b.post("/api/generations", json={"task": "local_image_op", "model_id": "local-image", "inputs": {"image": up["image"]["id"]}, "params": {"ops": []}})
    check("B no puede usar archivos de A como entrada", r.status_code == 400)

    print("Cancelación y reintento")
    long = a.post("/api/generations", json={"task": "local_video_op", "model_id": "local-ffmpeg", "inputs": {"video": up["video"]["id"]},
                                            "params": {"ops": [{"op": "interpolate", "fps": 120}, {"op": "scale", "height": 2160}]}}).json()
    time.sleep(1.0)
    a.post(f"/api/generations/{long['id']}/cancel")
    g = wait(a, long["id"], 120)
    check("cancelar un trabajo en proceso", g["status"] == "cancelled", g["status"])
    r = a.post(f"/api/generations/{long['id']}/retry")
    check("reintentar trabajo cancelado", r.status_code == 200)
    a.post(f"/api/generations/{long['id']}/cancel")

    a.post("/api/auth/logout")
    check("cierre de sesión", a.get("/api/me").status_code == 401)

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} comprobaciones superadas")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
