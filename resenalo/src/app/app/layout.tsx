import Link from "next/link";
import { prisma } from "@/server/db";
import { requirePageTenant } from "@/server/auth/page-auth";
import { subscriptionAllowsSending } from "@/server/modules/billing/entitlements";
import { Sidebar } from "@/components/app/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requirePageTenant();
  const [sub, conn] = await Promise.all([
    prisma.subscription.findUnique({ where: { businessId: business.id }, include: { plan: true } }),
    prisma.emailConnection.findUnique({ where: { businessId: business.id }, select: { status: true, emailAddress: true } }),
  ]);
  const canSend = subscriptionAllowsSending(sub);
  const banners: { tone: string; text: string; href: string; cta: string }[] = [];
  if (!sub || sub.status === "CANCELED" || sub.status === "INCOMPLETE_EXPIRED")
    banners.push({ tone: "warn", text: "No tienes una suscripción activa: los envíos están desactivados.", href: "/app/facturacion", cta: "Elegir plan" });
  else if (!canSend) banners.push({ tone: "bad", text: "Hay un problema con el pago de tu suscripción. Los envíos están en pausa.", href: "/app/facturacion", cta: "Revisar pago" });
  if (!conn || conn.status === "DISCONNECTED") banners.push({ tone: "warn", text: "No hay ninguna cuenta de correo conectada.", href: "/app/conexion-correo", cta: "Conectar correo" });
  else if (conn.status === "NEEDS_REAUTH")
    banners.push({ tone: "bad", text: `Hemos perdido la autorización de ${conn.emailAddress}. Los envíos están en espera.`, href: "/app/conexion-correo", cta: "Reconectar" });

  return (
    <div className="min-h-[100dvh]">
      <Sidebar user={{ name: user.name, email: user.email }} business={{ name: business.name }} plan={sub && canSend ? sub.plan.name : null} />
      <div className="lg:pl-[264px]">
        {banners.length ? (
          <div className="space-y-px">
            {banners.map((b) => (
              <div key={b.text} className={b.tone === "bad" ? "bg-bad-50 text-bad-700" : "bg-warn-50 text-warn-700"}>
                <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-8">
                  <span>{b.text}</span>
                  <Link href={b.href} className="font-semibold underline underline-offset-2">{b.cta}</Link>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <main id="contenido" className="mx-auto max-w-[1100px] px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
