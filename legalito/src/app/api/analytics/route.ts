import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/observability";
import { ipHash } from "@/lib/request";

const ALLOWED = new Set(["page_view", "pricing_view", "purchase_view", "cta_click"]);
const BOT = /bot|crawler|spider|crawling|headless|lighthouse|preview/i;

const schema = z.object({
  name: z.string(),
  path: z.string().max(300).nullable().optional(),
  referrer: z.string().max(1000).nullable().optional(),
  utm_source: z.string().max(100).nullable().optional(),
  utm_medium: z.string().max(100).nullable().optional(),
  utm_campaign: z.string().max(100).nullable().optional(),
  props: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});

/** Recepción de eventos de analítica sin cookies. Solo nombres de evento permitidos. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return new NextResponse(null, { status: 204 });
  if (BOT.test(request.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) return new NextResponse(null, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success || !ALLOWED.has(parsed.data.name)) return new NextResponse(null, { status: 400 });
  if (!(await rateLimit(`analytics:${await ipHash()}`, 120, 600))) return new NextResponse(null, { status: 429 });

  let referrerHost: string | null = null;
  try {
    referrerHost = parsed.data.referrer ? new URL(parsed.data.referrer).host : null;
    if (referrerHost === request.nextUrl.host) referrerHost = null;
  } catch {
    referrerHost = null;
  }
  const user = await getSessionUser().catch(() => null);
  const path = parsed.data.path?.split("?")[0] ?? null;

  await createAdminClient()
    .from("analytics_events")
    .insert({
      name: parsed.data.name,
      path,
      referrer_host: referrerHost,
      utm_source: parsed.data.utm_source ?? null,
      utm_medium: parsed.data.utm_medium ?? null,
      utm_campaign: parsed.data.utm_campaign ?? null,
      user_id: user?.id ?? null,
      props: parsed.data.props ?? {},
    });
  return new NextResponse(null, { status: 204 });
}
