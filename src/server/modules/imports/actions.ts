"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { IMPORT_COLUMNS, MAX_IMPORT_BYTES } from "@/lib/imports/columns";
import { planHasFeature } from "@/lib/plans";
import { type ActionState, parseForm, runAction } from "@/server/actions/result";
import type { OrgContext } from "@/server/auth/context";
import { assertPermission, requireOrg } from "@/server/auth/guards";
import { DomainError } from "@/server/db/errors";

import { listAccessibleBranches } from "../branches/service";
import * as imports from "./service";

/**
 * Importar exige `imports.run` y, para confirmar, poder crear clientes,
 * vehículos y revisiones (la confirmación escribe con RLS como el usuario).
 */
function assertCanImport(ctx: OrgContext) {
  assertPermission(ctx, "imports.run");
  if (!ctx.subscription.planCode || !planHasFeature(ctx.subscription.planCode, "import")) throw new DomainError("feature_unavailable", "import");
}

const batchId = z.object({ batchId: z.uuid() });

export async function uploadImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("import.upload", async (): Promise<ActionState> => {
    const ctx = await requireOrg();
    assertCanImport(ctx);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { status: "error", code: "validation_error", message: "Elige un archivo Excel (.xlsx) o CSV.", fieldErrors: { file: ["Elige un archivo"] } };
    }
    if (file.size > MAX_IMPORT_BYTES) throw new DomainError("import_file_invalid", "file_too_large");
    const branches = await listAccessibleBranches(ctx);
    const requested = formData.get("branchId");
    const branch = branches.find((b) => b.id === requested) ?? (branches.length === 1 ? branches[0] : undefined);
    if (!branch) return { status: "error", code: "validation_error", message: "Elige el taller al que importar.", fieldErrors: { branchId: ["Elige un taller"] } };

    const id = await imports.uploadImport(ctx, { branchId: branch.id, fileName: file.name, data: Buffer.from(await file.arrayBuffer()) });
    redirect(`/app/importar/${id}`);
  });
}

const rowValues = z.object({
  batchId: z.uuid(),
  rowNumber: z.coerce.number().int().min(1).max(5000),
  ...Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, z.string().max(300).optional()])),
});

export async function updateImportRowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("import.edit_row", async () => {
    const ctx = await requireOrg();
    assertCanImport(ctx);
    const input = parseForm(rowValues, formData);
    const values = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, (input as Record<string, unknown>)[c] as string | undefined]));
    await imports.updateRow(ctx, input.batchId, input.rowNumber, values);
    refresh();
    return { status: "success", message: `Fila ${input.rowNumber} corregida y revalidada.` };
  });
}

export async function toggleImportRowAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("import.exclude_row", async () => {
    const ctx = await requireOrg();
    assertCanImport(ctx);
    const input = parseForm(batchId.extend({ rowNumber: z.coerce.number().int().min(1), excluded: z.enum(["true", "false"]) }), formData);
    await imports.setRowExcluded(ctx, input.batchId, input.rowNumber, input.excluded === "true");
    refresh();
    return { status: "success" };
  });
}

export async function setImportOptionsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("import.options", async () => {
    const ctx = await requireOrg();
    assertCanImport(ctx);
    const input = parseForm(batchId.extend({ allowNoEmail: z.enum(["true", "false"]) }), formData);
    await imports.setOptions(ctx, input.batchId, { allowNoEmail: input.allowNoEmail === "true" });
    refresh();
    return { status: "success" };
  });
}

export async function commitImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("import.commit", async () => {
    const ctx = await requireOrg();
    assertCanImport(ctx);
    assertPermission(ctx, "customers.write");
    assertPermission(ctx, "vehicles.write");
    assertPermission(ctx, "maintenance.write");
    const input = parseForm(batchId.extend({ allowRepeat: z.literal("on").optional() }), formData);
    const batch = await imports.getBatch(ctx, input.batchId);
    if (!batch) throw new DomainError("not_found");
    const limits = await imports.checkLimits(ctx, ctx.subscription.planCode, batch.summary);
    if (!limits.ok) {
      throw new DomainError("plan_limit_reached", limits.customersAvailable !== null && limits.customersNew > limits.customersAvailable ? "customers" : "active_vehicles");
    }
    await imports.commitImport(ctx, input.batchId, input.allowRepeat === "on");
    redirect(`/app/importar/${input.batchId}?confirmada=1`);
  });
}

export async function cancelImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("import.cancel", async () => {
    const ctx = await requireOrg();
    assertCanImport(ctx);
    const { batchId: id } = parseForm(batchId, formData);
    await imports.cancelImport(ctx, id);
    redirect("/app/importar?cancelada=1");
  });
}
