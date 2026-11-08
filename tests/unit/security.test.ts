import { describe, expect, it } from "vitest";

import { truncateIp } from "@/server/http/request";
import { reputationLevel } from "@/server/modules/email/notifications";

import { contentSecurityPolicy } from "../../next.config";

describe("seguridad (Fase 11)", () => {
  it("IP truncada para los registros", () => {
    expect(truncateIp("83.45.120.7")).toBe("83.45.120.0");
    expect(truncateIp("2a02:9130:abcd:1:2:3:4:5")).toBe("2a02:9130:abcd::");
    expect(truncateIp("unknown")).toBeNull();
  });

  it("umbrales de reputación del correo", () => {
    expect(reputationLevel(0.01, 0)).toBe("ok");
    expect(reputationLevel(0.04, 0.001)).toBe("ok");
    expect(reputationLevel(0.041, 0)).toBe("warning");
    expect(reputationLevel(0, 0.0011)).toBe("warning");
    expect(reputationLevel(0.08, 0)).toBe("critical");
    expect(reputationLevel(0, 0.003)).toBe("critical");
  });

  it("CSP: sin plugins, sin incrustar la web, formularios solo hacia la app y sus pasarelas", () => {
    const d = Object.fromEntries(contentSecurityPolicy.split("; ").map((x) => [x.split(" ")[0], x.split(" ").slice(1)]));
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'", "https://checkout.stripe.com", "https://billing.stripe.com", "https://accounts.google.com"]);
    expect(d["script-src"]).not.toContain("*");
    expect(d["connect-src"]).not.toContain("*");
  });
});
