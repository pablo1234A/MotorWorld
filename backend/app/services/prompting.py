"""Prompt composition: style presets and cinematographic controls.

Most video/image models have no dedicated parameters for lens, lighting or
camera movement — they are steered through the prompt. These controls are
therefore compiled into a structured English prompt (models follow English
best) and the UI states that adherence depends on the model.
"""
from __future__ import annotations

from typing import Any

IMAGE_STYLES: dict[str, dict[str, str]] = {
    "none": {"label": "Sin estilo", "suffix": "", "negative": ""},
    "cinematic": {"label": "Fotografía cinematográfica", "suffix": "cinematic film still, anamorphic lens, dramatic lighting, shallow depth of field, rich color grading, 35mm film grain", "negative": "flat lighting, amateur, oversaturated"},
    "advertising": {"label": "Fotografía publicitaria", "suffix": "high-end commercial advertising photography, studio lighting, crisp details, premium look, clean composition", "negative": "cluttered, low quality, watermark"},
    "architecture": {"label": "Arquitectura", "suffix": "architectural photography, tilt-shift corrected verticals, golden hour, ultra detailed materials, wide angle", "negative": "distorted lines, people blur"},
    "fashion": {"label": "Moda", "suffix": "editorial fashion photography, vogue style, softbox lighting, styled wardrobe, magazine cover quality", "negative": "bad anatomy, deformed hands"},
    "product": {"label": "Producto", "suffix": "professional product photography, seamless backdrop, softbox reflections, macro detail, commercial catalog quality", "negative": "dust, scratches, blurry"},
    "portrait": {"label": "Retrato", "suffix": "professional portrait photography, 85mm lens, natural skin texture, catchlights in eyes, bokeh background", "negative": "plastic skin, deformed eyes, extra fingers"},
    "landscape": {"label": "Paisaje", "suffix": "landscape photography, golden hour, dramatic sky, high dynamic range, wide angle, ultra sharp", "negative": "haze, low detail"},
    "digital_art": {"label": "Arte digital", "suffix": "digital painting, concept art, highly detailed, artstation trending, dramatic composition", "negative": "photo, low detail"},
    "illustration": {"label": "Ilustración", "suffix": "editorial illustration, clean linework, flat shading, harmonious palette", "negative": "photorealistic, noisy"},
    "anime": {"label": "Anime", "suffix": "anime key visual, cel shading, vibrant colors, detailed background, studio quality", "negative": "photorealistic, 3d render"},
    "3d": {"label": "3D", "suffix": "3D render, octane render, global illumination, physically based materials, subsurface scattering", "negative": "2d, sketch"},
    "hyperreal": {"label": "Realismo extremo", "suffix": "hyperrealistic photograph, shot on medium format camera, 8k detail, natural imperfections, true-to-life colors", "negative": "cgi, illustration, painting, plastic"},
}

COMPOSITIONS = {
    "rule_of_thirds": "rule of thirds composition",
    "centered": "centered symmetrical composition",
    "leading_lines": "leading lines composition",
    "negative_space": "minimalist composition with generous negative space",
    "close_up": "tight close-up framing",
    "wide": "wide establishing composition",
    "top_down": "top-down flat lay view",
    "low_angle": "low angle heroic view",
}

CAMERA_MOVES: dict[str, dict[str, str]] = {
    "static": {"label": "Cámara fija", "prompt": "static locked-off camera", "director": "[Static shot]"},
    "dolly_in": {"label": "Dolly in", "prompt": "slow dolly in towards the subject", "director": "[Push in]"},
    "dolly_out": {"label": "Dolly out", "prompt": "slow dolly out revealing the scene", "director": "[Pull out]"},
    "tracking": {"label": "Tracking shot", "prompt": "smooth tracking shot following the subject", "director": "[Tracking shot]"},
    "orbit": {"label": "Órbita", "prompt": "camera orbits 180 degrees around the subject", "director": "[Truck left,Pan right]"},
    "pan_left": {"label": "Paneo izquierda", "prompt": "camera pans left", "director": "[Pan left]"},
    "pan_right": {"label": "Paneo derecha", "prompt": "camera pans right", "director": "[Pan right]"},
    "tilt_up": {"label": "Tilt arriba", "prompt": "camera tilts up", "director": "[Tilt up]"},
    "tilt_down": {"label": "Tilt abajo", "prompt": "camera tilts down", "director": "[Tilt down]"},
    "zoom_in": {"label": "Zoom in", "prompt": "slow optical zoom in", "director": "[Zoom in]"},
    "zoom_out": {"label": "Zoom out", "prompt": "slow optical zoom out", "director": "[Zoom out]"},
    "crane_up": {"label": "Grúa ascendente", "prompt": "crane shot rising up and over the scene", "director": "[Pedestal up]"},
    "crane_down": {"label": "Grúa descendente", "prompt": "crane shot descending towards the subject", "director": "[Pedestal down]"},
    "handheld": {"label": "Cámara en mano", "prompt": "handheld camera with subtle natural shake", "director": "[Shake]"},
    "fpv": {"label": "Dron FPV", "prompt": "fast FPV drone flight swooping through the scene", "director": "[Tracking shot]"},
    "travelling": {"label": "Travelling cinematográfico", "prompt": "lateral cinematic travelling shot on rails", "director": "[Truck right]"},
}

SHOT_TYPES = {
    "extreme_wide": "extreme wide shot", "wide": "wide shot", "full": "full shot", "medium": "medium shot",
    "medium_close": "medium close-up", "close_up": "close-up", "extreme_close_up": "extreme close-up",
    "over_shoulder": "over-the-shoulder shot", "pov": "point-of-view shot", "aerial": "aerial shot",
}
LENSES = {"14mm": "14mm ultra wide lens", "24mm": "24mm wide lens", "35mm": "35mm lens", "50mm": "50mm lens",
          "85mm": "85mm portrait lens", "135mm": "135mm telephoto lens", "anamorphic": "anamorphic lens with oval bokeh and flares",
          "macro": "macro lens"}
DOF = {"shallow": "shallow depth of field, creamy bokeh", "medium": "moderate depth of field", "deep": "deep focus, everything sharp"}
LIGHTING = {"golden_hour": "golden hour sunlight", "blue_hour": "blue hour ambience", "night_neon": "neon-lit night, wet reflections",
            "high_key": "bright high-key lighting", "low_key": "moody low-key lighting with deep shadows",
            "rembrandt": "Rembrandt lighting", "backlit": "strong backlight with rim light", "overcast": "soft overcast daylight",
            "practical": "practical lights in frame", "volumetric": "volumetric light rays through haze"}
SPEED = {"slow_motion": "slow motion, 120fps look", "real_time": "real-time motion", "fast": "fast-paced energetic motion",
         "timelapse": "timelapse"}
MOODS = {"epic": "epic and grand", "tense": "tense and suspenseful", "romantic": "romantic and warm", "melancholic": "melancholic",
         "joyful": "joyful and bright", "mysterious": "mysterious", "luxury": "luxurious and elegant", "gritty": "gritty and raw"}
GRADES = {"teal_orange": "teal and orange color grade", "kodak_2383": "Kodak 2383 film print emulation",
          "bleach_bypass": "bleach bypass desaturated look", "noir": "black and white film noir", "pastel": "soft pastel grade",
          "neon": "saturated cyberpunk neon grade", "natural": "natural true-to-life colors", "vintage": "vintage 70s film look"}
AESTHETICS = {"blockbuster": "Hollywood blockbuster aesthetic", "indie": "indie arthouse aesthetic", "commercial": "glossy TV commercial aesthetic",
              "documentary": "documentary realism", "music_video": "stylized music video aesthetic", "car_commercial": "premium car commercial aesthetic",
              "sci_fi": "sci-fi aesthetic", "period": "period drama aesthetic"}

CINEMA_GROUPS = {
    "shot_type": ("Tipo de plano", SHOT_TYPES), "lens": ("Distancia focal", LENSES), "dof": ("Profundidad de campo", DOF),
    "lighting": ("Iluminación", LIGHTING), "speed": ("Velocidad", SPEED), "mood": ("Ambiente", MOODS),
    "color_grade": ("Color grading", GRADES), "aesthetic": ("Estética visual", AESTHETICS), "composition": ("Composición", COMPOSITIONS),
}

DIRECTOR_MODELS = {"hailuo-02"}  # models documented to understand bracketed camera commands


def compose_image_prompt(prompt: str, style: str | None, composition: str | None = None) -> tuple[str, str]:
    st = IMAGE_STYLES.get(style or "none", IMAGE_STYLES["none"])
    parts = [prompt.strip()]
    if composition and composition in COMPOSITIONS:
        parts.append(COMPOSITIONS[composition])
    if st["suffix"]:
        parts.append(st["suffix"])
    return ", ".join(p for p in parts if p), st["negative"]


def compose_video_prompt(prompt: str, cinema: dict[str, Any] | None, model_id: str) -> str:
    cinema = cinema or {}
    parts = [prompt.strip().rstrip(".") + "."]
    move = cinema.get("camera_movement")
    if move in CAMERA_MOVES:
        if model_id in DIRECTOR_MODELS:
            parts.insert(0, CAMERA_MOVES[move]["director"])
        parts.append("Camera: " + CAMERA_MOVES[move]["prompt"] + ".")
    details = []
    for key, (_, table) in CINEMA_GROUPS.items():
        v = cinema.get(key)
        if v and v in table:
            details.append(table[v])
    if details:
        parts.append("Cinematography: " + ", ".join(details) + ".")
    return " ".join(parts)


def options_payload() -> dict[str, Any]:
    return {
        "image_styles": [{"id": k, "label": v["label"]} for k, v in IMAGE_STYLES.items()],
        "compositions": [{"id": k, "label": k.replace("_", " ")} for k in COMPOSITIONS],
        "camera_movements": [{"id": k, "label": v["label"]} for k, v in CAMERA_MOVES.items()],
        "cinema": {k: {"label": label, "options": list(table.keys())} for k, (label, table) in CINEMA_GROUPS.items()},
        "director_models": sorted(DIRECTOR_MODELS),
    }


# Keywords (accent-stripped, lowercase) mapping natural language to FFmpeg color presets.
COLOR_PRESETS_HINT: dict[str, tuple[str, ...]] = {
    "day_for_night": ("noche americana", "day for night"),
    "noir": ("noir", "blanco y negro", "black and white"),
    "teal_orange": ("teal", "naranja y azul", "orange and teal"),
    "warm": ("calido", "calidez", "warm"),
    "cool": ("tonos frios", "frio", "cool tones"),
    "vintage": ("vintage", "retro", "antiguo"),
    "bleach_bypass": ("bleach", "desaturad"),
    "vivid": ("colores vivos", "saturad", "vivid"),
    "cinematic": ("cinematografic", "cinematic", "look de cine"),
}
