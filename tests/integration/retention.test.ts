import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as health } from "@/app/api/health/route";
import { closePool } from "@/server/db/client";
import type { EmailPort, OutboundEmail, SendResult } from "@/server/email/port";
import type { SenderConfig } from "@/server/email/provider";
import { purgeExpiredOrganizations, sendRetentionWarnings } from "@/server/modules/retention/service";

import { createOrg, query, type TestOrg } from "./support/db";

/** Fase 12: conservación de 60 días tras la baja (P9), aviso previo, salud y comprobación del entorno. */

class FakeEmail implements EmailPort {
  readonly name = "smtp" as const;
  sent: OutboundEmail[] = [];
  async send(e: OutboundEmail): Promise<SendResult> {
    this.sent.push(e);
    return { kind: "accepted", messageId: randomUUID() };
  }
}
const sender: SenderConfig = { sharedDomain: "avisos.revisaya.test", appUrl: "http://localhost:3000", linkSecret: "x".repeat(40) };

async function seed(o: TestOrg) {
  const [{ id: c }] = await query<{ id: string }>("insert into customers (organization_id, branch_id, first_name) values ($1, $2, 'Ana') returning id", [o.orgId, o.branchId]);
  await query("insert into vehicles (organization_id, branch_id, customer_id, plate) values ($1, $2, $3, $4)", [o.orgId, o.branchId, c, `${String(Math.floor(1000 + Math.random() * 8999))} RTN`]);
}

let expired: TestOrg;
let warned: TestOrg;
let returned: TestOrg;

beforeAll(async () => {
  expired = await createOrg("pro");
  warned = await createOrg("pro");
  returned = await createOrg("pro");
  for (const o of [expired, warned, returned]) await seed(o);
  await query("update subscriptions set status = 'canceled', ended_at = now() - interval '61 days' where organization_id = any($1)", [[expired.orgId, warned.orgId]]);
  await query("update organizations set data_retention_until = current_date - 1 where id = $1", [expired.orgId]);
  await query("update organizations set data_retention_until = current_date + 5 where id = $1", [warned.orgId]);
  // Volvió a contratar: aunque quede una fecha antigua, con suscripción activa no se borra nada.
  await query("update organizations set data_retention_until = current_date - 1 where id = $1", [returned.orgId]);
});
afterAll(closePool);

describe("conservación tras la baja (P9)", () => {
  it("avisa por correo 7 días antes, una sola vez", async () => {
    const email = new FakeEmail();
    await sendRetentionWarnings({ email, sender });
    const mine = email.sent.filter((m) => m.subject.startsWith("Tus datos en RevisaYa se borrarán"));
    expect(mine.length).toBeGreaterThanOrEqual(1);
    const again = new FakeEmail();
    await sendRetentionWarnings({ email: again, sender });
    expect(await query("select 1 from private.retention_notices where organization_id = $1", [warned.orgId])).toHaveLength(1);
    expect(again.sent.filter((m) => m.html.includes(warned.orgId))).toHaveLength(0);
  });

  it("al vencer borra los datos de negocio y conserva la organización, la suscripción y la auditoría", async () => {
    await purgeExpiredOrganizations();
    expect(await query("select 1 from customers where organization_id = $1", [expired.orgId])).toHaveLength(0);
    expect(await query("select 1 from vehicles where organization_id = $1", [expired.orgId])).toHaveLength(0);
    const [org] = await query<{ status: string; data_retention_until: string | null }>("select status, data_retention_until from organizations where id = $1", [expired.orgId]);
    expect(org).toMatchObject({ status: "deleted", data_retention_until: null });
    expect(await query("select 1 from subscriptions where organization_id = $1", [expired.orgId])).toHaveLength(1);
    expect(await query("select 1 from audit_logs where organization_id = $1 and action = 'organization.purged'", [expired.orgId])).toHaveLength(1);
    // Ni el que aún no ha vencido ni el que volvió a contratar pierden nada.
    expect(await query("select 1 from customers where organization_id = $1", [warned.orgId])).toHaveLength(1);
    expect(await query("select 1 from customers where organization_id = $1", [returned.orgId])).toHaveLength(1);
    await expect(query("select private.purge_organization_data($1)", [returned.orgId])).rejects.toThrow("retention_not_due");
  });
});

describe("producción", () => {
  it("/api/health responde con la base de datos", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
  });

  it("pnpm check:env detecta lo que falta sin mostrar valores", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-"));
    const file = join(dir, ".env");
    writeFileSync(file, ["APP_ENV=production", "APP_URL=http://revisaya.es", "NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=pk", "SUPABASE_SECRET_KEY=valor-secreto-123", "DATABASE_URL=postgresql://u:p@127.0.0.1:5432/db", "STRIPE_SECRET_KEY=sk_live_abc"].join("\n"));
    let out = "";
    try {
      execFileSync("node", ["--conditions=react-server", "--experimental-strip-types", "--no-warnings", "scripts/check-env.ts", file], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", NODE_ENV: "production" } });
    } catch (err) {
      out = (err as { stdout: string }).stdout;
    }
    expect(out).toContain("APP_URL: en producción tiene que ser https://");
    expect(out).toContain("Clave LIVE de Stripe bloqueada");
    expect(out).toContain("DATABASE_URL apunta a una base de datos local");
    expect(out).not.toContain("valor-secreto-123");
    expect(out).not.toContain("sk_live_abc");
  });
});
