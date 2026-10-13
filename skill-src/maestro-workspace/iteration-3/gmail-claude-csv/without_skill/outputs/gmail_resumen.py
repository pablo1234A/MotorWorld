#!/usr/bin/env python3
"""
gmail_resumen.py - Lee los correos NO LEIDOS de Gmail por IMAP, los clasifica con
Claude (urgente, cliente, factura, spam, otro) y guarda un resumen en un CSV.

Pensado para ejecutarse cada manana (cron / Programador de tareas).
No marca los correos como leidos (usa BODY.PEEK).

Configuracion via variables de entorno o fichero .env junto al script:
    GMAIL_USER           tu direccion de Gmail
    GMAIL_APP_PASSWORD   contrasena de aplicacion de Google (16 caracteres)
    ANTHROPIC_API_KEY    clave de la API de Anthropic
    CLAUDE_MODEL         (opcional) por defecto claude-haiku-4-5
    OUTPUT_DIR           (opcional) carpeta de los CSV, por defecto ./resumenes
    MAX_EMAILS           (opcional) maximo de correos por ejecucion, por defecto 100
    SINCE_DAYS           (opcional) solo no leidos de los ultimos N dias (0 = todos), por defecto 0
    BODY_CHARS           (opcional) caracteres del cuerpo enviados a Claude, por defecto 3000
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import email
import imaplib
import logging
import os
import re
import sys
import time
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parseaddr, parsedate_to_datetime
from html import unescape
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # python-dotenv es opcional
    load_dotenv = None

import anthropic

CATEGORIAS = ["urgente", "cliente", "factura", "spam", "otro"]
IMAP_HOST = "imap.gmail.com"
SCRIPT_DIR = Path(__file__).resolve().parent

log = logging.getLogger("gmail_resumen")


# --------------------------------------------------------------------------- #
# Configuracion
# --------------------------------------------------------------------------- #
def cargar_config() -> dict:
    if load_dotenv:
        load_dotenv(SCRIPT_DIR / ".env")

    faltan = [v for v in ("GMAIL_USER", "GMAIL_APP_PASSWORD", "ANTHROPIC_API_KEY")
              if not os.getenv(v)]
    if faltan:
        sys.exit(f"Faltan variables de entorno: {', '.join(faltan)}. "
                 f"Copia .env.example a .env y rellenalo.")

    out = Path(os.getenv("OUTPUT_DIR", "resumenes"))
    if not out.is_absolute():
        out = SCRIPT_DIR / out

    return {
        "user": os.environ["GMAIL_USER"],
        "password": os.environ["GMAIL_APP_PASSWORD"].replace(" ", ""),
        "model": os.getenv("CLAUDE_MODEL", "claude-haiku-4-5"),
        "output_dir": out,
        "max_emails": int(os.getenv("MAX_EMAILS", "100")),
        "since_days": int(os.getenv("SINCE_DAYS", "0")),
        "body_chars": int(os.getenv("BODY_CHARS", "3000")),
    }


# --------------------------------------------------------------------------- #
# IMAP
# --------------------------------------------------------------------------- #
def decodificar(valor: str | None) -> str:
    if not valor:
        return ""
    try:
        return str(make_header(decode_header(valor)))
    except Exception:
        return valor


def html_a_texto(html: str) -> str:
    html = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
    html = re.sub(r"(?i)<br\s*/?>|</p>|</div>", "\n", html)
    texto = unescape(re.sub(r"<[^>]+>", " ", html))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", texto)).strip()


def extraer_cuerpo(msg: Message) -> str:
    texto, html = None, None
    partes = msg.walk() if msg.is_multipart() else [msg]
    for parte in partes:
        if parte.get_content_maintype() == "multipart":
            continue
        if "attachment" in str(parte.get("Content-Disposition", "")).lower():
            continue
        tipo = parte.get_content_type()
        if tipo not in ("text/plain", "text/html"):
            continue
        try:
            payload = parte.get_payload(decode=True) or b""
            contenido = payload.decode(parte.get_content_charset() or "utf-8", errors="replace")
        except Exception:
            continue
        if tipo == "text/plain" and texto is None:
            texto = contenido
        elif tipo == "text/html" and html is None:
            html = contenido
    if texto and texto.strip():
        return texto.strip()
    return html_a_texto(html) if html else ""


def tiene_adjuntos(msg: Message) -> bool:
    return any(
        "attachment" in str(p.get("Content-Disposition", "")).lower()
        for p in msg.walk()
    )


def leer_no_leidos(cfg: dict) -> list[dict]:
    log.info("Conectando a %s como %s", IMAP_HOST, cfg["user"])
    imap = imaplib.IMAP4_SSL(IMAP_HOST)
    try:
        imap.login(cfg["user"], cfg["password"])
        imap.select("INBOX", readonly=True)  # readonly: nunca cambia flags

        criterio = ["UNSEEN"]
        if cfg["since_days"] > 0:
            desde = (dt.date.today() - dt.timedelta(days=cfg["since_days"])).strftime("%d-%b-%Y")
            criterio += ["SINCE", desde]
        estado, datos = imap.search(None, *criterio)
        if estado != "OK":
            raise RuntimeError(f"Busqueda IMAP fallida: {estado}")

        ids = datos[0].split()
        log.info("Encontrados %d correos no leidos", len(ids))
        ids = ids[-cfg["max_emails"]:]  # los mas recientes

        correos = []
        for num in reversed(ids):
            estado, partes = imap.fetch(num, "(BODY.PEEK[] X-GM-MSGID)")
            if estado != "OK" or not partes or not isinstance(partes[0], tuple):
                log.warning("No se pudo descargar el mensaje %s", num)
                continue
            cabecera, crudo = partes[0]
            msg = email.message_from_bytes(crudo)
            m = re.search(rb"X-GM-MSGID (\d+)", cabecera)
            gm_id = m.group(1).decode() if m else ""

            nombre, direccion = parseaddr(decodificar(msg.get("From")))
            try:
                fecha = parsedate_to_datetime(msg.get("Date")).isoformat(timespec="minutes")
            except Exception:
                fecha = msg.get("Date", "")

            correos.append({
                "fecha": fecha,
                "remitente_nombre": nombre,
                "remitente_email": direccion,
                "asunto": decodificar(msg.get("Subject")) or "(sin asunto)",
                "cuerpo": extraer_cuerpo(msg),
                "adjuntos": "si" if tiene_adjuntos(msg) else "no",
                "enlace": (f"https://mail.google.com/mail/u/0/#all/{int(gm_id):x}"
                           if gm_id else ""),
            })
        return correos
    finally:
        try:
            imap.logout()
        except Exception:
            pass


# --------------------------------------------------------------------------- #
# Claude
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT = """Eres un asistente que clasifica correos electronicos de una bandeja de entrada profesional.
Categorias (elige exactamente una):
- urgente: requiere accion o respuesta hoy (plazos inminentes, incidencias, avisos de seguridad reales, peticiones del jefe con fecha).
- cliente: comunicaciones de clientes o potenciales clientes (consultas, pedidos, presupuestos, quejas) que no son urgentes.
- factura: facturas, recibos, cobros, pagos, extractos, avisos de domiciliacion.
- spam: publicidad no solicitada, newsletters masivas, phishing, estafas.
- otro: todo lo demas (notificaciones, personal, interno no urgente...).
Si un correo es de un cliente Y urgente, elige "urgente". Si es phishing que finge ser una factura, elige "spam".
Escribe el resumen en espanol, en una o dos frases, indicando la accion necesaria si la hay."""

HERRAMIENTA = {
    "name": "clasificar_correo",
    "description": "Registra la clasificacion y el resumen de un correo.",
    "input_schema": {
        "type": "object",
        "properties": {
            "categoria": {"type": "string", "enum": CATEGORIAS},
            "resumen": {"type": "string", "description": "Resumen en espanol, max. 2 frases."},
            "accion_requerida": {"type": "boolean",
                                 "description": "true si el usuario debe hacer algo."},
            "confianza": {"type": "number", "minimum": 0, "maximum": 1},
        },
        "required": ["categoria", "resumen", "accion_requerida", "confianza"],
    },
}


def clasificar(cliente: anthropic.Anthropic, cfg: dict, correo: dict) -> dict:
    contenido = (
        f"De: {correo['remitente_nombre']} <{correo['remitente_email']}>\n"
        f"Fecha: {correo['fecha']}\n"
        f"Asunto: {correo['asunto']}\n"
        f"Adjuntos: {correo['adjuntos']}\n\n"
        f"Cuerpo:\n{correo['cuerpo'][:cfg['body_chars']] or '(vacio)'}"
    )
    for intento in range(3):
        try:
            resp = cliente.messages.create(
                model=cfg["model"],
                max_tokens=400,
                system=SYSTEM_PROMPT,
                tools=[HERRAMIENTA],
                tool_choice={"type": "tool", "name": "clasificar_correo"},
                messages=[{"role": "user", "content": contenido}],
            )
            for bloque in resp.content:
                if bloque.type == "tool_use":
                    datos = dict(bloque.input)
                    if datos.get("categoria") not in CATEGORIAS:
                        datos["categoria"] = "otro"
                    return datos
            raise ValueError("Claude no devolvio la herramienta esperada")
        except (anthropic.RateLimitError, anthropic.APIConnectionError,
                anthropic.InternalServerError) as e:
            espera = 2 ** (intento + 1)
            log.warning("Error temporal de la API (%s); reintento en %ds", e.__class__.__name__, espera)
            time.sleep(espera)
        except Exception as e:
            log.error("Error clasificando '%s': %s", correo["asunto"], e)
            break
    return {"categoria": "otro", "resumen": "(no se pudo clasificar)",
            "accion_requerida": False, "confianza": 0}


# --------------------------------------------------------------------------- #
# CSV
# --------------------------------------------------------------------------- #
COLUMNAS = ["fecha", "categoria", "remitente_nombre", "remitente_email", "asunto",
            "resumen", "accion_requerida", "confianza", "adjuntos", "enlace"]
ORDEN = {c: i for i, c in enumerate(CATEGORIAS)}


def guardar_csv(filas: list[dict], destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    filas = sorted(filas, key=lambda f: (ORDEN.get(f["categoria"], 99), f["fecha"]))
    # utf-8-sig + ';' para que Excel en espanol lo abra bien con doble clic
    with destino.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNAS, delimiter=";", extrasaction="ignore")
        w.writeheader()
        for f in filas:
            w.writerow({**f, "accion_requerida": "si" if f["accion_requerida"] else "no",
                        "confianza": f"{float(f['confianza']):.2f}"})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("-o", "--output", help="Ruta del CSV (por defecto OUTPUT_DIR/resumen_AAAA-MM-DD.csv)")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    cfg = cargar_config()
    destino = Path(args.output) if args.output else \
        cfg["output_dir"] / f"resumen_{dt.date.today():%Y-%m-%d}.csv"

    try:
        correos = leer_no_leidos(cfg)
    except imaplib.IMAP4.error as e:
        log.error("Fallo de IMAP/login: %s. Revisa GMAIL_USER, la contrasena de "
                  "aplicacion y que IMAP este activado en Gmail.", e)
        return 1

    cliente = anthropic.Anthropic()
    filas = []
    for i, c in enumerate(correos, 1):
        log.info("[%d/%d] %s", i, len(correos), c["asunto"][:70])
        filas.append({**c, **clasificar(cliente, cfg, c)})

    guardar_csv(filas, destino)
    conteo = {cat: sum(f["categoria"] == cat for f in filas) for cat in CATEGORIAS}
    log.info("CSV guardado en %s | %s", destino,
             ", ".join(f"{k}: {v}" for k, v in conteo.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
