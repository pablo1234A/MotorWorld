import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BookingForm, type SlotDay } from "@/components/booking/booking-form";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { BRAND } from "@/config/brand";
import { addDays } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { BOOKING_MAX_DAYS_AHEAD, resolveBookingPage } from "@/server/modules/appointments/public";

export const metadata: Metadata = { title: "Pedir cita", robots: { index: false } };

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

export default function BookingPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8 sm:py-12">
      <main className="w-full max-w-xl">
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <Content params={params} searchParams={searchParams} />
        </Suspense>
        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          El taller es el responsable de tus datos y los usa solo para gestionar tu cita. {BRAND.name} presta este servicio por encargo del taller ·{" "}
          <Link href="/legal/privacidad" className="underline">
            Privacidad
          </Link>
        </p>
      </main>
    </div>
  );
}

function first(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s.slice(0, 200) : null;
}

async function Content({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const token = first(sp.t);
  const page = await resolveBookingPage(decodeURIComponent(slug).slice(0, 60), { token, branchId: first(sp.taller) });
  if (!page) notFound();
  const color = page.org.brandColor && SAFE_COLOR.test(page.org.brandColor) ? page.org.brandColor : "#c8102e";
  const contact = [page.org.phone ? formatPhone(page.org.phone) : null, page.org.email].filter(Boolean).join(" · ");

  const days: SlotDay[] = [];
  if (page.branch?.mode === "slots") {
    const dayFmt = new Intl.DateTimeFormat("es-ES", { timeZone: page.branch.tz, weekday: "long", day: "numeric", month: "long" });
    const timeFmt = new Intl.DateTimeFormat("es-ES", { timeZone: page.branch.tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    for (const s of page.slots) {
      const label = dayFmt.format(new Date(s.start));
      let day = days.find((d) => d.label === label);
      if (!day) days.push((day = { label, slots: [] }));
      day.slots.push({ value: s.start, label: timeFmt.format(new Date(s.start)) });
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <header className="flex items-center gap-4 border-b-4 px-6 py-5" style={{ borderColor: color }}>
        {page.org.logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo servido por la ruta pública del taller
          <img src={page.org.logoSrc} alt={page.org.name} className="h-12 max-w-48 object-contain" />
        ) : (
          <p className="text-xl font-semibold">{page.org.name}</p>
        )}
      </header>
      <div className="flex flex-col gap-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedir cita{page.org.logoSrc ? ` en ${page.org.name}` : ""}</h1>
          {page.org.address ? <p className="text-sm text-[var(--muted)]">{page.org.address}</p> : null}
        </div>

        {!page.open ? (
          <Alert tone="info" title="Ahora mismo no se pueden pedir citas en línea">
            {contact ? `Contacta directamente con el taller: ${contact}.` : "Contacta directamente con el taller."}
          </Alert>
        ) : (
          <>
            {page.tokenStatus === "expired" ? (
              <Alert tone="info">El enlace del aviso ha caducado, pero puedes pedir cita igualmente.</Alert>
            ) : page.tokenStatus === "invalid" ? (
              <Alert tone="info">No hemos reconocido el enlace del aviso. Puedes pedir cita igualmente.</Alert>
            ) : page.prefill?.vehicle ? (
              <p className="text-sm">
                Cita para tu <strong>{page.prefill.vehicle}</strong> ({page.prefill.plate}).
              </p>
            ) : null}

            {page.branch ? (
              <BookingForm
                slug={page.org.slug}
                token={page.tokenStatus === "valid" ? token : null}
                branchId={page.branch.id}
                mode={page.branch.mode}
                prefill={page.prefill}
                minDate={addDays(page.today, 1)}
                maxDate={addDays(page.today, BOOKING_MAX_DAYS_AHEAD)}
                days={days}
                color={color}
                turnstileSiteKey={process.env.TURNSTILE_SECRET_KEY ? (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null) : null}
              />
            ) : (
              <form method="get" className="flex flex-col gap-3">
                <label htmlFor="taller" className="text-sm font-medium">
                  ¿En qué taller?
                </label>
                <select id="taller" name="taller" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                  {page.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="self-start rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: color }}>
                  Continuar
                </button>
              </form>
            )}
            {contact ? <p className="text-xs text-[var(--muted)]">¿Prefieres hablar con el taller? {contact}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
