"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { quoteSchema } from "@/lib/validation/quotes";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { assertPermission, requireOrg } from "@/server/auth/guards";
import { getEmailProvider, getSenderConfig } from "@/server/email/provider";
import { NOTIFY_MESSAGES } from "@/server/modules/appointments/notify";

import { emailQuote, issueQuote } from "./issue";
import * as quotes from "./service";

const idSchema = z.object({ id: z.uuid() });

async function manager() {
  const ctx = await requireOrg();
  assertPermission(ctx, "quotes.manage");
  return ctx;
}

export async function saveQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    "quote.save",
    async () => {
      const ctx = await manager();
      const input = parseForm(quoteSchema, formData);
      const id = formData.get("id");
      if (typeof id === "string" && id) {
        await quotes.updateQuote(ctx, z.uuid().parse(id), input);
        refresh();
        return { status: "success", message: "Borrador guardado." };
      }
      const created = await quotes.createQuote(ctx, input);
      redirect(`/app/presupuestos/${created}?guardado=1`);
    },
    formData,
  );
}

export async function issueQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("quote.issue", async () => {
    const ctx = await manager();
    const { id, send } = parseForm(idSchema.extend({ send: z.enum(["true", "false"]).optional() }), formData);
    await issueQuote(ctx, id);
    const outcome = send === "true" ? await emailQuote(ctx, id, { email: getEmailProvider(), sender: getSenderConfig() }) : null;
    // El formulario de emisión desaparece al emitir: el resultado va en la URL.
    redirect(`/app/presupuestos/${id}?emitido=1${outcome ? `&aviso=${outcome}` : ""}`);
  });
}

export async function emailQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("quote.email", async () => {
    const ctx = await manager();
    const { id } = parseForm(idSchema, formData);
    const outcome = await emailQuote(ctx, id, { email: getEmailProvider(), sender: getSenderConfig() });
    return outcome === "sent" ? { status: "success", message: "Presupuesto enviado al cliente con el PDF adjunto." } : { status: "error", code: outcome, message: NOTIFY_MESSAGES[outcome] };
  });
}

export async function decideQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("quote.decision", async () => {
    const ctx = await manager();
    const { id, decision } = parseForm(idSchema.extend({ decision: z.enum(["accepted", "rejected"]) }), formData);
    await quotes.setDecision(ctx, id, decision);
    refresh();
    return { status: "success", message: decision === "accepted" ? "Marcado como aceptado." : "Marcado como rechazado." };
  });
}

export async function duplicateQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("quote.duplicate", async () => {
    const ctx = await manager();
    const id = await quotes.duplicateQuote(ctx, parseForm(idSchema, formData).id);
    redirect(`/app/presupuestos/${id}?duplicado=1`);
  });
}

export async function deleteQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("quote.delete", async () => {
    const ctx = await manager();
    await quotes.deleteDraft(ctx, parseForm(idSchema, formData).id);
    redirect("/app/presupuestos?borrado=1");
  });
}
