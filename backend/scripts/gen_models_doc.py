"""Regenerate docs/MODELS.md from the live model registry: python scripts/gen_models_doc.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.providers.catalog import MODELS, TASK_LABELS

COMM = {"yes": "Sí", "no": "No", "depends": "Revisar"}
UNIT = {"image": "/imagen", "second": "/s", "megapixel": "/MP", "run": "/uso", "video": "/vídeo", "1k_chars": "/1k car."}


def price(r):
    if not r.price:
        return "—"
    if r.price.usd is None:
        return "ver proveedor"
    return "gratis (local)" if r.price.usd == 0 else f"≈{r.price.usd:g} ${UNIT.get(r.price.unit, '')}"


lines = ["# Modelos integrados", "", "_Generado automáticamente desde `backend/app/providers/catalog.py`. Precios aproximados (no verificados en vivo): compruébalos en la web de cada proveedor._", ""]
for cat, title in (("image", "Imagen"), ("edit", "Edición"), ("video", "Vídeo"), ("audio", "Audio"), ("utility", "Motores locales y utilidades")):
    lines += [f"## {title}", "", "| Modelo | Operaciones | Proveedores (endpoint · precio) | Licencia | Comercial | Pesos abiertos |", "|---|---|---|---|---|---|"]
    for m in MODELS:
        if m.category != cat or m.id.startswith("test-"):
            continue
        tasks = ", ".join(TASK_LABELS.get(t, t) for t in m.tasks)
        routes = "<br>".join(f"**{r.provider}** `{next(iter(r.endpoints.values()))}` · {price(r)}" for r in m.routes)
        lines.append(f"| **{m.name}** (`{m.id}`) | {tasks} | {routes} | {m.license} | {COMM[m.commercial_use]} | {'Sí' if m.open_weights else 'No'} |")
    lines.append("")
Path(__file__).resolve().parents[2].joinpath("docs/MODELS.md").write_text("\n".join(lines), encoding="utf-8")
print("docs/MODELS.md written")
