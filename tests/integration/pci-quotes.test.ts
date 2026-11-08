import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SubscriptionState } from "@/server/auth/context";
import { closePool } from "@/server/db/client";
import * as quotes from "@/server/modules/quotes/service";

import { createOrg, ownerMemberId, query, type TestOrg } from "./support/db";

/** PCI · presupuestos ligados a una instalación, con tipo de línea. */
const sub: SubscriptionState = { planCode: "pro", status: "active", active: true, trialEnd: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
let org: TestOrg;
let ctx: Parameters<typeof quotes.createQuote>[0];
let customerA: string;
let customerB: string;
let installationA: string;

beforeAll(async () => {
  org = await createOrg("pro");
  ctx = { auth: { userId: org.ownerId }, membership: { organizationId: org.orgId, memberId: await ownerMemberId(org), role: "admin", permissions: [] }, subscription: sub } as never;
  [{ id: customerA }] = await query<{ id: string }>("insert into customers (organization_id, branch_id, first_name) values ($1, $2, 'Hotel Sol') returning id", [org.orgId, org.branchId]);
  [{ id: customerB }] = await query<{ id: string }>("insert into customers (organization_id, branch_id, first_name) values ($1, $2, 'Otro') returning id", [org.orgId, org.branchId]);
  [{ id: installationA }] = await query<{ id: string }>(
    "insert into installations (organization_id, branch_id, customer_id, name, address_line1, city) values ($1, $2, $3, 'Edificio principal', 'Av. del Mar 10', 'Málaga') returning id",
    [org.orgId, org.branchId, customerA],
  );
});
afterAll(closePool);

const line = { description: "Mantenimiento anual de extintores", quantity: "12", unitPrice: "8.50", taxRate: 21 };

describe("PCI: presupuestos", () => {
  it("guarda la instalación y el tipo de cada línea", async () => {
    const id = await quotes.createQuote(ctx, {
      customerId: customerA, vehicleId: null, installationId: installationA, issueDate: "2026-11-08", validUntil: "2026-12-08", notes: null,
      items: [line, { ...line, description: "Extintor polvo ABC 6 kg", quantity: "2", unitPrice: "35", lineKind: "material" }],
    });
    const q = await quotes.getQuote(ctx, id);
    expect(q?.installation).toMatchObject({ id: installationA, name: "Edificio principal" });
    expect(q?.items.map((i) => i.lineKind)).toEqual(["service", "material"]);
    const snap = await quotes.buildSnapshot(ctx, q!);
    expect(snap.installation).toMatchObject({ name: "Edificio principal" });
  });

  it("no admite la instalación de otro cliente", async () => {
    await expect(
      quotes.createQuote(ctx, { customerId: customerB, vehicleId: null, installationId: installationA, issueDate: "2026-11-08", validUntil: "2026-12-08", notes: null, items: [line] }),
    ).rejects.toMatchObject({ code: "integrity_violation", detail: "installation_customer_mismatch" });
  });
});
