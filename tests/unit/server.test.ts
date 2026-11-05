import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));

describe("password hashing", () => {
  it("hashes with scrypt and verifies", async () => {
    const { hashPassword, verifyPassword } = await import("@/server/auth");
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await hashPassword("correct horse battery")).not.toBe(h); // salted
  });
});

describe("upload type sniffing", () => {
  it("identifies files by magic bytes, not by name", async () => {
    const { sniff } = await import("@/server/storage");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniff(png)?.mime).toBe("image/png");
    expect(sniff(jpg)?.mime).toBe("image/jpeg");
    expect(sniff(html)).toBeNull();
    expect(sniff(svg)).toBeNull();
  });
});
