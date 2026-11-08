import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return ["", "/ayuda", "/registro", "/legal/aviso-legal", "/legal/privacidad", "/legal/terminos", "/legal/cookies", "/legal/encargo-tratamiento"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : 0.5,
  }));
}
