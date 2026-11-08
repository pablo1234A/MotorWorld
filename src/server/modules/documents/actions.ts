"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import { requireOrg } from "@/server/auth/guards";
import { DomainError } from "@/server/db/errors";
import { enforceRateLimits, RATE_LIMITS } from "@/server/security/rate-limit";

import { deleteDocument, MAX_DOCUMENT_BYTES, uploadDocument } from "./service";

const schema = z.object({
  owner: z.enum(["installation", "equipment", "work_order", "record", "incident"]),
  ownerId: z.uuid(),
  title: z.string().trim().max(200).optional().transform((v) => v ?? ""),
});

/** Subir un documento o foto (también desde la cámara del móvil). La BD comprueba el permiso. */
export async function uploadDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("document.upload", async () => {
    const ctx = await requireOrg();
    const input = parseForm(schema, formData);
    const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new DomainError("validation_error", "document_missing");
    if (files.length > 10) throw new DomainError("validation_error", "document_too_many");
    await enforceRateLimits([[`documents:org:${ctx.membership.organizationId}`, RATE_LIMITS.documentUploadsPerOrg]]);
    for (const f of files) {
      if (f.size > MAX_DOCUMENT_BYTES) throw new DomainError("validation_error", "document_size");
      await uploadDocument(ctx, { owner: input.owner, ownerId: input.ownerId, title: input.title || f.name, bytes: Buffer.from(await f.arrayBuffer()) });
    }
    refresh();
    return { status: "success", message: files.length === 1 ? "Archivo subido." : `${files.length} archivos subidos.` };
  });
}

export async function deleteDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("document.delete", async () => {
    const ctx = await requireOrg();
    await deleteDocument(ctx, parseForm(z.object({ id: z.uuid() }), formData).id);
    refresh();
    return { status: "success", message: "Archivo retirado." };
  });
}
