import type { OrganizationRow } from "@/lib/db/types";

/** Nombre visible de una cuenta (cliente de una agencia o negocio). */
export function accountLabel(org: Pick<OrganizationRow, "client_name" | "trade_name" | "legal_name">, fallback = "Tu negocio"): string {
  return org.client_name ?? org.trade_name ?? org.legal_name ?? fallback;
}

/** La cuenta es un cliente gestionado por una agencia. */
export function isClientAccount(org: Pick<OrganizationRow, "parent_organization_id">): boolean {
  return Boolean(org.parent_organization_id);
}
