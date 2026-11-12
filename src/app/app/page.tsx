import { ArrowUpRight, FileStack, Megaphone, Package, PenLine, Sparkles, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ActivityChart } from "@/components/app/charts";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, Notice, ProgressBar } from "@/components/ui/primitives";
import { canUseBulk, usagePercent } from "@/domain/plans";
import { formatDate, formatNumber, formatRelative } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";
import { getDashboardStats, getRecentActivity } from "@/server/services/stats";
import { getUsage } from "@/server/services/usage";

function Stat({ icon: Icon, label, value, hint, href }: { icon: LucideIcon; label: string; value: string; hint?: string; href: string }) {
  return (
    <Link href={href} className="group rounded-card border border-line bg-surface p-5 shadow-card transition-colors hover:border-line-strong">
      <div className="flex items-center justify-between text-muted">
        <span className="text-[13px] font-medium">{label}</span>
        <Icon className="size-4" aria-hidden />
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Link>
  );
}

const QUICK = [
  { href: "/app/crear", icon: PenLine, title: "Crear anuncio", text: "Genera un anuncio a partir de un producto." },
  { href: "/app/productos", icon: Package, title: "Mi catálogo", text: "Consulta, edita y organiza tus productos." },
  { href: "/app/masivo", icon: FileStack, title: "Generación masiva", text: "Importa un CSV y genera anuncios por lotes." },
];

const ACTIVITY_ICON = { listing: Megaphone, product: Package, job: FileStack } as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ clave?: string }> }) {
  const context = await requireSession();
  const [stats, usage, activity, params] = await Promise.all([getDashboardStats(context), getUsage(context.supabase, context.workspace.id), getRecentActivity(context), searchParams]);
  const percent = usagePercent(usage);
  const firstName = context.profile.full_name.split(" ")[0];
  const hasActivity = stats.activityByDay.some((point) => point.listings + point.products > 0);

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight">{firstName ? `Hola, ${firstName}` : "Hola"}</h1>
          <p className="mt-1.5 text-sm text-muted">Este es el estado de tu espacio «{context.workspace.name}».</p>
        </div>
        <ButtonLink href="/app/crear" variant="brand">
          <Sparkles aria-hidden /> Crear anuncio
        </ButtonLink>
      </div>

      {params.clave === "actualizada" ? (
        <Notice tone="success" className="mb-6">
          Tu contraseña se ha actualizado correctamente.
        </Notice>
      ) : null}
      {percent >= 100 ? (
        <Notice tone="danger" className="mb-6" title="Has agotado las generaciones de este mes">
          Podrás volver a generar anuncios el {formatDate(usage.periodEnd)}. Mientras tanto puedes seguir editando, copiando y exportando. <Link href="/app/cuenta#plan">Ver mi plan</Link>
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Package} label="Productos registrados" value={formatNumber(stats.productsTotal)} hint={stats.productsArchived ? `${formatNumber(stats.productsArchived)} archivados` : "En tu catálogo activo"} href="/app/productos" />
        <Stat icon={Megaphone} label="Anuncios generados" value={formatNumber(stats.listingsTotal)} hint="Total guardados" href="/app/anuncios" />
        <Stat icon={Sparkles} label="Anuncios este mes" value={formatNumber(stats.listingsThisMonth)} hint="Creados desde el día 1" href="/app/estadisticas" />
        <Link href="/app/cuenta#plan" className="rounded-card border border-line bg-surface p-5 shadow-card transition-colors hover:border-line-strong">
          <div className="flex items-center justify-between text-muted">
            <span className="text-[13px] font-medium">Uso mensual · {usage.planName}</span>
            <ArrowUpRight className="size-4" aria-hidden />
          </div>
          <p className="mt-3 font-display text-3xl font-semibold tabular-nums tracking-tight">
            {formatNumber(usage.used)}
            <span className="text-lg font-medium text-faint"> / {formatNumber(usage.monthlyListingLimit)}</span>
          </p>
          <ProgressBar value={percent} tone={percent >= 100 ? "danger" : percent >= 80 ? "warning" : "brand"} label="Generaciones usadas" className="mt-2.5" />
          <p className="mt-2 text-xs text-muted">
            Te quedan {formatNumber(usage.remaining)} · se renueva el {formatDate(usage.periodEnd, { day: "numeric", month: "short" })}
          </p>
        </Link>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Actividad de los últimos 30 días" description="Productos y anuncios creados por día." action={<Link href="/app/estadisticas" className="text-[13px] font-medium text-brand-strong hover:underline">Ver estadísticas</Link>} />
          <div className="p-5">
            {hasActivity ? (
              <ActivityChart data={stats.activityByDay} />
            ) : (
              <EmptyState icon={Sparkles} title="Todavía no hay actividad" description="Cuando crees productos y anuncios, aquí verás su evolución diaria." action={<ButtonLink href="/app/crear">Crear mi primer anuncio</ButtonLink>} className="py-8" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Actividad reciente" />
          {activity.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">Aquí aparecerán tus últimos productos, anuncios e importaciones.</p>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((entry) => {
                const Icon = ACTIVITY_ICON[entry.type];
                return (
                  <li key={`${entry.type}-${entry.id}`}>
                    <Link href={entry.href} className="flex items-center gap-3 px-5 py-3 hover:bg-paper">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{entry.title}</span>
                        <span className="block text-xs text-muted">
                          {entry.detail} · {formatRelative(entry.at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-9 font-sans text-[15px] font-semibold tracking-normal">Accesos rápidos</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {QUICK.map((item) => (
          <Link key={item.href} href={item.href} className="group flex items-start gap-4 rounded-card border border-line bg-surface p-5 shadow-card transition-colors hover:border-ink/30">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <item.icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="flex items-center gap-1 text-sm font-semibold">
                {item.title}
                <ArrowUpRight className="size-3.5 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
              </span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                {item.href === "/app/masivo" && !canUseBulk(usage) ? "Disponible a partir del plan Pro." : item.text}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
