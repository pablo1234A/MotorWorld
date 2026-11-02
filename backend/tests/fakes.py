"""Test doubles for the provider layer. Only imported by the test-suite.

They exercise the real job pipeline (routing, fallback, polling, cancel,
download into storage) without network access. They are registered under
provider ids that do not exist in production and never appear in the app.
"""
from __future__ import annotations

import asyncio
import base64
import io

from PIL import Image

from app.providers import catalog
from app.providers.base import JobState, OutputItem, ProviderAdapter, ProviderError, ProviderInputError, Submission
from app.providers.catalog import ModelSpec, Price, Route
from app.providers.registry import EXTRA_ADAPTERS


def _png_data_uri(color="#33aa55") -> str:
    b = io.BytesIO()
    Image.new("RGB", (96, 64), color).save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


class FakeCloud(ProviderAdapter):
    id = "fakecloud"
    name = "Fake Cloud (tests)"
    key_env = None
    polls_before_done = 2
    calls: list = []
    fail_submit: Exception | None = None
    block = False

    def __init__(self, cred):
        super().__init__(cred)

    async def submit(self, req):
        FakeCloud.calls.append(("submit", req.task, req.endpoint, req.prompt, dict(req.params), [i.role for i in req.inputs]))
        if FakeCloud.fail_submit:
            raise FakeCloud.fail_submit
        return Submission(job_id="job-1", meta={"n": 0})

    async def poll(self, job_id, meta):
        meta["n"] = meta.get("n", 0) + 1
        FakeCloud.calls.append(("poll", job_id))
        if FakeCloud.block:
            return JobState("processing", progress=0.5, message="trabajando")
        if meta["n"] < FakeCloud.polls_before_done:
            return JobState("processing", progress=0.25 * meta["n"])
        return JobState("completed", outputs=[OutputItem(url=_png_data_uri())])

    async def cancel(self, job_id, meta):
        FakeCloud.calls.append(("cancel", job_id))
        return True


class FakeVideo(FakeCloud):
    id = "fakevideo"

    async def poll(self, job_id, meta):
        from tests.conftest import _TMP

        return JobState("completed", outputs=[OutputItem(path=_copy(_TMP / "media" / "a.mp4"))])


def _copy(p):
    import shutil

    from app.storage import tmp_path

    d = tmp_path(".mp4")
    shutil.copyfile(p, d)
    return d


class Broken(ProviderAdapter):
    id = "brokencloud"
    name = "Broken (tests)"
    key_env = None
    calls = 0

    async def submit(self, req):
        Broken.calls += 1
        raise ProviderError("HTTP 503 upstream down")


class Invalid(ProviderAdapter):
    id = "invalidcloud"
    name = "Invalid (tests)"
    key_env = None

    async def submit(self, req):
        raise ProviderInputError("prompt rejected: invalid parameter")


TEST_MODELS = [
    ModelSpec(id="test-image", name="Test Image", family="Test", category="image", tasks=["text_to_image", "image_edit", "inpaint", "outpaint",
              "remove_background", "upscale_image"], description="test", license="test", supports_negative_prompt=False,
              params=[catalog.p_seed(), catalog.p_num(4), catalog.p_aspect(["1:1", "16:9"], "1:1")],
              routes=[Route("brokencloud", {t: "x" for t in ["text_to_image"]}, "none", Price(0.01, "image"), priority=1),
                      Route("fakecloud", {t: "fake/img" for t in ["text_to_image", "image_edit", "inpaint", "outpaint", "remove_background", "upscale_image"]},
                            "none", Price(0.02, "image"), priority=2)], tags=["internal"]),
    ModelSpec(id="test-invalid", name="Test Invalid", family="Test", category="image", tasks=["text_to_image"], description="t", license="t",
              routes=[Route("invalidcloud", {"text_to_image": "x"}, "none", priority=1),
                      Route("fakecloud", {"text_to_image": "fake/img"}, "none", priority=2)], tags=["internal"]),
    ModelSpec(id="test-video", name="Test Video", family="Test", category="video", tasks=["image_to_video", "text_to_video"], description="t",
              license="t", params=[catalog.p_duration([5], 5)], routes=[Route("fakevideo", {"image_to_video": "v", "text_to_video": "v"}, "none",
                                                                            Price(0.1, "second"))], tags=["internal"]),
    ModelSpec(id="test-unconfigured", name="Needs key", family="Test", category="image", tasks=["text_to_image"], description="t", license="t",
              routes=[Route("replicate", {"text_to_image": "x/y"}, "flux_schnell")], tags=["internal"]),
]


def install():
    EXTRA_ADAPTERS.update({"fakecloud": FakeCloud, "brokencloud": Broken, "invalidcloud": Invalid, "fakevideo": FakeVideo})
    for m in TEST_MODELS:
        if m.id not in catalog._BY_ID:
            catalog.MODELS.append(m)
            catalog._BY_ID[m.id] = m
    FakeCloud.calls = []
    FakeCloud.fail_submit = None
    FakeCloud.block = False
    FakeCloud.polls_before_done = 2
    Broken.calls = 0


async def sleep_tick():
    await asyncio.sleep(0)
