"""Screenplay document model used by the film studio."""
from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


class Character(BaseModel):
    id: str = Field(default_factory=lambda: _id("char"))
    name: str = ""
    role: str = ""
    description: str = ""
    age: str = ""
    face: str = ""
    hair: str = ""
    wardrobe: str = ""
    accessories: str = ""
    colors: str = ""
    voice_description: str = ""
    voice_id: str = ""  # ElevenLabs voice id (library voice or a voice with documented consent)
    seed: int | None = None
    lora_url: str = ""
    ref_asset_ids: list[str] = Field(default_factory=list)

    def descriptor(self) -> str:
        bits = [self.name and f"{self.name}:", self.age and f"{self.age}", self.face, self.hair and f"hair {self.hair}",
                self.wardrobe and f"wearing {self.wardrobe}", self.accessories and f"with {self.accessories}",
                self.colors and f"color palette {self.colors}"]
        return " ".join(b for b in bits if b).strip()


class Location(BaseModel):
    id: str = Field(default_factory=lambda: _id("loc"))
    name: str = ""
    description: str = ""
    time_of_day: str = ""
    lighting: str = ""
    ref_asset_ids: list[str] = Field(default_factory=list)


class DialogueLine(BaseModel):
    character_id: str = ""
    line: str = ""
    audio_asset_id: str | None = None


class Shot(BaseModel):
    id: str = Field(default_factory=lambda: _id("shot"))
    number: int = 1
    description: str = ""
    shot_type: str = "medium"
    camera_movement: str = "static"
    lens: str = "35mm"
    duration: float = 5.0
    characters: list[str] = Field(default_factory=list)
    dialogue: list[DialogueLine] = Field(default_factory=list)
    image_prompt: str = ""
    video_prompt: str = ""
    sfx_prompt: str = ""
    keyframe_asset_id: str | None = None
    clip_asset_id: str | None = None
    sfx_asset_id: str | None = None
    notes: str = ""


class Scene(BaseModel):
    id: str = Field(default_factory=lambda: _id("scene"))
    number: int = 1
    title: str = ""
    summary: str = ""
    location_id: str = ""
    mood: str = ""
    shots: list[Shot] = Field(default_factory=list)


class Style(BaseModel):
    visual_style: str = "cinematic"
    lighting: str = ""
    color_grade: str = ""
    aesthetic: str = ""
    aspect_ratio: str = "16:9"
    image_model: str = "flux-1.1-pro"
    reference_model: str = "nano-banana"
    video_model: str = "kling-2.1"
    tts_model: str = "elevenlabs-tts"


class Music(BaseModel):
    prompt: str = ""
    asset_id: str | None = None


class Script(BaseModel):
    title: str = ""
    logline: str = ""
    synopsis: str = ""
    genre: str = ""
    tone: str = ""
    target_duration_s: int = 60
    language: str = "es"
    style: Style = Field(default_factory=Style)
    characters: list[Character] = Field(default_factory=list)
    locations: list[Location] = Field(default_factory=list)
    scenes: list[Scene] = Field(default_factory=list)
    music: Music = Field(default_factory=Music)

    def character(self, cid: str) -> Character | None:
        return next((c for c in self.characters if c.id == cid), None)

    def location(self, lid: str) -> Location | None:
        return next((loc for loc in self.locations if loc.id == lid), None)

    def find_shot(self, shot_id: str) -> tuple[Scene, Shot] | tuple[None, None]:
        for sc in self.scenes:
            for sh in sc.shots:
                if sh.id == shot_id:
                    return sc, sh
        return None, None

    def renumber(self) -> None:
        for i, sc in enumerate(self.scenes, 1):
            sc.number = i
            for j, sh in enumerate(sc.shots, 1):
                sh.number = j


# ---------------------------------------------------------------------------
# JSON Schema for LLM structured output (strict: all props required, no extras)
# ---------------------------------------------------------------------------
def _obj(props: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": props, "required": list(props.keys()), "additionalProperties": False}


S = {"type": "string"}
LLM_SHOT = _obj({
    "description": S, "shot_type": {"type": "string", "enum": ["extreme_wide", "wide", "full", "medium", "medium_close", "close_up", "extreme_close_up", "over_shoulder", "pov", "aerial"]},
    "camera_movement": {"type": "string", "enum": ["static", "dolly_in", "dolly_out", "tracking", "orbit", "pan_left", "pan_right", "tilt_up", "tilt_down", "zoom_in", "zoom_out", "crane_up", "crane_down", "handheld", "fpv", "travelling"]},
    "lens": {"type": "string", "enum": ["14mm", "24mm", "35mm", "50mm", "85mm", "135mm", "anamorphic", "macro"]},
    "duration": {"type": "number"},
    "characters": {"type": "array", "items": S},
    "dialogue": {"type": "array", "items": _obj({"character_id": S, "line": S})},
    "image_prompt": S, "video_prompt": S, "sfx_prompt": S,
})
LLM_SCENE = _obj({"title": S, "summary": S, "location_id": S, "mood": S, "shots": {"type": "array", "items": LLM_SHOT}})
LLM_SCRIPT = _obj({
    "title": S, "logline": S, "synopsis": S, "genre": S, "tone": S,
    "style": _obj({"visual_style": S, "lighting": S, "color_grade": S, "aesthetic": S}),
    "characters": {"type": "array", "items": _obj({
        "id": S, "name": S, "role": S, "description": S, "age": S, "face": S, "hair": S, "wardrobe": S, "accessories": S,
        "colors": S, "voice_description": S})},
    "locations": {"type": "array", "items": _obj({"id": S, "name": S, "description": S, "time_of_day": S, "lighting": S})},
    "scenes": {"type": "array", "items": LLM_SCENE},
    "music": _obj({"prompt": S}),
})
