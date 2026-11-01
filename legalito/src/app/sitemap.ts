import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { LANDINGS } from "@/content/landings";
import { LEGAL_PAGES } from "@/content/legal-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    { path: "/como-funciona", priority: 0.8, changeFrequency: "monthly" },
    { path: "/precios", priority: 0.9, changeFrequency: "monthly" },
    { path: "/preguntas-frecuentes", priority: 0.7, changeFrequency: "monthly" },
    { path: "/contacto", priority: 0.5, changeFrequency: "yearly" },
    ...LANDINGS.map((l) => ({ path: `/${l.slug}`, priority: 0.8, changeFrequency: "monthly" as const })),
    ...LEGAL_PAGES.map((p) => ({ path: `/legal/${p.slug}`, priority: 0.3, changeFrequency: "yearly" as const })),
  ];
  return pages.map((p) => ({ url: `${site.url}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority }));
}
