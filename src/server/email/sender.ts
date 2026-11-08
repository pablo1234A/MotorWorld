import "server-only";

import { sql } from "kysely";

import type { Tx } from "@/server/db/client";

import type { SenderConfig } from "./provider";

/**
 * Remitente y datos de marca de una empresa (mismas reglas que el dispatcher):
 * dominio propio solo si está VERIFICADO; si no, `<slug>@<dominio compartido>`
 * con el nombre de la empresa (P1). Nunca se usa un dominio sin verificar.
 */
export interface WorkshopSender {
  organizationId: string;
  branchId: string;
  name: string;
  fromAddress: string;
  from: string;
  replyTo: string | null;
  brandColor: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export function displayName(name: string): string {
  return `"${name.replace(/["\\\r\n]/g, "").slice(0, 70)}"`;
}

export async function resolveWorkshopSender(tx: Tx, organizationId: string, sender: SenderConfig, branchId?: string): Promise<WorkshopSender> {
  const { rows } = await sql<Omit<WorkshopSender, "from" | "fromAddress"> & { slug: string; custom_from: string | null }>`
    select b.id as "branchId", o.id as "organizationId", o.trade_name as name, o.slug::text as slug,
           o.brand_primary as "brandColor",
           coalesce(b.phone, o.phone) as phone,
           coalesce(bs.reply_to_email::text, b.email::text, o.email::text) as email,
           coalesce(bs.reply_to_email::text, b.email::text, o.email::text) as "replyTo",
           nullif(concat_ws(', ', coalesce(b.address_line1, o.address_line1), coalesce(b.city, o.city)), '') as address,
           case when bs.sender_mode = 'custom_domain' and sd.status = 'verified' then sd.from_local_part || '@' || sd.domain end as custom_from
      from organizations o
      join branches b on b.organization_id = o.id
      join branch_settings bs on bs.branch_id = b.id
      left join sending_domains sd on sd.id = bs.sending_domain_id
     where o.id = ${organizationId}
       and (${branchId ?? null}::uuid is null and b.is_primary or b.id = ${branchId ?? null}::uuid)
     limit 1
  `.execute(tx);
  const r = rows[0];
  if (!r) throw new Error("workshop_not_found");
  const fromAddress = r.custom_from ?? `${r.slug}@${sender.sharedDomain}`;
  return {
    organizationId: r.organizationId,
    branchId: r.branchId,
    name: r.name,
    fromAddress,
    from: `${displayName(r.name)} <${fromAddress}>`,
    replyTo: r.replyTo,
    brandColor: r.brandColor,
    address: r.address,
    phone: r.phone,
    email: r.email,
  };
}

/**
 * Remitente de los correos de la plataforma al propio taller (resúmenes,
 * avisos de consumo). La parte local lleva "_", que no puede aparecer en el
 * slug de una empresa: no puede coincidir con el remitente de ninguno.
 */
export function platformFrom(sender: SenderConfig): { from: string; address: string } {
  const address = `no_reply@${sender.sharedDomain}`;
  return { from: `"RevisaYa" <${address}>`, address };
}
