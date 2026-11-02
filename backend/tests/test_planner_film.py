import pytest

from app.services import film as film_service
from app.services.film_schema import LLM_SCRIPT, Script
from app.services.planner import plan_image_edit, plan_video_edit

from . import fakes
from .conftest import upload, wait_job

CREDS_FAL = {"fal": "k"}


def test_image_plan_product_ad_uses_instruction_editor():
    steps = plan_image_edit("Convierte esta fotografía en una imagen publicitaria de lujo, cambia el fondo por un estudio cinematográfico, "
                            "mejora la iluminación y conserva el producto exactamente igual.", CREDS_FAL)
    assert steps[0]["task"] == "image_edit" and steps[0]["kind"] == "generative"
    assert "Keep the main subject" in steps[0]["prompt"]
    assert steps[0]["model_id"] in ("flux-kontext-pro", "flux-kontext-max", "nano-banana", "seedream-4", "qwen-image-edit")


def test_image_plan_variants():
    assert plan_image_edit("quita el fondo", CREDS_FAL)[0]["task"] == "remove_background"
    s = plan_image_edit("pásala a blanco y negro y amplíala", {})
    assert [x["task"] for x in s] == ["local_image_op", "upscale_image"]
    assert s[0]["kind"] == "local" and s[1]["model_id"] == "lanczos-local"  # free local fallback when no keys
    s = plan_image_edit("elimina la farola", CREDS_FAL, has_mask=True)
    assert s[0]["task"] == "inpaint"
    s = plan_image_edit("cambia la ropa a un traje azul", {})
    assert s[0]["available"] is False and "API key" in s[0]["missing"]  # honest when nothing can do it


def test_video_plan_separates_ffmpeg_from_generative():
    steps = plan_video_edit("Convierte este vídeo en un anuncio cinematográfico de coches, cambia el ambiente a una noche lluviosa, "
                            "mejora la iluminación y añade un movimiento de cámara más dinámico.", CREDS_FAL)
    kinds = {(s["task"], s["kind"]) for s in steps}
    assert ("video_to_video", "generative") in kinds
    local = next(s for s in steps if s["task"] == "local_video_op")
    ops = [o["op"] for o in local["params"]["ops"]]
    assert "color" in ops
    s = plan_video_edit("estabiliza, ponlo en cámara lenta, recórtalo de 2 a 6 segundos y formato vertical para reels", {})
    assert len(s) == 1 and s[0]["kind"] == "local"
    assert [o["op"] for o in s[0]["params"]["ops"]] == ["trim", "slow_motion", "stabilize", "reframe"]
    assert s[0]["params"]["ops"][0] == {"op": "trim", "start": 2.0, "end": 6.0}


def test_llm_schema_is_strict():
    def walk(node):
        if node.get("type") == "object":
            assert node["additionalProperties"] is False
            assert set(node["required"]) == set(node["properties"])
            for v in node["properties"].values():
                walk(v)
        if node.get("type") == "array":
            walk(node["items"])

    walk(LLM_SCRIPT)


LLM_OUTPUT = {
    "title": "Última Vuelta", "logline": "Una piloto veterana corre su última carrera.", "synopsis": "…", "genre": "drama", "tone": "épico",
    "style": {"visual_style": "cinematic", "lighting": "golden hour", "color_grade": "teal and orange", "aesthetic": "car commercial"},
    "characters": [{"id": "char_1", "name": "Lucía", "role": "protagonista", "description": "piloto", "age": "45", "face": "rostro anguloso",
                    "hair": "corto gris", "wardrobe": "mono de carreras rojo", "accessories": "casco blanco", "colors": "rojo y blanco",
                    "voice_description": "grave"}],
    "locations": [{"id": "loc_1", "name": "Circuito", "description": "circuito de montaña", "time_of_day": "atardecer", "lighting": "contraluz"}],
    "scenes": [{"title": "Parrilla", "summary": "…", "location_id": "loc_1", "mood": "tenso", "shots": [
        {"description": "Lucía se pone el casco", "shot_type": "close_up", "camera_movement": "dolly_in", "lens": "85mm", "duration": 15,
         "characters": ["char_1", "char_99"], "dialogue": [{"character_id": "char_1", "line": "Una más."}],
         "image_prompt": "a racing driver putting on a helmet", "video_prompt": "she slowly lowers the visor", "sfx_prompt": "engines idling"}]}],
    "music": {"prompt": "epic orchestral"},
}


def test_script_sanitisation_and_consistency_prompt():
    s = film_service.script_from_llm(LLM_OUTPUT, "es", 60)
    sh = s.scenes[0].shots[0]
    assert sh.characters == ["char_1"] and sh.duration == 10.0  # clamped, unknown ids removed
    p = film_service.shot_image_prompt(s, s.scenes[0], sh)
    assert "mono de carreras rojo" in p and "casco blanco" in p and "circuito de montaña" in p and "85mm" in p


@pytest.fixture
def _llm(monkeypatch):
    async def fake_complete(system, user, schema, creds, **kw):
        assert "Idea de la película" in user or "Reescribe" in user
        if schema is LLM_SCRIPT:
            return LLM_OUTPUT, "anthropic"
        return {**LLM_OUTPUT["scenes"][0], "title": "Parrilla (reescrita)"}, "anthropic"

    monkeypatch.setattr(film_service, "complete_json", fake_complete)
    monkeypatch.setattr("app.routers.films.any_llm_configured", lambda creds: True)


async def test_film_develop_requires_llm(client):
    f = (await client.post("/api/films", json={"title": "Nueva película"})).json()
    r = await client.post(f"/api/films/{f['id']}/develop", json={"idea": "Una piloto veterana corre su última carrera"})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "llm_not_configured"


async def test_film_full_pipeline(client, media_dir, _llm):
    fakes.install()
    f = (await client.post("/api/films", json={"title": "Nueva película", "aspect_ratio": "16:9"})).json()
    r = await client.post(f"/api/films/{f['id']}/develop", json={"idea": "Una piloto veterana corre su última carrera"})
    assert r.status_code == 201
    g = await wait_job(client, r.json()["id"])
    assert g["status"] == "completed", g["error"]
    film = (await client.get(f"/api/films/{f['id']}")).json()
    assert film["title"] == "Última Vuelta" and len(film["script"]["scenes"]) == 1
    scene_id = film["script"]["scenes"][0]["id"]
    rw = await client.post(f"/api/films/{f['id']}/rewrite-scene", json={"scene_id": scene_id, "instruction": "más tensión"})
    await wait_job(client, rw.json()["id"])
    film = (await client.get(f"/api/films/{f['id']}")).json()
    assert film["script"]["scenes"][0]["title"] == "Parrilla (reescrita)" and film["script"]["scenes"][0]["id"] == scene_id
    # switch models to test doubles and produce
    script = film["script"]
    script["style"]["image_model"] = "test-image"
    script["style"]["reference_model"] = "test-image"
    script["style"]["video_model"] = "test-video"
    saved = await client.put(f"/api/films/{f['id']}", json={"script": script, "version": film["version"]})
    assert saved.status_code == 200
    conflict = await client.put(f"/api/films/{f['id']}", json={"script": script, "version": film["version"]})
    assert conflict.status_code == 409
    for step in ("character_refs", "keyframes", "clips"):
        j = await client.post(f"/api/films/{f['id']}/produce", json={"step": step})
        assert j.status_code == 201, j.text
        g = await wait_job(client, j.json()["id"], 120)
        assert g["status"] == "completed", (step, g["error"])
    film = (await client.get(f"/api/films/{f['id']}")).json()
    ch = film["script"]["characters"][0]
    sh = film["script"]["scenes"][0]["shots"][0]
    assert ch["ref_asset_ids"] and sh["keyframe_asset_id"] and sh["clip_asset_id"]
    # keyframe used the character reference image (consistency)
    detail = (await client.get("/api/generations?include_children=true&task=image_edit")).json()
    assert detail["total"] == 1 and detail["items"][0]["inputs"]["image"] == [ch["ref_asset_ids"][0]]
    prompts = (await client.get(f"/api/films/{f['id']}/shots/{sh['id']}/prompts")).json()
    assert "mono de carreras rojo" in prompts["image_prompt"]
    tl = (await client.post(f"/api/films/{f['id']}/assemble")).json()
    t = (await client.get(f"/api/timelines/{tl['timeline_id']}")).json()
    v1 = next(x for x in t["data"]["tracks"] if x["id"] == "v1")
    s1 = next(x for x in t["data"]["tracks"] if x["id"] == "s1")
    assert v1["clips"][0]["asset_id"] == sh["clip_asset_id"] and "Una más." in s1["clips"][0]["text"]
    render = await client.post(f"/api/timelines/{tl['timeline_id']}/render")
    g = await wait_job(client, render.json()["id"], 240)
    assert g["status"] == "completed", g["error"]


def test_script_model_defaults():
    s = Script()
    assert s.style.video_model and s.scenes == []
