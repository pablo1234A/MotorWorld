"use server";

import { redirect } from "next/navigation";

import { createIncidentSchema, updateIncidentSchema } from "@/lib/validation/pci";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertPermission, requireOrg } from "@/server/auth/guards";

import * as incidents from "./service";

export async function createIncidentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "incident.create",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "incidents.write");
      const id = await incidents.createIncident(ctx, parseForm(createIncidentSchema, formData));
      redirect(`/app/incidencias/${id}?creada=1`);
    },
    formData,
  );
}

export async function updateIncidentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "incident.update",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "incidents.write");
      const input = parseForm(updateIncidentSchema, formData);
      await incidents.updateIncident(ctx, input);
      redirect(`/app/incidencias/${input.id}?guardada=1`);
    },
    formData,
  );
}
