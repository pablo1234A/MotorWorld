import { requireApiSession } from "@/server/auth/session";
import { limitUser, parseQuery, route } from "@/server/http/handler";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { exportWorkspaceListings } from "@/server/services/listings";
import { listingExportSchema } from "@/validation/schemas";

export const GET = route(async (request) => {
  const context = await requireApiSession();
  await limitUser(RATE_LIMITS.export, context.user.id);
  const filters = parseQuery(request, listingExportSchema);
  const file = await exportWorkspaceListings(context, filters);
  const name = `anunciapro-anuncios-${new Date().toISOString().slice(0, 10)}${filters.format === "shopify_csv" ? "-shopify" : ""}.${file.extension}`;
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
