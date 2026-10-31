import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { logger } from "../logger";
import { clientIp, userAgent } from "../http/request";

export type AuditInput = {
  action: string;
  userId?: string | null;
  businessId?: string | null;
  targetType?: string;
  targetId?: string;
  meta?: Prisma.InputJsonValue;
  req?: Request;
};

/** Registro de actividad. Nunca debe interrumpir la operación principal. */
export async function audit(input: AuditInput, tx?: Tx) {
  try {
    await (tx ?? prisma).auditLog.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        businessId: input.businessId ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        meta: input.meta,
        ip: input.req ? clientIp(input.req) : null,
        userAgent: input.req ? userAgent(input.req) : null,
      },
    });
  } catch (err) {
    logger.warn({ err, action: input.action }, "no se pudo registrar auditoría");
  }
}
