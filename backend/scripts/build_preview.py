"""Build docs/preview/motorworld-studio.html (single-file UI preview with the real model catalog).

    python scripts/build_preview.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.providers.catalog import MODELS, TASK_LABELS  # noqa: E402
from app.providers.registry import ADAPTERS  # noqa: E402
from app.services.llm import llm_status  # noqa: E402
from app.services.prompting import options_payload  # noqa: E402
from app.services.stock import STOCK_PROVIDERS  # noqa: E402

KEYS = ("id", "name", "kind", "key_env", "free_tier", "commercial_note", "signup_url", "docs_url")
models = []
for m in MODELS:
    if "internal" in m.tags:
        continue
    d = m.to_public()
    models.append({k: d[k] for k in ("id", "name", "family", "category", "tasks", "task_labels", "description", "license", "license_url",
                                     "commercial_use", "open_weights", "limitations", "quality_tier", "resolutions", "durations",
                                     "aspect_ratios", "local_only", "tags", "supports_negative_prompt")}
                  | {"routes": [{"provider": r["provider"], "price": r["price"]} for r in d["routes"]],
                     "params": [{k: p[k] for k in ("name", "label", "type", "options", "advanced")} for p in d["params"]]})
providers = [{k: getattr(c, k) for k in KEYS} for c in ADAPTERS.values()]
providers += [{k: x[k] for k in KEYS} for x in llm_status({})]
providers += [{k: x[k] for k in KEYS} for x in (s.status({}) for s in STOCK_PROVIDERS.values())]
data = json.dumps({"models": models, "providers": providers, "tasks": TASK_LABELS, "options": options_payload()}, ensure_ascii=False)
data = data.replace("</", "<\\/")
tpl = (ROOT / "docs/preview/template.html").read_text(encoding="utf-8")
out = ROOT / "docs/preview/motorworld-studio.html"
out.write_text(tpl.replace("/*__CATALOG__*/", data), encoding="utf-8")
print(f"{out.relative_to(ROOT)} · {len(models)} modelos · {len(providers)} proveedores · {out.stat().st_size // 1024} KB")
