import { z } from "zod";
import { handler, json, parseBody, rateLimit, requireUser } from "@/server/http";
import { searchImages, trackUnsplashDownload } from "@/server/integrations";

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  rateLimit(`images:${user.id}`, 60, 60 * 60_000);
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");
  const result = await searchImages(url.searchParams.get("q") ?? "", provider === "unsplash" || provider === "pexels" ? provider : undefined);
  return json(result);
});

/** Called when a stock photo is inserted (Unsplash API guideline: trigger the download event). */
export const POST = handler(async (req: Request) => {
  await requireUser(req);
  const { downloadLocation } = await parseBody(req, z.object({ downloadLocation: z.string().url().max(600) }));
  await trackUnsplashDownload(downloadLocation);
  return json({ ok: true });
});
