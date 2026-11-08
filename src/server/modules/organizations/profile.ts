import "server-only";

import { randomUUID } from "node:crypto";

import { sql } from "kysely";

import { detectImage, LOGO_MAX_BYTES, type OrganizationProfileInput } from "@/lib/validation/organization";
import type { OrgContext } from "@/server/auth/context";
import { assertOrgAdmin } from "@/server/auth/db-guards";
import { withRls, withSystem } from "@/server/db/client";
import { DomainError } from "@/server/db/errors";
import { logger } from "@/server/logger";
import type { ServiceCtx } from "@/server/modules/branches/service";
import { getObject, putObject, removeObject } from "@/server/storage";

/**
 * Datos de la empresa (PDF §5: logo, nombre y colores en el panel y en los
 * correos) y datos fiscales para los presupuestos. Solo administradores (RLS).
 */

type Ctx = ServiceCtx & Pick<OrgContext, "subscription">;

export interface OrganizationProfile {
  id: string;
  slug: string;
  tradeName: string;
  legalName: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  brandPrimary: string | null;
  logoPath: string | null;
}

export async function getProfile(ctx: Pick<Ctx, "auth" | "membership">): Promise<OrganizationProfile> {
  return withRls(ctx.auth, (tx) =>
    tx
      .selectFrom("organizations")
      .select([
        "id",
        sql<string>`slug::text`.as("slug"),
        "trade_name as tradeName",
        "legal_name as legalName",
        "tax_id as taxId",
        "address_line1 as addressLine1",
        "address_line2 as addressLine2",
        "postal_code as postalCode",
        "city",
        "province",
        "phone",
        sql<string | null>`email::text`.as("email"),
        "brand_primary as brandPrimary",
        "logo_path as logoPath",
      ])
      .where("id", "=", ctx.membership.organizationId)
      .executeTakeFirstOrThrow(),
  );
}

function assertWritable(ctx: Ctx) {
  if (!ctx.subscription.active) throw new DomainError("subscription_inactive");
}

export async function updateProfile(ctx: Ctx, input: OrganizationProfileInput): Promise<void> {
  assertWritable(ctx);
  await withRls(ctx.auth, async (tx) => {
    const res = await tx
      .updateTable("organizations")
      .set({
        trade_name: input.tradeName,
        legal_name: input.legalName,
        tax_id: input.taxId,
        address_line1: input.addressLine1,
        address_line2: input.addressLine2,
        postal_code: input.postalCode,
        city: input.city,
        province: input.province,
        phone: input.phone,
        email: input.email,
        brand_primary: input.brandPrimary,
      })
      .where("id", "=", ctx.membership.organizationId)
      .executeTakeFirst();
    // RLS: solo administradores (0 filas = sin permiso).
    if (Number(res.numUpdatedRows) === 0) throw new DomainError("permission_denied");
  });
}

/** Sube el logo (PNG, JPEG o WebP, máx. 1 MB; nunca SVG). Reemplaza el anterior. */
export async function uploadLogo(ctx: Ctx, file: File): Promise<void> {
  assertWritable(ctx);
  await assertOrgAdmin(ctx);
  if (file.size === 0) throw new DomainError("validation_error", "logo_empty");
  if (file.size > LOGO_MAX_BYTES) throw new DomainError("validation_error", "logo_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) throw new DomainError("validation_error", "logo_type");

  const orgId = ctx.membership.organizationId;
  const path = `${orgId}/logo-${randomUUID()}.${kind.ext}`;
  const previous = (await getProfile(ctx)).logoPath;
  await putObject("org-assets", path, Buffer.from(bytes), kind.mime);
  try {
    await withRls(ctx.auth, (tx) => tx.updateTable("organizations").set({ logo_path: path }).where("id", "=", orgId).execute());
  } catch (err) {
    await removeObject("org-assets", path).catch(() => undefined);
    throw err;
  }
  if (previous) await removeObject("org-assets", previous).catch((err) => logger.warn("logo_remove_failed", { error: err }));
}

export async function removeLogo(ctx: Ctx): Promise<void> {
  assertWritable(ctx);
  await assertOrgAdmin(ctx);
  const previous = (await getProfile(ctx)).logoPath;
  if (!previous) return;
  await withRls(ctx.auth, (tx) => tx.updateTable("organizations").set({ logo_path: null }).where("id", "=", ctx.membership.organizationId).execute());
  await removeObject("org-assets", previous).catch((err) => logger.warn("logo_remove_failed", { error: err }));
}

/**
 * URL pública del logo para correos, PDF y la página de citas. El logo es
 * marca pública de la empresa; el nombre del archivo cambia con cada subida
 * (caché sin riesgo de mostrar uno antiguo).
 */
export function logoUrl(appUrl: string, organizationId: string, logoPath: string | null): string | null {
  if (!logoPath) return null;
  const file = logoPath.split("/").pop()!;
  return new URL(`/api/public/logo/${organizationId}/${encodeURIComponent(file)}`, appUrl).toString();
}

/** Bytes del logo de una organización activa (para la ruta pública y los PDF). */
export async function readLogo(organizationId: string, file?: string): Promise<{ body: Buffer; contentType: string } | null> {
  const row = await withSystem((tx) =>
    tx.selectFrom("organizations").select("logo_path").where("id", "=", organizationId).where("status", "=", "active").executeTakeFirst(),
  );
  if (!row?.logo_path) return null;
  if (file && row.logo_path.split("/").pop() !== file) return null;
  return getObject("org-assets", row.logo_path);
}
