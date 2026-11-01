import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  const production = process.env.APP_ENV === "production";
  return {
    rules: production
      ? [{ userAgent: "*", allow: "/", disallow: ["/panel", "/admin", "/api", "/auth"] }]
      : [{ userAgent: "*", disallow: "/" }], // Entornos de prueba no indexables.
    sitemap: `${site.url}/sitemap.xml`,
  };
}
