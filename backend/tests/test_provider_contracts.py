"""Contract tests: each adapter speaks the provider's documented HTTP API.

The provider endpoints are mocked with respx (no network). These tests prove
the request shapes/auth headers/polling logic, not the model quality —
real generations require API keys (see docs/PROVIDERS.md).
"""
import base64
import io
import json

import httpx
import pytest
import respx
from PIL import Image

from app.providers.base import InputFile, ProviderAuthError, ProviderInputError, ProviderRequest
from app.providers.bfl import BFLAdapter
from app.providers.comfyui import ComfyUIAdapter, TEMPLATES, fill_template
from app.providers.elevenlabs import ElevenLabsAdapter
from app.providers.fal import FalAdapter
from app.providers.huggingface import HuggingFaceAdapter
from app.providers.replicate import ReplicateAdapter


def _png() -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(b, "PNG")
    return b.getvalue()


@pytest.fixture
def img_file(tmp_path):
    p = tmp_path / "in.png"
    p.write_bytes(_png())
    return InputFile(role="image", path=p, mime="image/png")


@respx.mock
async def test_replicate_official_model_submit_poll_cancel(img_file):
    route = respx.post("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions").mock(
        return_value=httpx.Response(201, json={"id": "p1", "status": "starting", "urls": {"get": "https://api.replicate.com/v1/predictions/p1"}}))
    a = ReplicateAdapter("r8_test")
    sub = await a.submit(ProviderRequest(task="image_edit", endpoint="black-forest-labs/flux-kontext-pro", prompt="cambia el fondo",
                                         params={"aspect_ratio": "match_input_image", "seed": 3, "output_format": "png"},
                                         inputs=[img_file], route_options={"mapper": "flux_kontext"}))
    assert sub.job_id == "p1"
    req = route.calls[0].request
    assert req.headers["authorization"] == "Bearer r8_test"
    body = json.loads(req.content)["input"]
    assert body["prompt"] == "cambia el fondo" and body["seed"] == 3 and body["input_image"].startswith("data:image/png;base64,")
    respx.get("https://api.replicate.com/v1/predictions/p1").mock(side_effect=[
        httpx.Response(200, json={"id": "p1", "status": "processing", "logs": " 40%|####      | 4/10 [00:01<00:02]"}),
        httpx.Response(200, json={"id": "p1", "status": "succeeded", "output": "https://replicate.delivery/x/out.png"}),
    ])
    st = await a.poll("p1", sub.meta)
    assert st.status == "processing" and st.progress == pytest.approx(0.4)
    st = await a.poll("p1", sub.meta)
    assert st.status == "completed" and st.outputs[0].url.endswith("out.png")
    cancel = respx.post("https://api.replicate.com/v1/predictions/p1/cancel").mock(return_value=httpx.Response(200, json={}))
    assert await a.cancel("p1", {}) and cancel.called


@respx.mock
async def test_replicate_version_pinned_and_large_file_upload(tmp_path):
    big = tmp_path / "big.mp4"
    big.write_bytes(b"\x00" * (300 * 1024))
    files = respx.post("https://api.replicate.com/v1/files").mock(return_value=httpx.Response(201, json={"urls": {"get": "https://api.replicate.com/v1/files/f1"}}))
    pred = respx.post("https://api.replicate.com/v1/predictions").mock(return_value=httpx.Response(201, json={"id": "p2", "urls": {}}))
    a = ReplicateAdapter("tok")
    await a.submit(ProviderRequest(task="upscale_video", endpoint="owner/model:abc123", inputs=[InputFile("video", big, "video/mp4")],
                                   params={"target_resolution": "1080p"}, route_options={"mapper": "replicate_video_upscale"}))
    assert files.called
    body = json.loads(pred.calls[0].request.content)
    assert body["version"] == "abc123" and body["input"]["video"] == "https://api.replicate.com/v1/files/f1"


@respx.mock
async def test_replicate_auth_error_is_typed():
    respx.post("https://api.replicate.com/v1/models/a/b/predictions").mock(return_value=httpx.Response(401, json={"detail": "bad"}))
    with pytest.raises(ProviderAuthError):
        await ReplicateAdapter("x").submit(ProviderRequest(task="text_to_image", endpoint="a/b", prompt="p", route_options={"mapper": "flux_schnell"}))


@respx.mock
async def test_fal_queue_flow(img_file):
    submit = respx.post("https://queue.fal.run/fal-ai/kling-video/v2.1/pro/image-to-video").mock(return_value=httpx.Response(200, json={
        "request_id": "r1", "status_url": "https://queue.fal.run/fal-ai/kling-video/requests/r1/status",
        "response_url": "https://queue.fal.run/fal-ai/kling-video/requests/r1", "cancel_url": "https://queue.fal.run/fal-ai/kling-video/requests/r1/cancel"}))
    end = InputFile("end_image", img_file.path, "image/png")
    a = FalAdapter("key-123")
    sub = await a.submit(ProviderRequest(task="first_last_to_video", endpoint="fal-ai/kling-video/v2.1/pro/image-to-video", prompt="transición",
                                         params={"duration": 5}, inputs=[img_file, end], route_options={"mapper": "fal_kling"}))
    req = submit.calls[0].request
    assert req.headers["authorization"] == "Key key-123"
    body = json.loads(req.content)
    assert body["duration"] == "5" and body["image_url"].startswith("data:") and body["tail_image_url"].startswith("data:")
    respx.get("https://queue.fal.run/fal-ai/kling-video/requests/r1/status").mock(side_effect=[
        httpx.Response(200, json={"status": "IN_QUEUE", "queue_position": 3}),
        httpx.Response(200, json={"status": "COMPLETED"}),
    ])
    respx.get("https://queue.fal.run/fal-ai/kling-video/requests/r1").mock(return_value=httpx.Response(200, json={"video": {"url": "https://fal.media/v.mp4"}}))
    st = await a.poll("r1", sub.meta)
    assert st.status == "queued" and "3" in st.message
    st = await a.poll("r1", sub.meta)
    assert st.status == "completed" and st.outputs[0].url == "https://fal.media/v.mp4"


@respx.mock
async def test_fal_error_result():
    respx.get("https://q/s").mock(return_value=httpx.Response(200, json={"status": "COMPLETED"}))
    respx.get("https://q/r").mock(return_value=httpx.Response(422, json={"detail": [{"msg": "image too small"}]}))
    st = await FalAdapter("k").poll("r", {"status_url": "https://q/s", "response_url": "https://q/r"})
    assert st.status == "failed" and "image too small" in st.error


@respx.mock
async def test_bfl_submit_and_poll(img_file):
    respx.post("https://api.bfl.ai/v1/flux-kontext-pro").mock(return_value=httpx.Response(200, json={"id": "t1", "polling_url": "https://api.eu.bfl.ai/v1/get_result?id=t1"}))
    a = BFLAdapter("bfl-key")
    sub = await a.submit(ProviderRequest(task="image_edit", endpoint="flux-kontext-pro", prompt="haz que sea de noche", inputs=[img_file],
                                         params={"aspect_ratio": "match_input_image"}, route_options={"mapper": "bfl_kontext"}))
    sent = json.loads(respx.calls[0].request.content)
    assert respx.calls[0].request.headers["x-key"] == "bfl-key"
    assert base64.b64decode(sent["input_image"]) == img_file.path.read_bytes() and "aspect_ratio" not in sent
    respx.get("https://api.eu.bfl.ai/v1/get_result?id=t1").mock(side_effect=[
        httpx.Response(200, json={"status": "Pending", "progress": 40}),
        httpx.Response(200, json={"status": "Ready", "result": {"sample": "https://delivery.bfl.ai/x.png", "seed": 9}}),
    ])
    st = await a.poll("t1", sub.meta)
    assert st.status == "processing" and st.progress == pytest.approx(0.4)
    st = await a.poll("t1", sub.meta)
    assert st.status == "completed" and st.outputs[0].url.endswith("x.png")


async def test_bfl_fill_requires_mask(img_file):
    with pytest.raises(ProviderInputError):
        await BFLAdapter("k").submit(ProviderRequest(task="inpaint", endpoint="flux-pro-1.0-fill", prompt="x", inputs=[img_file], route_options={"mapper": "bfl_fill"}))


@respx.mock
async def test_huggingface_sync_image():
    route = respx.post("https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell").mock(
        return_value=httpx.Response(200, content=_png(), headers={"content-type": "image/png"}))
    sub = await HuggingFaceAdapter("hf_x").submit(ProviderRequest(task="text_to_image", endpoint="black-forest-labs/FLUX.1-schnell", prompt="un faro",
                                                                  params={"aspect_ratio": "16:9", "num_outputs": 2, "seed": 5},
                                                                  route_options={"mapper": "hf_text_to_image"}))
    assert sub.immediate.status == "completed" and len(sub.immediate.outputs) == 2
    bodies = [json.loads(c.request.content) for c in route.calls]
    assert bodies[0]["inputs"] == "un faro" and bodies[0]["parameters"]["width"] == 1344 and [b["parameters"]["seed"] for b in bodies] == [5, 6]


@respx.mock
async def test_comfyui_workflow_roundtrip():
    respx.post("http://comfy:8188/prompt").mock(return_value=httpx.Response(200, json={"prompt_id": "pid"}))
    respx.get("http://comfy:8188/history/pid").mock(return_value=httpx.Response(200, json={"pid": {
        "status": {"status_str": "success"}, "outputs": {"9": {"images": [{"filename": "motorworld_0001.png", "subfolder": "", "type": "output"}]}}}}))
    a = ComfyUIAdapter(None, base_url="http://comfy:8188")
    sub = await a.submit(ProviderRequest(task="text_to_image", endpoint="sdxl", prompt="castillo", negative_prompt="borroso",
                                         params={"seed": 11, "steps": 20, "guidance": 6.5, "width": 1024, "height": 768}, route_options={"mapper": "comfy_template"}))
    wf = json.loads(respx.calls[0].request.content)["prompt"]
    assert wf["6"]["inputs"]["text"] == "castillo" and wf["7"]["inputs"]["text"] == "borroso"
    assert wf["3"]["inputs"]["seed"] == 11 and wf["3"]["inputs"]["steps"] == 20 and wf["3"]["inputs"]["cfg"] == 6.5
    assert wf["5"]["inputs"]["width"] == 1024
    st = await a.poll(sub.job_id, sub.meta)
    assert st.status == "completed" and "filename=motorworld_0001.png" in st.outputs[0].url


def test_comfy_template_defaults():
    wf = fill_template(TEMPLATES["flux_schnell"], {"prompt": "p", "seed": 1, "width": 512, "height": 512, "batch": 1})
    assert wf["3"]["inputs"]["steps"] == 4 and wf["3"]["inputs"]["cfg"] == 1.0


@respx.mock
async def test_elevenlabs_tts():
    route = respx.post("https://api.elevenlabs.io/v1/text-to-speech/voz1").mock(return_value=httpx.Response(200, content=b"ID3mp3", headers={"content-type": "audio/mpeg"}))
    sub = await ElevenLabsAdapter("el").submit(ProviderRequest(task="text_to_speech", endpoint="eleven_multilingual_v2", prompt="Hola, bienvenidos.",
                                                               params={"voice_id": "voz1", "stability": 0.4}, route_options={"mapper": "tts"}))
    req = route.calls[0].request
    assert req.headers["xi-api-key"] == "el" and json.loads(req.content)["model_id"] == "eleven_multilingual_v2"
    assert sub.immediate.outputs[0].data == b"ID3mp3"


def test_every_catalog_route_has_a_mapper():
    from app.providers import fal, replicate
    from app.providers.catalog import MODELS

    known = {"replicate": replicate.MAPPERS, "fal": fal.MAPPERS}
    other = {"huggingface": {"hf_text_to_image"}, "bfl": {"bfl_generate", "bfl_kontext", "bfl_fill"}, "comfyui": {"comfy_template"},
             "elevenlabs": {"tts", "sfx", "music"}, "local": {"local"}, "anthropic": {"llm"}, "openai_compat": {"llm"},
             "diffusers": {"diffusers_flux", "diffusers_sdxl", "diffusers_wan", "diffusers_ltx", "diffusers_cogvideo"}}
    for m in MODELS:
        if "internal" in m.tags and m.id.startswith("test-"):
            continue
        for r in m.routes:
            pool = known.get(r.provider) or other.get(r.provider)
            assert pool is not None, (m.id, r.provider)
            assert r.mapper in pool, (m.id, r.provider, r.mapper)
            assert set(r.endpoints) <= set(m.tasks) or m.id == "pipeline", (m.id, r.endpoints)
