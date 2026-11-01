import QRCode from "qrcode";
import { z } from "zod";
import { AppError } from "@/server/http/errors";
import { tenantRoute } from "@/server/http/tenant";
import { parseWith, searchParams } from "@/server/http/request";

/** Código QR del enlace de reseñas del negocio (SVG o PNG para imprimir). */
export const GET = tenantRoute(async (req, { business }) => {
  const { format, download } = parseWith(z.object({ format: z.enum(["svg", "png"]).default("svg"), download: z.enum(["1"]).optional() }), Object.fromEntries(searchParams(req)));
  if (!business.reviewUrl) throw new AppError("NOT_FOUND", "Configura primero el enlace de reseñas de tu negocio.");
  const opts = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#2E2A29", light: "#FFFFFF" } };
  const headers: Record<string, string> = { "cache-control": "private, max-age=300" };
  if (download) headers["content-disposition"] = `attachment; filename="qr-resenas.${format}"`;
  if (format === "png") {
    const buf = await QRCode.toBuffer(business.reviewUrl, { ...opts, width: 1200 });
    return new Response(new Uint8Array(buf), { headers: { ...headers, "content-type": "image/png" } });
  }
  return new Response(await QRCode.toString(business.reviewUrl, { ...opts, type: "svg" }), { headers: { ...headers, "content-type": "image/svg+xml" } });
});
