"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createInstallationSchema, updateInstallationSchema } from "@/lib/validation/pci";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertPermission, requireOrg } from "@/server/auth/guards";

import * as installations from "./service";

export async function createInstallationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "installation.create",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "customers.write");
      const id = await installations.createInstallation(ctx, parseForm(createInstallationSchema, formData));
      redirect(`/app/instalaciones/${id}?creada=1`);
    },
    formData,
  );
}

export async function updateInstallationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "installation.update",
    async () => {
      const ctx = await requireOrg();
      assertPermission(ctx, "customers.write");
      const input = parseForm(updateInstallationSchema, formData);
      await installations.updateInstallation(ctx, input);
      redirect(`/app/instalaciones/${input.id}?guardada=1`);
    },
    formData,
  );
}

export async function deleteInstallationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("installation.delete", async () => {
    const ctx = await requireOrg();
    assertPermission(ctx, "customers.delete");
    const { customerId } = await installations.deleteInstallation(ctx, parseForm(z.object({ id: z.uuid() }), formData).id);
    redirect(`/app/clientes/${customerId}?instalacion_borrada=1`);
  });
}
