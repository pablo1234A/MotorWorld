import { afterEach, describe, expect, it, vi } from "vitest";

import { assertTestMode, getStripe, LiveModeBlockedError, resetStripeClient } from "@/server/billing/stripe";
import { parseServerEnv } from "@/server/env";
import { downgradeBlockers } from "@/server/modules/billing/service";

const base = {
  APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
};

afterEach(() => {
  vi.unstubAllEnvs();
  resetStripeClient();
});

describe("pagos siempre en modo TEST", () => {
  it("un objeto o evento de Stripe en modo live se rechaza", () => {
    expect(() => assertTestMode({ livemode: true })).toThrow(LiveModeBlockedError);
    expect(() => assertTestMode({ livemode: false })).not.toThrow();
  });

  it("solo con PAYMENTS_LIVE_ENABLED=true se aceptarían (decisión del responsable adulto)", () => {
    vi.stubEnv("PAYMENTS_LIVE_ENABLED", "true");
    expect(() => assertTestMode({ livemode: true })).not.toThrow();
  });

  it("el cliente no arranca con una clave sk_live_ y sin clave no hay pagos", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_123");
    expect(() => getStripe()).toThrow("Clave LIVE de Stripe bloqueada");
    resetStripeClient();
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(getStripe()).toBeNull();
  });

  it("STRIPE_API_BASE (stripe-mock) está prohibido en producción", () => {
    expect(() => parseServerEnv({ ...base, APP_ENV: "production", STRIPE_API_BASE: "http://127.0.0.1:12111" })).toThrow("STRIPE_API_BASE");
    expect(parseServerEnv({ ...base, STRIPE_API_BASE: "http://127.0.0.1:12111", STRIPE_AUTOMATIC_TAX: "true" })).toMatchObject({ STRIPE_AUTOMATIC_TAX: true });
  });
});

describe("cambiar a un plan más pequeño", () => {
  it("indica exactamente qué sobra", () => {
    // PCI: los equipos en uso también tienen que caber en el plan nuevo.
    expect(downgradeBlockers("pro", { users: 1, branches: 1, customers: 1, activeVehicles: 0, equipment: 300 })).toEqual([]);
    expect(downgradeBlockers("pro", { users: 1, branches: 1, customers: 1, activeVehicles: 0, equipment: 301 })).toEqual(["tienes 301 equipos en uso y el plan Pro admite 300"]);
    expect(downgradeBlockers("pro", { users: 1, branches: 1, customers: 150, activeVehicles: 300 })).toEqual([]);
    const b = downgradeBlockers("pro", { users: 2, branches: 2, customers: 151, activeVehicles: 301 });
    expect(b).toHaveLength(4);
    expect(b[0]).toContain("2 usuarios");
    expect(downgradeBlockers("excelencia", { users: 99, branches: 99, customers: 1e6, activeVehicles: 1e6 })).toEqual([]);
  });
});
