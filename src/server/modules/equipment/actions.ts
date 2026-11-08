"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createEquipmentSchema, updateEquipmentSchema } from "@/lib/validation/pci";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, assertPermission, requireOrg } from "@/server/auth/guards";

import * as equipment from "./service";

export async function createEquipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "equipment.create",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "vehicles.write");
      const input = parseForm(createEquipmentSchema, formData);
      const id = await equipment.createEquipment(ctx, input);
      // «Guardar y añadir otro»: vuelve al formulario con la misma instalación y categoría.
      if (formData.get("intent") === "another") redirect(`/app/equipos/nuevo?instalacion=${input.installationId}&categoria=${input.categoryCode}&creado=${id}`);
      redirect(`/app/equipos/${id}?creado=1`);
    },
    formData,
  );
}

export async function updateEquipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "equipment.update",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "vehicles.write");
      const input = parseForm(updateEquipmentSchema, formData);
      await equipment.updateEquipment(ctx, input);
      redirect(`/app/equipos/${input.id}?guardado=1`);
    },
    formData,
  );
}

export async function deleteEquipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("equipment.delete", async () => {
    const ctx = await requireOrg();
    assertPermission(ctx, "vehicles.delete");
    const { installationId } = await equipment.deleteEquipment(ctx, parseForm(z.object({ id: z.uuid() }), formData).id);
    redirect(`/app/instalaciones/${installationId}?equipo_borrado=1`);
  });
}

/** Buscar por QR o código: lleva a la ficha protegida (si el usuario puede verla). */
export async function findEquipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("equipment.find", async () => {
    const ctx = await requireOrg();
    const raw = String(formData.get("term") ?? "").trim();
    // El QR lleva la URL completa de la ficha; se acepta también el token o el código.
    const term = raw.match(/\/app\/equipos\/qr\/([a-f0-9]{64})/)?.[1] ?? raw;
    const found = await equipment.findEquipment(ctx, term);
    if (!found) return { status: "error", code: "not_found", message: "No hay ningún equipo con ese código o QR en tu empresa." };
    redirect(`/app/equipos/${found.id}`);
  });
}

export async function setActionSettingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("equipment.action_setting", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const input = parseForm(
      z.object({
        actionTypeId: z.uuid(),
        enabled: z.enum(["true", "false"]).transform((v) => v === "true"),
        intervalMonths: z.union([z.literal(""), z.coerce.number().int().min(1).max(600)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
      }),
      formData,
    );
    await equipment.setActionSetting(ctx, input.actionTypeId, input.enabled, input.intervalMonths);
    refresh();
    return { status: "success", message: "Guardado. Los vencimientos se han recalculado." };
  });
}
