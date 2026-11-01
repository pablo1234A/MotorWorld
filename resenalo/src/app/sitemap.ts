import type { MetadataRoute } from "next";
import { LEGAL_PAGES } from "@/config/legal";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/registro`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.3 },
    ...LEGAL_PAGES.map((p) => ({ url: `${base}/legal/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
