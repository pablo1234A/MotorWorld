#!/usr/bin/env python3
"""
ClipForge AI — ayudante local (opcional).

Sirve la aplicación en http://127.0.0.1:8765 y permite obtener vídeos públicos
de YouTube con yt-dlp para procesarlos en el navegador.

Seguridad y límites:
  * Escucha solo en 127.0.0.1 (no es accesible desde otros equipos).
  * Comprueba las cabeceras Host y Origin (evita DNS rebinding y webs ajenas).
  * Solo acepta URLs de vídeos de YouTube (no puede usarse para pedir otras
    direcciones, internas o externas).
  * No usa cookies ni credenciales: no accede a vídeos privados, con
    restricción de edad, solo para miembros ni contenido con DRM.
  * Límite de tamaño y duración; los temporales se borran al terminar.
"""
import argparse, json, os, re, shutil, sys, tempfile, threading, time, uuid, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

VERSION = "1.0.0"
HERE = os.path.dirname(os.path.abspath(__file__))
APP_FILE = os.path.join(HERE, "ClipForge-AI.html")
MAX_BYTES = 4 * 1024 ** 3
MAX_DURATION = 4 * 3600
TASK_TTL = 2 * 3600

# El binario de deno (motor JS que yt-dlp necesita para YouTube) se instala junto a Python.
os.environ["PATH"] = os.path.dirname(sys.executable) + os.pathsep + os.environ.get("PATH", "")

try:
    import yt_dlp
    YTDLP_VERSION = yt_dlp.version.__version__
except Exception:  # pragma: no cover
    yt_dlp = None
    YTDLP_VERSION = None


def find_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")


FFMPEG = find_ffmpeg()
ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def parse_youtube(raw):
    """Devuelve la URL canónica del vídeo o None si no es un vídeo de YouTube."""
    if not isinstance(raw, str) or len(raw) > 2048:
        return None
    s = raw.strip()
    if not re.match(r"^https?://", s, re.I):
        s = "https://" + s
    try:
        u = urlparse(s)
    except ValueError:
        return None
    if u.scheme not in ("http", "https") or u.username or u.password or (u.port not in (None, 80, 443)):
        return None
    host = re.sub(r"^(www|m|music)\.", "", (u.hostname or "").lower())
    vid = None
    if host == "youtu.be":
        vid = u.path.lstrip("/").split("/")[0]
    elif host in ("youtube.com", "youtube-nocookie.com"):
        if u.path == "/watch":
            vid = (parse_qs(u.query).get("v") or [None])[0]
        else:
            m = re.match(r"^/(shorts|live|embed|v|e)/([^/?#]+)", u.path)
            vid = m.group(2) if m else None
    if not vid or not ID_RE.match(vid):
        return None
    return f"https://www.youtube.com/watch?v={vid}"


def classify(msg):
    m = (msg or "").lower()
    rules = [
        ("bot", ["not a bot", "confirm you're not", "confirm you’re not"]),
        ("age", ["confirm your age", "age-restricted", "inappropriate for some users"]),
        ("private", ["private video", "this video is private"]),
        ("members", ["members-only", "join this channel", "available to this channel's members"]),
        ("region", ["not available in your country", "geo restrict", "blocked it in your country"]),
        ("live", ["live event", "is live", "premieres in", "this live"]),
        ("drm", ["drm"]),
        ("toolarge", ["larger than max-filesize", "demasiado largo"]),
        ("missing", ["video unavailable", "has been removed", "does not exist", "account associated", "not available", "terminated"]),
        ("network", ["unable to download webpage", "unable to download api page", "unable to connect", "proxyerror", "getaddrinfo", "timed out", "network", "connection", "name resolution"]),
    ]
    for code, keys in rules:
        if any(k in m for k in keys):
            return code
    return "unknown"


def base_opts():
    o = {
        "quiet": True, "no_warnings": True, "noplaylist": True, "cachedir": False,
        "socket_timeout": 30, "retries": 3, "nocheckcertificate": False,
        "cookiefile": None,  # nunca se usan cookies ni credenciales
    }
    return o


TASKS = {}
LOCK = threading.Lock()


def run_download(task_id, url):
    t = TASKS[task_id]
    tmp = tempfile.mkdtemp(prefix="clipforge_")
    t["dir"] = tmp

    def hook(d):
        if t.get("cancel"):
            raise Exception("Cancelado por el usuario")
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            done = d.get("downloaded_bytes") or 0
            if total > MAX_BYTES:
                raise Exception("File is larger than max-filesize")
            t["progress"] = min(0.99, done / total) if total else 0
            sp = d.get("speed") or 0
            t["message"] = f"Descargando… {done / 1048576:.0f} MB" + (f" de {total / 1048576:.0f} MB" if total else "") + (f" · {sp / 1048576:.1f} MB/s" if sp else "")
        elif d.get("status") == "finished":
            t["message"] = "Uniendo audio y vídeo…"

    def match_filter(info, *, incomplete=False):
        if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
            return "Directo en curso: this live event cannot be processed"
        if (info.get("duration") or 0) > MAX_DURATION:
            return "Vídeo demasiado largo (larger than max-filesize)"
        return None

    opts = base_opts()
    opts.update({
        "outtmpl": os.path.join(tmp, "%(id)s.%(ext)s"),
        "progress_hooks": [hook],
        "match_filter": match_filter,
        "max_filesize": MAX_BYTES,
    })
    if FFMPEG:
        # H.264 + AAC hasta 1080p: es lo que Chrome decodifica en cualquier equipo con Windows.
        opts.update({
            "format": "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080][vcodec^=avc]+ba/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b",
            "merge_output_format": "mp4",
            "ffmpeg_location": FFMPEG,
        })
    else:
        opts["format"] = "b[ext=mp4][height<=1080]/b[ext=mp4]/b"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                raise Exception("Video unavailable")
        files = [f for f in os.listdir(tmp) if not f.endswith((".part", ".ytdl"))]
        if not files:
            raise Exception("La descarga no produjo ningún archivo")
        path = max((os.path.join(tmp, f) for f in files), key=os.path.getsize)
        t.update(state="done", progress=1.0, message="Descarga completada", file=path,
                 title=info.get("title") or "youtube")
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if t.get("cancel"):
            t.update(state="error", code="cancelled", error="Cancelado")
        else:
            t.update(state="error", code=classify(msg), error=re.sub(r"\x1b\[[0-9;]*m", "", msg)[:600])


def cleanup_task(task_id):
    t = TASKS.pop(task_id, None)
    if t:
        t["cancel"] = True
        if t.get("dir"):
            shutil.rmtree(t["dir"], ignore_errors=True)


def janitor():
    while True:
        time.sleep(300)
        now = time.time()
        for tid, t in list(TASKS.items()):
            if now - t["created"] > TASK_TTL:
                cleanup_task(tid)


class Handler(BaseHTTPRequestHandler):
    server_version = "ClipForgeHelper/" + VERSION

    def log_message(self, fmt, *args):
        sys.stderr.write("  " + (fmt % args) + "\n")

    # ---- seguridad ----
    def allowed_origin(self):
        port = self.server.server_address[1]
        ok = {"null", f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
        origin = self.headers.get("Origin")
        if origin is None:
            return True, None
        return (origin in ok), origin

    def host_ok(self):
        port = self.server.server_address[1]
        return self.headers.get("Host", "") in (f"127.0.0.1:{port}", f"localhost:{port}")

    def cors(self, origin):
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Expose-Headers", "X-Filename, Content-Length")

    def send_json(self, code, obj, origin=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.cors(origin)
        self.end_headers()
        self.wfile.write(body)

    def guard(self):
        if not self.host_ok():
            self.send_json(403, {"error": "Host no permitido"})
            return None
        ok, origin = self.allowed_origin()
        if not ok:
            self.send_json(403, {"error": "Origen no permitido"})
            return None
        return origin or ""

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 4096:
            raise ValueError("Petición demasiado grande")
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            raise ValueError("JSON no válido")

    # ---- métodos ----
    def do_OPTIONS(self):
        origin = self.guard()
        if origin is None:
            return
        self.send_response(204)
        self.cors(origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        origin = self.guard()
        if origin is None:
            return
        path = urlparse(self.path).path
        if path in ("/", "/index.html", "/ClipForge-AI.html"):
            if not os.path.exists(APP_FILE):
                return self.send_json(404, {"error": "No se encuentra ClipForge-AI.html junto al ayudante"})
            with open(APP_FILE, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/health":
            return self.send_json(200, {"ok": True, "version": VERSION, "ytdlp": YTDLP_VERSION,
                                        "ffmpeg": bool(FFMPEG), "deno": bool(shutil.which("deno"))}, origin)
        m = re.match(r"^/api/task/([a-f0-9]{32})(/file)?$", path)
        if m:
            t = TASKS.get(m.group(1))
            if not t:
                return self.send_json(404, {"error": "Tarea no encontrada"}, origin)
            if not m.group(2):
                return self.send_json(200, {k: t.get(k) for k in ("state", "progress", "message", "error", "code", "title")}, origin)
            if t.get("state") != "done":
                return self.send_json(409, {"error": "La descarga no ha terminado"}, origin)
            size = os.path.getsize(t["file"])
            name = re.sub(r"[^\w\- .]", "_", t.get("title") or "youtube")[:80] + ".mp4"
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(size))
            self.send_header("X-Filename", name.encode("ascii", "replace").decode())
            self.cors(origin)
            self.end_headers()
            with open(t["file"], "rb") as f:
                shutil.copyfileobj(f, self.wfile, 1024 * 1024)
            return
        self.send_json(404, {"error": "No encontrado"}, origin)

    def do_POST(self):
        origin = self.guard()
        if origin is None:
            return
        path = urlparse(self.path).path
        try:
            data = self.read_json()
        except ValueError as e:
            return self.send_json(400, {"error": str(e)}, origin)
        if yt_dlp is None:
            return self.send_json(500, {"error": "yt-dlp no está instalado. Ejecuta 'Actualizar ClipForge.bat'.", "code": "unknown"}, origin)
        url = parse_youtube(data.get("url"))
        if not url:
            return self.send_json(400, {"error": "Solo se aceptan enlaces de vídeos de YouTube.", "code": "invalid"}, origin)
        if path == "/api/youtube/info":
            try:
                with yt_dlp.YoutubeDL({**base_opts(), "skip_download": True}) as ydl:
                    info = ydl.extract_info(url, download=False)
            except Exception as e:  # noqa: BLE001
                msg = re.sub(r"\x1b\[[0-9;]*m", "", str(e))
                return self.send_json(422, {"error": msg[:600], "code": classify(msg)}, origin)
            avail = info.get("availability")
            if avail in ("private", "needs_auth", "subscriber_only", "premium_only"):
                code = {"private": "private", "needs_auth": "age", "subscriber_only": "members", "premium_only": "members"}[avail]
                return self.send_json(422, {"error": f"Disponibilidad: {avail}", "code": code}, origin)
            if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
                return self.send_json(422, {"error": "Emisión en directo", "code": "live"}, origin)
            return self.send_json(200, {"id": info.get("id"), "title": info.get("title"), "author": info.get("uploader") or info.get("channel"),
                                        "duration": info.get("duration"), "thumb": info.get("thumbnail")}, origin)
        if path == "/api/youtube/download":
            with LOCK:
                if sum(1 for t in TASKS.values() if t.get("state") == "running") >= 1:
                    return self.send_json(429, {"error": "Ya hay una descarga en curso.", "code": "unknown"}, origin)
                tid = uuid.uuid4().hex
                TASKS[tid] = {"state": "running", "progress": 0, "message": "Iniciando descarga…", "created": time.time()}
            threading.Thread(target=run_download, args=(tid, url), daemon=True).start()
            return self.send_json(200, {"task": tid}, origin)
        self.send_json(404, {"error": "No encontrado"}, origin)

    def do_DELETE(self):
        origin = self.guard()
        if origin is None:
            return
        m = re.match(r"^/api/task/([a-f0-9]{32})$", urlparse(self.path).path)
        if m:
            cleanup_task(m.group(1))
            return self.send_json(200, {"ok": True}, origin)
        self.send_json(404, {"error": "No encontrado"}, origin)


def main():
    ap = argparse.ArgumentParser(description="Ayudante local de ClipForge AI")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--open-browser", action="store_true")
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    threading.Thread(target=janitor, daemon=True).start()
    url = f"http://127.0.0.1:{a.port}/"
    print("\n  ClipForge AI · ayudante local " + VERSION)
    print(f"  Aplicación:  {url}")
    print(f"  yt-dlp: {YTDLP_VERSION or 'NO INSTALADO'} · FFmpeg: {'sí' if FFMPEG else 'no'} · deno: {'sí' if shutil.which('deno') else 'no'}")
    print("  Deja esta ventana abierta mientras uses ClipForge. Ciérrala para detenerlo.\n")
    if a.open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for tid in list(TASKS):
            cleanup_task(tid)


if __name__ == "__main__":
    main()
