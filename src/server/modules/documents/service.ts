import "server-only";

import { randomUUID } from "node:crypto";

import { withRls } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { putObject, removeObject, signedUrl } from "@/server/storage";

import type { ServiceCtx } from "../branches/service";

/**
 * Documentos y fotografías de instalaciones, equipos, órdenes, actuaciones e
 * incidencias. Storage PRIVADO (bucket «documents», ruta que empieza por el id
 * del taller); se descargan con una URL firmada de 60 s tras comprobar con la
 * RLS que el usuario puede ver el documento. El tipo se comprueba por su
 * contenido (firma del archivo), no por la extensión.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export type DocumentOwner = "installation" | "equipment" | "work_order" | "record" | "incident";

const KINDS: Array<{ mime: string; ext: string; test: (b: Buffer) => boolean }> = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

export function detectFile(bytes: Buffer): { mime: string; ext: string } | null {
  const k = KINDS.find((x) => x.test(bytes));
  return k ? { mime: k.mime, ext: k.ext } : null;
}

const TABLE: Record<DocumentOwner, "installations" | "equipment" | "work_orders" | "equipment_maintenance_records" | "equipment_incidents"> = {
  installation: "installations",
  equipment: "equipment",
  work_order: "work_orders",
  record: "equipment_maintenance_records",
  incident: "equipment_incidents",
};
const COLUMN: Record<DocumentOwner, "installation_id" | "equipment_id" | "work_order_id" | "record_id" | "incident_id"> = {
  installation: "installation_id",
  equipment: "equipment_id",
  work_order: "work_order_id",
  record: "record_id",
  incident: "incident_id",
};

export async function uploadDocument(
  ctx: ServiceCtx,
  input: { owner: DocumentOwner; ownerId: string; title: string; bytes: Buffer; kind?: "document" | "photo" | "report" },
): Promise<string> {
  if (input.bytes.length === 0 || input.bytes.length > MAX_DOCUMENT_BYTES) throw new DomainError("validation_error", "document_size");
  const type = detectFile(input.bytes);
  if (!type) throw new DomainError("validation_error", "document_type");
  const orgId = ctx.membership.organizationId;
  // La entidad tiene que ser visible para el usuario (RLS); de ella sale la sucursal.
  const owner = await withRls(ctx.auth, (tx) =>
    tx.selectFrom(TABLE[input.owner]).select(["branch_id"]).where("id", "=", input.ownerId).where("organization_id", "=", orgId).executeTakeFirst(),
  );
  if (!owner) throw new DomainError("not_found");
  const path = `${orgId}/pci/${randomUUID()}.${type.ext}`;
  await putObject("documents", path, input.bytes, type.mime);
  try {
    return await withRls(ctx.auth, async (tx) => {
      const r = await tx
        .insertInto("pci_documents")
        .values({
          organization_id: orgId,
          branch_id: owner.branch_id,
          [COLUMN[input.owner]]: input.ownerId,
          kind: input.kind ?? (type.mime.startsWith("image/") ? "photo" : "document"),
          title: input.title.slice(0, 200) || "Documento",
          storage_path: path,
          mime_type: type.mime,
          size_bytes: input.bytes.length,
          uploaded_by: ctx.auth.userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return r.id;
    });
  } catch (err) {
    await removeObject("documents", path).catch(() => undefined);
    throw err;
  }
}

export interface DocumentRow {
  id: string;
  kind: string;
  title: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export async function listDocuments(ctx: ServiceCtx, owner: DocumentOwner, ownerId: string): Promise<DocumentRow[]> {
  return withRls(ctx.auth, async (tx) => {
    const rows = await tx
      .selectFrom("pci_documents")
      .select(["id", "kind", "title", "mime_type", "size_bytes", "created_at"])
      .where("organization_id", "=", ctx.membership.organizationId)
      .where(COLUMN[owner], "=", ownerId)
      .where("deleted_at", "is", null)
      .orderBy("created_at", "desc")
      .execute();
    return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, mimeType: r.mime_type, sizeBytes: r.size_bytes, createdAt: r.created_at }));
  });
}

/** URL firmada (60 s) si el usuario puede ver el documento; si no, null. */
export async function documentUrl(ctx: ServiceCtx, id: string): Promise<string | null> {
  const doc = await withRls(ctx.auth, (tx) =>
    tx.selectFrom("pci_documents").select(["storage_path", "title", "mime_type"]).where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId).where("deleted_at", "is", null).executeTakeFirst(),
  );
  if (!doc) return null;
  return signedUrl("documents", doc.storage_path, 60);
}

export async function deleteDocument(ctx: ServiceCtx, id: string): Promise<void> {
  await withRls(ctx.auth, async (tx) => {
    const r = await tx.updateTable("pci_documents").set({ deleted_at: new Date() }).where("id", "=", id)
      .where("organization_id", "=", ctx.membership.organizationId).where("deleted_at", "is", null).executeTakeFirst();
    if (Number(r.numUpdatedRows) === 0) throw new DomainError("not_found");
  });
}
