import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { prisma } from "@/server/db";
import { redis } from "@/server/redis";
import { resetEnvCache } from "@/server/env";
import { decrypt } from "@/server/crypto";
import { namesMatch, startReviewsOAuth, completeReviewsOAuth, syncReviews } from "@/server/modules/reviews";
import { GET as listRoute } from "@/app/api/v1/reviews/route";
import { POST as replyRoute } from "@/app/api/v1/reviews/[id]/reply/route";
import { ctx, makeCustomer, makeTenant, req, resetDb } from "../helpers";

/** Servidor local que reproduce los contratos de Google OAuth y Business Profile. */
const calls: { method: string; url: string; body: string }[] = [];
let server: http.Server;
const now = Date.now();
const iso = (d: number) => new Date(now - d * 86400_000).toISOString();

beforeAll(async () => {
  server = http.createServer((rq, rs) => {
    let body = "";
    rq.on("data", (c) => (body += c));
    rq.on("end", () => {
      calls.push({ method: rq.method!, url: rq.url!, body });
      const json = (st: number, j: unknown) => {
        rs.writeHead(st, { "content-type": "application/json" });
        rs.end(JSON.stringify(j));
      };
      const u = rq.url!;
      if (u === "/token") return json(200, { access_token: "ya29.gbp", expires_in: 3599, refresh_token: "1//gbp", scope: "openid email https://www.googleapis.com/auth/business.manage" });
      if (u === "/userinfo") return json(200, { email: "Duena@Gmail.com" });
      if (u === "/acct/v1/accounts") return json(200, { accounts: [{ name: "accounts/111", accountName: "Peluquería" }] });
      if (u.startsWith("/info/v1/accounts/111/locations")) return json(200, { locations: [{ name: "locations/222", title: "Peluquería Marta · Sevilla" }] });
      if (u.startsWith("/gbp/v4/accounts/111/locations/222/reviews?")) {
        if (!u.includes("pageToken"))
          return json(200, {
            averageRating: 4.6, totalReviewCount: 87, nextPageToken: "p2",
            reviews: [
              { name: "accounts/111/locations/222/reviews/r1", reviewer: { displayName: "Laura M." }, starRating: "FIVE", comment: "¡Genial!", createTime: iso(2), updateTime: iso(2) },
              { name: "accounts/111/locations/222/reviews/r2", reviewer: { isAnonymous: true }, starRating: "THREE", createTime: iso(4), updateTime: iso(4) },
            ],
          });
        return json(200, { reviews: [{ name: "accounts/111/locations/222/reviews/r3", reviewer: { displayName: "Pedro Ruiz" }, starRating: "FOUR", createTime: iso(10), updateTime: iso(9), reviewReply: { comment: "Gracias", updateTime: iso(9) } }] });
      }
      if (rq.method === "PUT" && u === "/gbp/v4/accounts/111/locations/222/reviews/r1/reply") return json(200, { comment: JSON.parse(body).comment, updateTime: new Date().toISOString() });
      json(404, { error: { message: "no" } });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  Object.assign(process.env, {
    GOOGLE_OAUTH_TOKEN_URL: `${base}/token`,
    GOOGLE_USERINFO_URL: `${base}/userinfo`,
    GOOGLE_ACCOUNT_MGMT_API_URL: `${base}/acct`,
    GOOGLE_BUSINESS_INFO_API_URL: `${base}/info`,
    GOOGLE_BUSINESS_API_URL: `${base}/gbp`,
  });
  resetEnvCache();
});
afterAll(async () => {
  for (const k of ["GOOGLE_OAUTH_TOKEN_URL", "GOOGLE_USERINFO_URL", "GOOGLE_ACCOUNT_MGMT_API_URL", "GOOGLE_BUSINESS_INFO_API_URL", "GOOGLE_BUSINESS_API_URL"]) delete process.env[k];
  resetEnvCache();
  server.close();
  redis().disconnect();
});
beforeEach(async () => {
  await resetDb();
  calls.length = 0;
});

describe("Google Business Profile", () => {
  it("atribución por nombre: solo coincidencias claras", () => {
    expect(namesMatch("Laura M.", "Laura Martín")).toBe(true);
    expect(namesMatch("laura martin", "Laura Martín")).toBe(true);
    expect(namesMatch("Laura", "Laura Martín")).toBe(false);
    expect(namesMatch("Laura P.", "Laura Martín")).toBe(false);
  });

  it("conecta, elige la ficha automáticamente, sincroniza reseñas reales y estima la atribución", async () => {
    const t = await makeTenant({ plan: "PRO" });
    const c = await makeCustomer(t.business.id, 1, { name: "Laura Martín" });
    await prisma.emailJob.create({
      data: { businessId: t.business.id, customerId: c.id, dedupeKey: "k1", publicToken: "tok-laura-123", toEmail: c.email, toName: c.name, subject: "s", bodyText: "b", bodyHtml: "b", reviewUrl: "https://g.page/x", status: "SENT", sentAt: new Date(now - 5 * 86400_000), scheduledFor: new Date() },
    });
    const url = new URL(await startReviewsOAuth(t.business.id, t.user.id));
    expect(url.searchParams.get("scope")).toContain("business.manage");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3999/api/v1/reviews/callback");
    await expect(completeReviewsOAuth({ state: "falso", code: "c", userId: t.user.id })).rejects.toThrow(/caducado/);
    await completeReviewsOAuth({ state: url.searchParams.get("state")!, code: "c", userId: t.user.id });

    const src = await prisma.reviewSource.findUniqueOrThrow({ where: { businessId: t.business.id } });
    expect(src.locationName).toBe("locations/222");
    expect(src.locationTitle).toBe("Peluquería Marta · Sevilla");
    expect(decrypt(src.refreshTokenEnc!)).toBe("1//gbp");
    expect([src.averageRating, src.totalReviewCount]).toEqual([4.6, 87]);
    const reviews = await prisma.review.findMany({ where: { businessId: t.business.id }, orderBy: { createTime: "desc" } });
    expect(reviews.map((r) => [r.reviewerName, r.starRating])).toEqual([["Laura M.", 5], ["Anónimo", 3], ["Pedro Ruiz", 4]]);
    expect(reviews[0].attributedJobId).not.toBeNull();
    expect(reviews[2].replyComment).toBe("Gracias");

    // Idempotente: volver a sincronizar no duplica
    await syncReviews(t.business.id);
    expect(await prisma.review.count({ where: { businessId: t.business.id } })).toBe(3);

    const list = await (await listRoute(req("/api/v1/reviews", { cookie: t.cookie }), ctx())).json();
    expect(list.summary.recentCount).toBe(3);
    expect(list.summary.attributedRecent).toBe(1);
    expect(list.summary.recentAverage).toBe(4);

    const res = await replyRoute(req(`/api/v1/reviews/${reviews[0].id}/reply`, { method: "POST", cookie: t.cookie, json: { comment: "¡Gracias, Laura!" } }), ctx({ id: reviews[0].id }));
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.method === "PUT")!.body).toBe(JSON.stringify({ comment: "¡Gracias, Laura!" }));
    expect((await prisma.review.findUniqueOrThrow({ where: { id: reviews[0].id } })).replyComment).toBe("¡Gracias, Laura!");
  });

  it("Starter puede ver reseñas pero no responderlas; otro negocio no puede tocarlas", async () => {
    const t = await makeTenant({ plan: "STARTER" });
    const url = new URL(await startReviewsOAuth(t.business.id, t.user.id));
    await completeReviewsOAuth({ state: url.searchParams.get("state")!, code: "c", userId: t.user.id });
    const r = await prisma.review.findFirstOrThrow({ where: { businessId: t.business.id } });
    expect((await replyRoute(req(`/api/v1/reviews/${r.id}/reply`, { method: "POST", cookie: t.cookie, json: { comment: "Hola" } }), ctx({ id: r.id }))).status).toBe(403);
    const other = await makeTenant({ plan: "PRO" });
    expect((await replyRoute(req(`/api/v1/reviews/${r.id}/reply`, { method: "POST", cookie: other.cookie, json: { comment: "Hola" } }), ctx({ id: r.id }))).status).toBe(404);
  });
});
