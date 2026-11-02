"""Real processing through the job system (no mocks): FFmpeg + Pillow."""
from .conftest import upload, wait_job


async def _run(client, body):
    r = await client.post("/api/generations", json=body)
    assert r.status_code == 201, r.text
    return await wait_job(client, r.json()["id"])


async def test_local_image_ops_create_new_asset_and_keep_original(client, media_dir):
    a = await upload(client, media_dir / "img.png")
    g = await _run(client, {"task": "local_image_op", "model_id": "local-image", "inputs": {"image": a["id"]},
                            "params": {"ops": [{"op": "crop", "x": 0, "y": 0, "width": 256, "height": 256}, {"op": "adjust", "brightness": 1.2, "warmth": 0.3},
                                               {"op": "vignette", "strength": 0.4}, {"op": "convert", "format": "jpg"}]}})
    assert g["status"] == "completed", g
    out = g["outputs"][0]
    assert out["width"] == 256 and out["mime"] == "image/jpeg" and out["parent_id"] == a["id"] and out["source"] == "edit"
    orig = (await client.get(f"/api/assets/{a['id']}")).json()
    assert orig["width"] == 512  # original untouched
    lin = (await client.get(f"/api/assets/{out['id']}/lineage")).json()
    assert [x["id"] for x in lin["ancestors"]] == [a["id"], out["id"]]


async def test_lanczos_upscale(client, media_dir):
    a = await upload(client, media_dir / "img.png")
    g = await _run(client, {"task": "upscale_image", "model_id": "lanczos-local", "inputs": {"image": a["id"]}, "params": {"scale": 2}})
    assert g["status"] == "completed" and g["outputs"][0]["width"] == 1024


async def test_video_ops_real_ffmpeg(client, media_dir):
    v = await upload(client, media_dir / "a.mp4")
    g = await _run(client, {"task": "local_video_op", "model_id": "local-ffmpeg", "inputs": {"video": v["id"]},
                            "params": {"ops": [{"op": "trim", "start": 0.5, "end": 2.5}, {"op": "slow_motion", "factor": 0.5},
                                               {"op": "color", "preset": "teal_orange"}, {"op": "reframe", "aspect": "9:16", "mode": "smart"},
                                               {"op": "subtitles", "cues": [{"start": 0, "end": 1.5, "text": "¡Acción!"}]}]}})
    assert g["status"] == "completed", g["error"]
    out = g["outputs"][0]
    assert abs(out["duration"] - 4.0) < 0.3  # 2s trimmed, slowed x0.5
    assert out["height"] == 360 and out["width"] < out["height"]
    assert g["progress"] == 1.0


async def test_video_extract_last_frame_and_invalid_op(client, media_dir):
    v = await upload(client, media_dir / "a.mp4")
    g = await _run(client, {"task": "local_video_op", "model_id": "local-ffmpeg", "inputs": {"video": v["id"]}, "params": {"ops": [{"op": "extract_frame"}]}})
    assert g["outputs"][0]["kind"] == "image"
    bad = await _run(client, {"task": "local_video_op", "model_id": "local-ffmpeg", "inputs": {"video": v["id"]}, "params": {"ops": [{"op": "teleport"}]}})
    assert bad["status"] == "failed" and "desconocida" in bad["error"]


async def test_audio_mix_and_ops(client, media_dir):
    t = await upload(client, media_dir / "tone.wav")
    v = await upload(client, media_dir / "a.mp4")
    g = await _run(client, {"task": "local_audio_op", "model_id": "local-ffmpeg", "inputs": {"audio": [t["id"], v["id"]]},
                            "params": {"mix": True, "volumes": [-6, 0], "delays": [0, 1.5]}})
    assert g["status"] == "completed", g["error"]
    assert g["outputs"][0]["kind"] == "audio" and abs(g["outputs"][0]["duration"] - 4.5) < 0.3
    g2 = await _run(client, {"task": "local_audio_op", "model_id": "local-ffmpeg", "inputs": {"audio": t["id"]},
                             "params": {"ops": [{"op": "denoise"}, {"op": "normalize"}, {"op": "fade", "in": 0.5, "out": 0.5}, {"op": "trim", "start": 0, "end": 2}]}})
    assert g2["status"] == "completed", g2["error"]


async def test_wrong_input_kind_rejected(client, media_dir):
    t = await upload(client, media_dir / "tone.wav")
    r = await client.post("/api/generations", json={"task": "local_video_op", "model_id": "local-ffmpeg", "inputs": {"video": t["id"]}, "params": {"ops": []}})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "input_kind"


async def test_timeline_render_and_exports(client, media_dir):
    a = await upload(client, media_dir / "a.mp4")
    b = await upload(client, media_dir / "b_noaudio.mp4")
    img = await upload(client, media_dir / "img.png")
    tone = await upload(client, media_dir / "tone.wav")
    tl = (await client.post("/api/timelines", json={"name": "Corto"})).json()
    data = tl["data"]
    data["width"], data["height"], data["fps"] = 640, 360, 24
    v1 = next(t for t in data["tracks"] if t["id"] == "v1")
    v1["clips"] = [
        {"id": "c1", "asset_id": a["id"], "start": 0, "in": 0, "out": 3},
        {"id": "c2", "asset_id": img["id"], "start": 3, "still_duration": 2, "transition_in": {"type": "crossfade", "duration": 0.5},
         "effects": [{"op": "color", "preset": "noir"}]},
        {"id": "c3", "asset_id": b["id"], "start": 5, "in": 0, "out": 2, "transition_in": {"type": "fade_black", "duration": 0.4}},
    ]
    next(t for t in data["tracks"] if t["id"] == "v2")["clips"] = [{"asset_id": img["id"], "start": 1, "still_duration": 1}]
    next(t for t in data["tracks"] if t["id"] == "a2")["clips"] = [{"asset_id": tone["id"], "start": 0.5, "in": 0, "out": 4, "volume_db": -10, "fade_in": 0.5, "fade_out": 1}]
    next(t for t in data["tracks"] if t["id"] == "s1")["clips"] = [{"start": 0.2, "end": 2, "text": "Érase una vez…"}, {"start": 3, "end": 5, "text": "FIN"}]
    r = await client.put(f"/api/timelines/{tl['id']}", json={"data": data, "version": tl["version"]})
    assert r.status_code == 200, r.text
    stale = await client.put(f"/api/timelines/{tl['id']}", json={"data": data, "version": tl["version"]})
    assert stale.status_code == 409  # optimistic concurrency
    job = await client.post(f"/api/timelines/{tl['id']}/render")
    assert job.status_code == 201
    g = await wait_job(client, job.json()["id"], 240)
    assert g["status"] == "completed", g["error"]
    out = g["outputs"][0]
    assert out["source"] == "render" and out["has_audio"] and out["width"] == 640
    assert abs(out["duration"] - (3 + 2 + 2 - 0.5 - 0.4)) < 0.35
    assert (await client.get(f"/api/timelines/{tl['id']}")).json()["last_render_asset_id"] == out["id"]
    srt = await client.get(f"/api/timelines/{tl['id']}/export.srt")
    assert "Érase una vez" in srt.text and "00:00:00,200 --> 00:00:02,000" in srt.text
    otio = await client.get(f"/api/timelines/{tl['id']}/export.otio")
    assert otio.status_code == 200 and '"OTIO_SCHEMA": "Timeline' in otio.text
    import opentimelineio as otio_lib

    parsed = otio_lib.adapters.read_from_string(otio.text, "otio_json")
    assert len(parsed.tracks) == 6


async def test_render_empty_timeline_rejected(client):
    tl = (await client.post("/api/timelines", json={"name": "Vacío"})).json()
    r = await client.post(f"/api/timelines/{tl['id']}/render")
    assert r.status_code == 400 and r.json()["detail"]["code"] == "empty_timeline"


async def test_segment_edit_keeps_rest_of_video(client, media_dir):
    v = await upload(client, media_dir / "a.mp4")
    g = await _run(client, {"task": "local_video_op", "model_id": "local-ffmpeg", "inputs": {"video": v["id"]},
                            "params": {"ops": [{"op": "segment", "start": 1, "end": 2, "ops": [{"op": "color", "preset": "noir"}, {"op": "slow_motion", "factor": 0.5}]}]}})
    assert g["status"] == "completed", g["error"]
    assert abs(g["outputs"][0]["duration"] - 4.0) < 0.3  # 1s + 2s (slowed) + 1s
    assert g["outputs"][0]["width"] == 640
