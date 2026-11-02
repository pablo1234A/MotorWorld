from __future__ import annotations

import re
from typing import Any

ASPECT_TO_WH: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "16:9": (1344, 768),
    "9:16": (768, 1344),
    "4:3": (1152, 864),
    "3:4": (864, 1152),
    "3:2": (1216, 832),
    "2:3": (832, 1216),
    "21:9": (1536, 640),
    "9:21": (640, 1536),
    "4:5": (896, 1120),
    "5:4": (1120, 896),
}


def wh_for(params: dict[str, Any], default: str = "1:1") -> tuple[int, int]:
    if params.get("width") and params.get("height"):
        return int(params["width"]), int(params["height"])
    return ASPECT_TO_WH.get(str(params.get("aspect_ratio") or default), ASPECT_TO_WH[default])


def round32(v: int) -> int:
    return max(256, int(round(v / 32)) * 32)


def compact(d: dict[str, Any]) -> dict[str, Any]:
    """Drop None values so providers apply their own defaults."""
    return {k: v for k, v in d.items() if v is not None and v != ""}


def num(params: dict[str, Any], key: str, cast=float):
    v = params.get(key)
    if v is None or v == "":
        return None
    try:
        return cast(v)
    except (TypeError, ValueError):
        return None


_PCT = re.compile(r"(\d{1,3})%\|")
_STEP = re.compile(r"(\d+)/(\d+) \[")


def progress_from_logs(logs: str | None) -> float | None:
    """Extract real progress from tqdm-style logs emitted by the provider."""
    if not logs:
        return None
    tail = logs[-2000:]
    m = list(_STEP.finditer(tail))
    if m:
        a, b = int(m[-1].group(1)), int(m[-1].group(2))
        if b > 0:
            return max(0.0, min(1.0, a / b))
    p = list(_PCT.finditer(tail))
    if p:
        return max(0.0, min(1.0, int(p[-1].group(1)) / 100))
    return None


def collect_urls(obj: Any) -> list[str]:
    """Walk a provider response and collect output URLs in order."""
    out: list[str] = []

    def walk(o: Any):
        if isinstance(o, str):
            if o.startswith("http://") or o.startswith("https://") or o.startswith("data:"):
                out.append(o)
        elif isinstance(o, list):
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            if isinstance(o.get("url"), str):
                out.append(o["url"])
                return
            for k in ("images", "image", "video", "videos", "audio", "audio_file", "audio_url", "output", "sample", "file"):
                if k in o:
                    walk(o[k])

    walk(obj)
    seen: set[str] = set()
    uniq = []
    for u in out:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    return uniq
