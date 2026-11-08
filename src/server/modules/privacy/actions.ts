"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertAdmin, requireOrg } from "@/server/auth/guards";

import { eraseCustomer } from "./service";

/** Supresión inmediata a petición del cliente. Pide escribir BORRAR para confirmar. */
export async function eraseCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("customer.erase", async () => {
    const ctx = await requireOrg();
    assertAdmin(ctx);
    const { id } = parseForm(
      z.object({ id: z.uuid(), confirm: z.string().trim().toUpperCase().refine((v) => v === "BORRAR", "Escribe BORRAR para confirmar") }),
      formData,
    );
    await eraseCustomer(ctx, id);
    redirect("/app/clientes?suprimido=1");
  });
}
