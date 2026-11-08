"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, requireOrg } from "@/server/auth/guards";

import { API_SCOPES, createApiKey, revokeApiKey } from "./keys";

const createSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre (p. ej. «Programa de gestión»)").max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1, "Elige al menos un permiso"),
  branchIds: z.array(z.uuid()).default([]),
  expiresInDays: z.enum(["", "30", "90", "365"]).default(""),
});

/** Crea una clave; el valor completo vuelve UNA vez en `data` y no se guarda. */
export async function createApiKeyAction(_prev: ActionState<{ key: string }>, formData: FormData): Promise<ActionState<{ key: string }>> {
  return runAction("api_key.create", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const raw = { name: formData.get("name"), scopes: formData.getAll("scopes"), branchIds: formData.getAll("branchIds"), expiresInDays: formData.get("expiresInDays") ?? "" };
    const input = createSchema.parse(raw);
    const { key } = await createApiKey(ctx, {
      name: input.name,
      scopes: input.scopes,
      branchIds: input.branchIds.length ? input.branchIds : null,
      expiresAt: input.expiresInDays ? new Date(Date.now() + Number(input.expiresInDays) * 86_400_000) : null,
    });
    refresh();
    return { status: "success", message: "Clave creada. Cópiala ahora: no se volverá a mostrar.", data: { key } };
  });
}

export async function revokeApiKeyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("api_key.revoke", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    await revokeApiKey(ctx, parseForm(z.object({ id: z.uuid() }), formData).id);
    // El botón desaparece con la clave: el resultado viaja en la URL.
    redirect("/app/configuracion/api?revocada=1");
  });
}
