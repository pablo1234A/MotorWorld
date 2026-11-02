"""Job system: routing, fallback, cancel, retry, duplicate, limits, recovery."""
import asyncio

import pytest

from . import fakes
from .conftest import upload, wait_job


@pytest.fixture(autouse=True)
def _fakes():
    fakes.install()
    yield


async def _create(client, **body):
    body.setdefault("task", "text_to_image")
    body.setdefault("model_id", "test-image")
    body.setdefault("prompt", "un coche clásico rojo en una carretera de montaña al atardecer")
    return await client.post("/api/generations", json=body)


async def test_fallback_to_next_provider_and_outputs_stored(client):
    r = await _create(client, params={"seed": 42, "aspect_ratio": "16:9", "bogus_param": 1}, negative_prompt="borroso", style="cinematic")
    assert r.status_code == 201, r.text
    g = await wait_job(client, r.json()["id"])
    assert g["status"] == "completed", g
    assert g["provider"] == "fakecloud"
    assert [a["provider"] for a in g["attempt_log"]] == ["brokencloud", "fakecloud"]
    assert g["attempt_log"][0]["ok"] is False and "503" in g["attempt_log"][0]["error"]
    assert fakes.Broken.calls == 1
    out = g["outputs"][0]
    assert out["kind"] == "image" and out["generation_id"] == g["id"] and out["meta"]["seed"] == 42
    # stored in OUR storage, downloadable
    assert (await client.get(out["url"])).status_code == 200
    # unsupported controls are dropped, never forwarded
    submitted = next(c for c in fakes.FakeCloud.calls if c[0] == "submit")
    assert "bogus_param" not in submitted[4]
    assert g["negative_prompt"] == "" and "negative_prompt" in g["params"]["_dropped"]
    assert "cinematic film still" in g["prompt"] and g["params"]["user_prompt"].startswith("un coche")
    assert g["estimated_cost_usd"] == 0.02


async def test_non_retryable_error_does_not_fall_back(client):
    r = await _create(client, model_id="test-invalid")
    g = await wait_job(client, r.json()["id"])
    assert g["status"] == "failed" and "invalid parameter" in g["error"]
    assert len(g["attempt_log"]) == 1
    assert not any(c[0] == "submit" for c in fakes.FakeCloud.calls)


async def test_unconfigured_model_explains_missing_key(client):
    r = await _create(client, model_id="test-unconfigured")
    assert r.status_code == 400
    d = r.json()["detail"]
    assert d["code"] == "provider_not_configured" and "replicate" in d["providers"]


async def test_param_validation(client):
    r = await _create(client, params={"num_outputs": 99})
    assert r.status_code == 400
    r = await _create(client, params={"aspect_ratio": "7:3"})
    assert r.status_code == 400
    r = await _create(client, prompt="")
    assert r.status_code == 400 and r.json()["detail"]["code"] == "prompt_required"
    r = await _create(client, model_id="no-existe")
    assert r.status_code == 400


async def test_progress_cancel_retry_duplicate(client):
    fakes.FakeCloud.block = True
    r = await _create(client, provider="fakecloud")
    gid = r.json()["id"]
    for _ in range(200):
        d = (await client.get(f"/api/generations/{gid}")).json()
        if d["status"] == "processing" and d["progress"] == 0.5:
            break
        await asyncio.sleep(0.02)
    assert d["progress"] == 0.5  # real provider progress is surfaced
    c = await client.post(f"/api/generations/{gid}/cancel")
    assert c.status_code == 200
    g = await wait_job(client, gid)
    assert g["status"] == "cancelled"
    assert any(call[0] == "cancel" for call in fakes.FakeCloud.calls)  # provider-side cancel was requested
    assert (await client.post(f"/api/generations/{gid}/cancel")).status_code == 400
    fakes.FakeCloud.block = False
    rr = await client.post(f"/api/generations/{gid}/retry")
    assert rr.status_code == 200
    g = await wait_job(client, gid)
    assert g["status"] == "completed" and g["attempts"] == 2
    dup = await client.post(f"/api/generations/{gid}/duplicate", json={"prompt": "otra versión", "params": {"seed": 7}})
    assert dup.status_code == 201
    g2 = await wait_job(client, dup.json()["id"])
    assert g2["status"] == "completed" and g2["parent_generation_id"] == gid and g2["params"]["seed"] == 7
    # save + delete
    assert (await client.patch(f"/api/generations/{gid}", json={"is_saved": True})).json()["is_saved"]
    assert (await client.delete(f"/api/generations/{gid}?delete_outputs=true")).status_code == 200
    assert (await client.get(f"/api/generations/{gid}")).status_code == 404


async def test_concurrency_limit(client):
    from app.config import get_settings

    fakes.FakeCloud.block = True
    s = get_settings()
    ids = []
    for _ in range(s.max_active_jobs_per_user):
        r = await _create(client, provider="fakecloud")
        assert r.status_code == 201
        ids.append(r.json()["id"])
    over = await _create(client, provider="fakecloud")
    assert over.status_code == 429 and over.json()["detail"]["code"] == "concurrency_limit"
    for gid in ids:
        await client.post(f"/api/generations/{gid}/cancel")
    for gid in ids:
        await wait_job(client, gid)
    fakes.FakeCloud.block = False


async def test_history_filters(client):
    r = await _create(client)
    await wait_job(client, r.json()["id"])
    h = (await client.get("/api/generations?status=completed")).json()
    assert h["total"] == 1 and h["items"][0]["outputs"]
    assert (await client.get("/api/generations?status=failed")).json()["total"] == 0
    usage = (await client.get("/api/usage")).json()
    assert usage["estimated_spend_30d_usd"] == pytest.approx(0.02)


async def test_stale_job_recovery(client):
    """A job left 'processing' by a dead worker is re-queued and completes."""
    from datetime import datetime, timedelta, timezone

    from app.db import get_sessionmaker
    from app.models import Generation, JobStatus
    from app.services.generation import recover_stale_jobs
    from app.services.queue import wait_inline

    r = await _create(client, provider="fakecloud")
    gid = r.json()["id"]
    await wait_job(client, gid)
    async with get_sessionmaker()() as db:
        g = await db.get(Generation, gid)
        g.status = JobStatus.processing
        g.output_asset_ids = []
        g.heartbeat_at = datetime.now(timezone.utc) - timedelta(hours=1)
        g.attempts = 1
        await db.commit()
    n = await recover_stale_jobs()
    assert n == 1
    await wait_inline(10)
    g = await wait_job(client, gid)
    assert g["status"] == "completed" and g["output_asset_ids"]


async def test_video_extend_pipeline(client, media_dir):
    v = await upload(client, media_dir / "a.mp4")
    r = await client.post("/api/generations", json={"task": "video_extend", "model_id": "local-ffmpeg", "prompt": "la cámara sigue avanzando",
                                                    "inputs": {"video": v["id"]}, "params": {"i2v_model": "test-video", "join": True}})
    assert r.status_code == 201, r.text
    g = await wait_job(client, r.json()["id"], 180)
    assert g["status"] == "completed", g["error"]
    kinds = [o["kind"] for o in g["outputs"]]
    assert kinds == ["image", "video", "video"]
    joined = g["outputs"][-1]
    assert abs(joined["duration"] - 6.0) < 0.4 and joined["parent_id"] == v["id"]
    detail = (await client.get(f"/api/generations/{g['id']}")).json()
    assert detail["children"][0]["task"] == "image_to_video"
    # child steps are hidden from the main history list
    assert all(not x["is_child"] for x in (await client.get("/api/generations")).json()["items"])


async def test_post_ops_slow_motion_after_generation(client):
    r = await client.post("/api/generations", json={"task": "text_to_video", "model_id": "test-video", "prompt": "olas rompiendo",
                                                    "params": {"post_ops": [{"op": "slow_motion", "factor": 0.5}]},
                                                    "cinema": {"camera_movement": "dolly_in", "lens": "85mm", "lighting": "golden_hour"}})
    g = await wait_job(client, r.json()["id"], 120)
    assert g["status"] == "completed", g["error"]
    assert len(g["outputs"]) == 2 and g["outputs"][1]["duration"] > g["outputs"][0]["duration"] * 1.8
    assert "Camera: slow dolly in" in g["prompt"] and "85mm portrait lens" in g["prompt"]


async def test_multi_shot_sequence_with_continuity(client, media_dir):
    img = await upload(client, media_dir / "img.png")
    r = await client.post("/api/generations", json={"task": "multi_shot", "model_id": "pipeline", "prompt": "Secuencia",
                                                    "inputs": {"image": img["id"]},
                                                    "params": {"video_model": "test-video", "continuity": True, "transition": "crossfade",
                                                               "shots": [{"prompt": "plano general", "cinema": {"camera_movement": "crane_up"}},
                                                                         {"prompt": "primer plano"}, {"prompt": "plano final"}]}})
    assert r.status_code == 201, r.text
    g = await wait_job(client, r.json()["id"], 240)
    assert g["status"] == "completed", g["error"]
    assert len(g["outputs"]) == 4 and g["outputs"][-1]["source"] == "render"
    detail = (await client.get(f"/api/generations/{g['id']}")).json()
    tasks = [c["task"] for c in detail["children"]]
    assert tasks == ["image_to_video"] * 3  # shots 2-3 chained from the previous last frame
    assert detail["children"][1]["inputs"]["image"][0] != img["id"]
    assert abs(g["outputs"][-1]["duration"] - (3 * 3 - 2 * 0.4)) < 0.4
