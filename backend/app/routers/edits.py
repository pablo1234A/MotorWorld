"""Prompt-driven editors: plan an instruction into steps, then run them as one job."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_user
from ..errors import bad_request
from ..models import User
from ..providers.catalog import get_model
from ..providers.registry import user_credentials
from ..services.assets import asset_to_dict, get_user_asset
from ..services.generation import create_generation, generation_to_dict
from ..services.planner import plan_image_edit, plan_video_edit, refine_with_llm

router = APIRouter(prefix="/api/edits", tags=["editores"])


class PlanIn(BaseModel):
    asset_id: str
    instruction: str = Field(min_length=2, max_length=4000)
    mask_asset_id: str | None = None
    use_llm: bool = True


@router.post("/plan")
async def plan(body: PlanIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    asset = await get_user_asset(db, user.id, body.asset_id)
    creds = await user_credentials(db, user.id)
    if asset.kind == "image":
        steps = plan_image_edit(body.instruction, creds, has_mask=bool(body.mask_asset_id))
    elif asset.kind == "video":
        steps = plan_video_edit(body.instruction, creds, asset_to_dict(asset))
    else:
        raise bad_request("Solo se pueden editar imágenes y vídeos con instrucciones")
    if body.use_llm:
        steps = await refine_with_llm(body.instruction, steps, creds, asset.kind)
    return {"media": asset.kind, "steps": steps, "all_available": all(s.get("available") for s in steps)}


class Step(BaseModel):
    task: str
    model_id: str
    prompt: str = ""
    params: dict[str, Any] = Field(default_factory=dict)
    provider: str | None = None
    label: str = ""
    reference_asset_ids: list[str] = Field(default_factory=list)


class RunIn(BaseModel):
    asset_id: str
    steps: list[Step] = Field(min_length=1, max_length=8)
    mask_asset_id: str | None = None
    project_id: str | None = None
    instruction: str = ""


ALLOWED = {"image": {"image_edit", "inpaint", "outpaint", "remove_background", "upscale_image", "local_image_op", "image_to_image"},
           "video": {"local_video_op", "video_to_video", "upscale_video", "video_extend", "video_to_audio"}}


@router.post("/run", status_code=201)
async def run(body: RunIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    asset = await get_user_asset(db, user.id, body.asset_id)
    if body.mask_asset_id:
        await get_user_asset(db, user.id, body.mask_asset_id)
    for st in body.steps:
        if st.task not in ALLOWED.get(asset.kind, set()):
            raise bad_request(f"El paso '{st.task}' no es válido para {asset.kind}")
        m = get_model(st.model_id)
        if m is None or st.task not in m.tasks and not (st.task == "video_extend" and st.model_id == "local-ffmpeg"):
            raise bad_request(f"El modelo {st.model_id} no admite {st.task}")
        for rid in st.reference_asset_ids:
            await get_user_asset(db, user.id, rid)
        if st.task == "inpaint" and not body.mask_asset_id:
            raise bad_request("El inpainting necesita una máscara: pinta la zona a modificar", code="mask_required")
        if st.task == "local_video_op" and any(o.get("_needs_cues") for o in st.params.get("ops", [])):
            raise bad_request("Añade el texto de los subtítulos antes de ejecutar", code="cues_required")
    params = {"steps": [s.model_dump() for s in body.steps], "mask_asset_id": body.mask_asset_id, "user_prompt": body.instruction}
    gen = await create_generation(db, user, task="edit_chain", model_id="pipeline", prompt=body.instruction or "Edición",
                                  params=params, inputs={asset.kind: asset.id}, project_id=body.project_id or asset.project_id)
    return generation_to_dict(gen)
