"""
Automatización de leads: webhook de formulario → clasificación con Claude → aviso a Telegram.
Incluye idempotencia, reintentos, timeouts, salida JSON y filtro previo sin IA (ahorra tokens).

Instalar:  pip install fastapi uvicorn anthropic httpx
Variables: ANTHROPIC_API_KEY, CLAUDE_MODEL (usa el modelo pequeño/rápido más reciente, p. ej. la familia Haiku),
           TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
Ejecutar:  uvicorn automatizacion_leads:app --port 8000
"""
import json, os, re, sqlite3, time
import anthropic, httpx
from fastapi import FastAPI, Request

app = FastAPI()
claude = anthropic.Anthropic(max_retries=3, timeout=30)
db = sqlite3.connect("leads.db", check_same_thread=False)
db.execute("CREATE TABLE IF NOT EXISTS vistos (id TEXT PRIMARY KEY, ts REAL)")

SISTEMA = """Clasifica leads de un estudio de arquitectura. Responde SOLO JSON:
{"prioridad":"alta|media|baja","tipo":"obra_nueva|reforma|otro","resumen":"<máx 20 palabras>"}
Alta = presupuesto > 100.000 € o plazo < 3 meses."""

SPAM = re.compile(r"(casino|crypto|seo services|viagra)", re.I)

def ya_procesado(lead_id: str) -> bool:
    try:
        db.execute("INSERT INTO vistos VALUES (?, ?)", (lead_id, time.time())); db.commit(); return False
    except sqlite3.IntegrityError:
        return True

def clasificar(texto: str) -> dict:
    r = claude.messages.create(
        model=os.environ["CLAUDE_MODEL"], max_tokens=150,
        system=[{"type": "text", "text": SISTEMA, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": texto[:2000]}],
    )
    try:
        return json.loads(r.content[0].text)
    except (json.JSONDecodeError, IndexError):
        return {"prioridad": "media", "tipo": "otro", "resumen": texto[:80]}

def avisar(msg: str) -> None:
    url = f"https://api.telegram.org/bot{os.environ['TELEGRAM_TOKEN']}/sendMessage"
    for intento in range(3):
        try:
            httpx.post(url, json={"chat_id": os.environ["TELEGRAM_CHAT_ID"], "text": msg}, timeout=10).raise_for_status()
            return
        except httpx.HTTPError:
            time.sleep(2 ** intento)

@app.post("/lead")
async def lead(req: Request):
    d = await req.json()
    lead_id = str(d.get("id") or d.get("email", "")).strip().lower()
    if not lead_id or ya_procesado(lead_id):
        return {"ok": True, "duplicado": True}
    texto = f"Nombre: {d.get('nombre')}\nMensaje: {d.get('mensaje', '')}\nPresupuesto: {d.get('presupuesto', '?')}"
    if SPAM.search(texto):                       # filtro barato antes de gastar tokens
        return {"ok": True, "spam": True}
    c = clasificar(texto)
    if c.get("prioridad") != "baja":
        avisar(f"🔔 Lead {c['prioridad'].upper()} · {c['tipo']}\n{d.get('nombre')} <{d.get('email')}>\n{c['resumen']}")
    return {"ok": True, **c}
