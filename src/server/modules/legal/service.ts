import "server-only";

import { sql } from "kysely";

import { LEGAL_VERSION } from "@/config/legal";
import { withSystem } from "@/server/db/client";
import { logger } from "@/server/logger";

export type LegalDocument = "terms" | "privacy" | "dpa";

/** Deja constancia de que el usuario acepta los textos (versión, fecha e IP truncada). */
export async function recordAcceptance(userId: string, organizationId: string | null, documents: LegalDocument[], ip: string | null): Promise<void> {
  try {
    await withSystem(async (tx) => {
      for (const d of documents) {
        await sql`select app.record_legal_acceptance(${userId}::uuid, ${organizationId}::uuid, ${d}, ${LEGAL_VERSION}, ${ip}::inet)`.execute(tx);
      }
    });
  } catch (err) {
    // Un usuario inexistente (registro con un correo ya usado: Supabase no lo revela) no deja rastro.
    logger.warn("legal_acceptance_failed", { error: err });
  }
}
