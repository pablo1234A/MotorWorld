"""Ayudante local de ClipForge AI.

Servidor que solo escucha en 127.0.0.1:8765. Sirve ClipForge-AI.html y
expone la API que la página espera para descargar vídeos públicos de
YouTube con yt-dlp:

  GET    /api/health
  POST   /api/youtube/info       {"url": ...}
  POST   /api/youtube/download   {"url": ...}  -> {"task": id}
  GET    /api/task/<id>          -> {state, progress, message}
  GET    /api/task/<id>/file     -> el vídeo (cabecera X-Filename)
  DELETE /api/task/<id>

No usa cookies ni credenciales.
"""
import json
import os
import re
import shutil
import tempfile
import threading
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import yt_dlp

HOST, PORT = "127.0.0.1", 8765
ROOT = Path(__file__).resolve().parent
PAGE = ROOT / "ClipForge-AI.html"
MAX_SECONDS = 4 * 3600
YT_RE = re.compile(r"^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$")

TASKS = {}
LOCK = threading.Lock()


def classify(err):
    s = str(err).lower()
    for code, keys in [
        ("private", ["private video"]),
        ("age", ["confirm your age", "age-restricted", "inappropriate for some users"]),
        ("members", ["members-only", "join this channel"]),
        ("region", ["not available in your country", "geo"]),
        ("live", ["live event", "is live", "premieres in"]),
        ("drm", ["drm"]),
        ("bot", ["not a bot", "sign in to confirm"]),
        ("missing", ["video unavailable", "has been removed", "does not exist"]),
        ("network", ["unable to download", "timed out", "connection", "getaddrinfo"]),
    ]:
        if any(k in s for k in keys):
            return code
    return None


def ydl_opts(**extra):
    opts = {"quiet": True, "no_warnings": True, "noplaylist": True, "cookiefile": None}
    opts.update(extra)
    return opts


def get_info(url):
    with yt_dlp.YoutubeDL(ydl_opts(skip_download=True)) as ydl:
        info = ydl.extract_info(url, download=False)
    if info.get("is_live"):
        raise RuntimeError("live event")
    if (info.get("duration") or 0) > MAX_SECONDS:
        raise ValueError("toolarge")
    return {
        "title": info.get("title"),
        "author": info.get("uploader") or info.get("channel"),
        "duration": info.get("duration"),
        "thumb": info.get("thumbnail"),
    }


def run_download(task_id, url):
    t = TASKS[task_id]
    workdir = Path(tempfile.mkdtemp(prefix="clipforge_"))
    t["dir"] = workdir

    def hook(d):
        if t.get("cancel"):
            raise yt_dlp.utils.DownloadCancelled()
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            if total:
                t["progress"] = min(0.95, d.get("downloaded_bytes", 0) / total)
            t["message"] = "Descargando… " + (d.get("_percent_str") or "").strip()
        elif d["status"] == "finished":
            t["message"] = "Uniendo audio y vídeo…"

    try:
        get_info(url)
        opts = ydl_opts(
            format="bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
            merge_output_format="mp4",
            outtmpl=str(workdir / "%(title).80B.%(ext)s"),
            progress_hooks=[hook],
        )
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
        files = sorted(workdir.glob("*.mp4")) or sorted(p for p in workdir.iterdir() if p.is_file())
        if not files:
            raise RuntimeError("yt-dlp no generó ningún archivo")
        t.update(file=files[0], state="done", progress=1, message="Listo")
    except Exception as e:  # noqa: BLE001
        code = "toolarge" if str(e) == "toolarge" else classify(e)
        t.update(state="error", code=code, error=str(e)[:500])


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def cors(self):
        origin = self.headers.get("Origin")
        # La página puede abrirse como archivo (Origin: null) o desde este servidor.
        if origin in ("null", f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Expose-Headers", "X-Filename")
            self.send_header("Access-Control-Allow-Private-Network", "true")

    def send_json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_url(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            url = json.loads(self.rfile.read(min(n, 4096)) or b"{}").get("url", "")
        except ValueError:
            url = ""
        # Solo URLs canónicas de YouTube: evita usar el ayudante contra otros hosts.
        return url if YT_RE.match(url) else None

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html", "/ClipForge-AI.html"):
            data = PAGE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        elif path == "/api/health":
            self.send_json(200, {"ok": True, "ytdlp": yt_dlp.version.__version__,
                                 "ffmpeg": bool(shutil.which("ffmpeg"))})
        elif m := re.fullmatch(r"/api/task/([0-9a-f]{32})(/file)?", path):
            t = TASKS.get(m.group(1))
            if not t:
                return self.send_json(404, {"error": "tarea desconocida"})
            if not m.group(2):
                return self.send_json(200, {k: t.get(k) for k in ("state", "progress", "message", "code", "error")})
            if t["state"] != "done":
                return self.send_json(409, {"error": "aún no terminó"})
            f = t["file"]
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(f.stat().st_size))
            self.send_header("X-Filename", re.sub(r"[^\w.\- ]", "_", f.name))
            self.end_headers()
            with open(f, "rb") as fh:
                shutil.copyfileobj(fh, self.wfile)
        else:
            self.send_json(404, {"error": "no encontrado"})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/api/youtube/info", "/api/youtube/download"):
            return self.send_json(404, {"error": "no encontrado"})
        url = self.read_url()
        if not url:
            return self.send_json(400, {"error": "URL de YouTube no válida"})
        if path.endswith("/info"):
            try:
                return self.send_json(200, get_info(url))
            except Exception as e:  # noqa: BLE001
                code = "toolarge" if str(e) == "toolarge" else classify(e)
                return self.send_json(422, {"code": code, "error": str(e)[:500]})
        task_id = uuid.uuid4().hex
        TASKS[task_id] = {"state": "running", "progress": 0, "message": "Preparando…"}
        threading.Thread(target=run_download, args=(task_id, url), daemon=True).start()
        self.send_json(202, {"task": task_id})

    def do_DELETE(self):
        m = re.fullmatch(r"/api/task/([0-9a-f]{32})", self.path.split("?")[0])
        t = TASKS.pop(m.group(1), None) if m else None
        if t:
            t["cancel"] = True
            if t.get("dir"):
                shutil.rmtree(t["dir"], ignore_errors=True)
        self.send_json(200, {"ok": True})


if __name__ == "__main__":
    if not shutil.which("ffmpeg"):
        print("AVISO: no se encontró FFmpeg; los vídeos 1080p no podrán unir audio y vídeo.")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"ClipForge listo en http://{HOST}:{PORT}  (Ctrl+C para salir)")
    if os.environ.get("CLIPFORGE_NO_BROWSER") != "1":
        webbrowser.open(f"http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
