from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .db import create_all, get_engine
from .logging_setup import setup_logging
from .redis_client import close_redis
from .routers import assets, auth, catalog, edits, films, generations, projects, stock, system, timelines
from .routers.system import LATENCY, REQUESTS
from .services.queue import close_pool
from .storage import S3Storage, get_storage

log = logging.getLogger("motorworld")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    s = get_settings()
    for problem in s.validate_production():
        log.error("CONFIGURACIÓN INSEGURA: %s", problem)
    if s.validate_production():
        raise RuntimeError("Configuración de producción insegura; revisa los logs")
    s.tmp_dir.mkdir(parents=True, exist_ok=True)
    get_engine()
    if s.database_url.startswith("sqlite"):
        await create_all()  # dev convenience; Postgres uses Alembic migrations
    st = get_storage()
    if isinstance(st, S3Storage):
        try:
            await st.ensure_bucket()
        except Exception:  # noqa: BLE001
            log.exception("No se pudo verificar el bucket S3")
    log.info("%s API lista (entorno=%s, cola=%s, almacenamiento=%s)", s.app_name, s.environment, s.queue_mode, s.storage_backend)
    yield
    await close_pool()
    await close_redis()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title=f"{s.app_name} API",
        version="1.0.0",
        description="API del estudio audiovisual: generación de imagen, vídeo y audio, editores, estudio de películas y montaje.",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["*"],
    )
    allowed_origins = {urlparse(o).netloc for o in s.cors_origins} | {urlparse(s.public_web_url).netloc}

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = rid
        # CSRF defence in depth (cookies are SameSite=Lax): reject cross-site unsafe requests.
        if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and urlparse(origin).netloc not in allowed_origins and urlparse(origin).netloc != request.url.netloc:
                return JSONResponse({"detail": {"code": "bad_origin", "message": "Origen no permitido"}}, status_code=403)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001
            log.exception("unhandled error rid=%s path=%s", rid, request.url.path)
            response = JSONResponse({"detail": {"code": "internal", "message": "Error interno del servidor", "request_id": rid}}, status_code=500)
        dur = time.perf_counter() - start
        route = request.scope.get("route")
        rpath = getattr(route, "path", "unmatched")
        REQUESTS.labels(request.method, rpath, str(response.status_code)).inc()
        LATENCY.labels(rpath).observe(dur)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        errs = exc.errors()
        first = errs[0] if errs else {}
        field = ".".join(str(x) for x in first.get("loc", [])[1:])
        msg = str(first.get("msg", "Datos no válidos")).replace("Value error, ", "")
        return JSONResponse({"detail": {"code": "validation", "message": f"{field}: {msg}" if field else msg, "errors": jsonable(errs)}},
                            status_code=422)

    for r in (auth.router, auth.me_router, assets.router, generations.router, catalog.router, projects.router, films.router,
              timelines.router, edits.router, stock.router, system.router):
        app.include_router(r)
    return app


def jsonable(errs):
    out = []
    for e in errs:
        out.append({k: (str(v) if k == "ctx" else v) for k, v in e.items() if k in ("loc", "msg", "type")})
    return out


app = create_app()
