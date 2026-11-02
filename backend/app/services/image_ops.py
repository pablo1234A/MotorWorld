"""Deterministic local image processing (Pillow). No generative AI involved."""
from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

from ..storage import tmp_path

SUPPORTED_OPS = {
    "crop": "Recortar (x, y, width, height en píxeles)",
    "rotate": "Rotar (degrees)",
    "flip": "Voltear (direction: horizontal|vertical)",
    "resize": "Redimensionar (width/height, mantiene proporción si falta uno)",
    "adjust": "Ajustes: brightness, contrast, saturation, sharpness (1.0 = sin cambio), warmth (-1..1)",
    "blur": "Desenfoque gaussiano (radius)",
    "sharpen": "Enfoque (amount)",
    "vignette": "Viñeta (strength 0..1)",
    "grayscale": "Blanco y negro",
    "sepia": "Sepia",
    "autocontrast": "Contraste automático",
    "denoise": "Reducción de ruido (mediana)",
    "extend_canvas": "Ampliar lienzo (top, bottom, left, right, fill)",
    "convert": "Convertir formato (format: png|jpg|webp)",
}


def _open(path: Path) -> Image.Image:
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    return im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")


def _warmth(im: Image.Image, w: float) -> Image.Image:
    if abs(w) < 1e-3:
        return im
    has_alpha = im.mode == "RGBA"
    rgb = im.convert("RGB")
    r, g, b = rgb.split()
    k = max(-1.0, min(1.0, w)) * 0.18
    r = r.point(lambda v: max(0, min(255, int(v * (1 + k)))))
    b = b.point(lambda v: max(0, min(255, int(v * (1 - k)))))
    out = Image.merge("RGB", (r, g, b))
    if has_alpha:
        out.putalpha(im.getchannel("A"))
    return out


def _vignette(im: Image.Image, strength: float) -> Image.Image:
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    inset = int(min(w, h) * 0.08)
    d.ellipse((-inset, -inset, w + inset, h + inset), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) * 0.18))
    dark = ImageEnhance.Brightness(im).enhance(max(0.0, 1 - strength))
    return Image.composite(im, dark, mask)


def apply_ops(src: Path, ops: list[dict[str, Any]]) -> tuple[Path, str]:
    im = _open(src)
    fmt = "png"
    for op in ops:
        name = op.get("op")
        if name == "crop":
            x, y = int(op.get("x", 0)), int(op.get("y", 0))
            w, h = int(op.get("width", im.width - x)), int(op.get("height", im.height - y))
            im = im.crop((max(0, x), max(0, y), min(im.width, x + w), min(im.height, y + h)))
        elif name == "rotate":
            im = im.rotate(-float(op.get("degrees", 90)), expand=True, resample=Image.Resampling.BICUBIC)
        elif name == "flip":
            im = ImageOps.mirror(im) if op.get("direction", "horizontal") == "horizontal" else ImageOps.flip(im)
        elif name == "resize":
            w, h = op.get("width"), op.get("height")
            if w and not h:
                h = round(im.height * int(w) / im.width)
            if h and not w:
                w = round(im.width * int(h) / im.height)
            im = im.resize((int(w), int(h)), Image.Resampling.LANCZOS)
        elif name == "adjust":
            for key, enh in (("brightness", ImageEnhance.Brightness), ("contrast", ImageEnhance.Contrast),
                             ("saturation", ImageEnhance.Color), ("sharpness", ImageEnhance.Sharpness)):
                if op.get(key) is not None and float(op[key]) != 1.0:
                    im = enh(im).enhance(float(op[key]))
            im = _warmth(im, float(op.get("warmth") or 0))
        elif name == "blur":
            im = im.filter(ImageFilter.GaussianBlur(float(op.get("radius", 2))))
        elif name == "sharpen":
            im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=int(float(op.get("amount", 1.0)) * 120), threshold=2))
        elif name == "vignette":
            im = _vignette(im, float(op.get("strength", 0.35)))
        elif name == "grayscale":
            im = ImageOps.grayscale(im).convert("RGB")
        elif name == "sepia":
            g = ImageOps.grayscale(im)
            im = ImageOps.colorize(g, "#2b1d0e", "#f3e3c3")
        elif name == "autocontrast":
            im = ImageOps.autocontrast(im.convert("RGB"), cutoff=1)
        elif name == "denoise":
            im = im.filter(ImageFilter.MedianFilter(3))
        elif name == "extend_canvas":
            im, _ = extend_canvas(im, int(op.get("top", 0)), int(op.get("bottom", 0)), int(op.get("left", 0)),
                                  int(op.get("right", 0)), op.get("fill", "edge"))
        elif name == "convert":
            fmt = str(op.get("format", "png")).lower().replace("jpeg", "jpg")
        else:
            raise ValueError(f"Operación de imagen desconocida: {name}")
    return save(im, fmt), fmt


def save(im: Image.Image, fmt: str = "png") -> Path:
    fmt = fmt if fmt in ("png", "jpg", "webp") else "png"
    dest = tmp_path("." + fmt)
    if fmt == "jpg":
        im.convert("RGB").save(dest, "JPEG", quality=95, subsampling=0)
    elif fmt == "webp":
        im.save(dest, "WEBP", quality=95)
    else:
        im.save(dest, "PNG", optimize=True)
    return dest


def extend_canvas(im: Image.Image, top: int, bottom: int, left: int, right: int, fill: str = "edge") -> tuple[Image.Image, Image.Image]:
    """Return the enlarged canvas and a mask (white = new area to generate)."""
    w, h = im.size
    nw, nh = w + left + right, h + top + bottom
    base = im.convert("RGB")
    if fill == "edge":
        canvas = base.resize((nw, nh), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(24))
    else:
        canvas = Image.new("RGB", (nw, nh), fill if isinstance(fill, str) and fill.startswith("#") else "#808080")
    canvas.paste(base, (left, top))
    mask = Image.new("L", (nw, nh), 255)
    # small overlap so the generator blends the seam
    ov = 8
    mask.paste(0, (left + (ov if left else 0), top + (ov if top else 0),
                   left + w - (ov if right else 0), top + h - (ov if bottom else 0)))
    return canvas, mask


def prepare_outpaint(src: Path, top: int, bottom: int, left: int, right: int) -> tuple[Path, Path]:
    canvas, mask = extend_canvas(_open(src), top, bottom, left, right, "edge")
    return save(canvas, "png"), save(mask.convert("RGB"), "png")


def normalise_mask(mask_path: Path, size: tuple[int, int]) -> Path:
    """Convert any user-drawn mask (alpha or luminance) to a binary B/W PNG of the image size."""
    m = Image.open(mask_path)
    if m.mode in ("RGBA", "LA"):
        alpha = m.getchannel("A")
        lum = m.convert("L")
        m = ImageChops.multiply(alpha, lum) if lum.getextrema()[1] > 0 else alpha
    else:
        m = m.convert("L")
    m = m.resize(size, Image.Resampling.NEAREST).point(lambda v: 255 if v > 127 else 0)
    return save(m.convert("RGB"), "png")


def upscale_lanczos(src: Path, scale: int) -> Path:
    im = _open(src)
    scale = max(1, min(4, int(scale)))
    out = im.resize((im.width * scale, im.height * scale), Image.Resampling.LANCZOS)
    return save(out, "png")


def rembg_available() -> bool:
    return importlib.util.find_spec("rembg") is not None


def remove_background_local(src: Path) -> Path:
    if not rembg_available():
        raise RuntimeError("rembg no está instalado en el worker (pip install rembg onnxruntime)")
    from rembg import remove  # type: ignore

    with Image.open(src) as im:
        out = remove(im.convert("RGBA"))
    return save(out, "png")
