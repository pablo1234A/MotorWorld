import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: ["/", "/legal/", "/ayuda", "/t/"], disallow: ["/app", "/api/", "/onboarding", "/cuenta", "/invitacion", "/baja"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
