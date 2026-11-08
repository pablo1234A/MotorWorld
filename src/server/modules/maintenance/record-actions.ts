"use server";

import { redirect } from "next/navigation";

import { amendRecordSchema, formWithMaterials, recordSchema, voidRecordSchema } from "@/lib/validation/pci";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, assertPermission, requireOrg } from "@/server/auth/guards";

import * as records from "./records";

export async function createRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "equipment_record.create",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "maintenance.write");
      const input = recordSchema.parse(formWithMaterials(formData));
      await records.createRecord(ctx, input);
      redirect(`/app/equipos/${input.equipmentId}?actuacion=1`);
    },
    formData,
  );
}

export async function amendRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "equipment_record.amend",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "maintenance.write");
      const input = parseForm(amendRecordSchema, formData);
      const { equipmentId } = await records.amendRecord(ctx, input);
      redirect(`/app/equipos/${equipmentId}?corregida=1`);
    },
    formData,
  );
}

export async function voidRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "equipment_record.void",
    async () => {
      const ctx = await requireOrg();
      assertAdmin(ctx);
      const input = parseForm(voidRecordSchema, formData);
      const { equipmentId } = await records.voidRecord(ctx, input.id, input.voidReason);
      redirect(`/app/equipos/${equipmentId}?anulada=1`);
    },
    formData,
  );
}
