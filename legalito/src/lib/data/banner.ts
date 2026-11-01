import "server-only";
import { requireOrganization } from "@/lib/auth";
import { accountLabel } from "@/lib/accounts";
import { getFormStatus, getMyEntitlements } from "@/lib/data/panel";
import { prepareInput } from "@/lib/documents/compose";
import { bannerVersion, categoriesFromCookieList, type BannerCategory } from "@/lib/cookie-banner";

export type BannerData =
  | { state: "no_subscription" }
  | { state: "no_form" }
  | {
      state: "ready";
      siteName: string;
      website: string;
      defaultPolicyUrl: string;
      categories: BannerCategory[];
      version: string;
      hasCmp: boolean;
      cmpName: string;
      unclassified: number;
    };

/** Datos del banner de la cuenta activa (incluido en las suscripciones; los clientes usan la de su agencia). */
export async function loadBannerData(): Promise<BannerData> {
  const { org } = await requireOrganization();
  const [ent, form] = await Promise.all([getMyEntitlements(), getFormStatus()]);
  const subscribed = Boolean(ent.subscription && ["active", "trialing"].includes(ent.subscription.status));
  if (!subscribed) return { state: "no_subscription" };
  if (!form.completed) return { state: "no_form" };
  const { context } = prepareInput(form.completed.answers);
  const categories = categoriesFromCookieList(context.cookies.list);
  const website = context.contact.website.replace(/\/$/, "");
  return {
    state: "ready",
    siteName: context.owner.display_name || accountLabel(org),
    website,
    defaultPolicyUrl: website ? `${website}/politica-de-cookies` : "/politica-de-cookies",
    categories,
    version: bannerVersion(categories),
    hasCmp: context.cookies.has_cmp,
    cmpName: context.cookies.cmp_name,
    unclassified: context.cookies.list.filter((c) => c.kind === "Por clasificar").length,
  };
}
