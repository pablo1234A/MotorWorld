import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/ui/button-styles";
import { BRAND } from "@/config/brand";
import { PLAN_CODES, PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description: BRAND.description,
  openGraph: { title: BRAND.name, description: BRAND.description, type: "website", locale: "es_ES" },
};

const eur = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const limit = (n: number | null, unit: string) => (n === null ? `${unit} ilimitados` : `${n.toLocaleString("es-ES")} ${unit}`);

const AUDIENCE: Record<string, string> = {
  pro: "Taller de 1 o 2 operarios",
  max: "Taller con varios operarios",
  business: "Taller grande o red de sucursales",
  excelencia: "Redes de talleres o todo incluido",
};
const EXTRAS: Record<string, string[]> = {
  pro: ["Avisos por fecha", "Importación de Excel", "Presupuestos en PDF con IVA", "Página para pedir cita"],
  max: ["Todo lo de Pro", "Avisos por kilometraje", "Google Calendar", "Informes"],
  business: ["Todo lo de Max", "Hasta 3 talleres", "Soporte prioritario y acompañamiento inicial"],
  excelencia: ["Todo lo de Business", "Talleres ilimitados", "API", "Plantillas a medida", "Dominio incluido", "Gestor de cuenta"],
};

const STEPS = [
  ["Te registras", "Empiezas la prueba de 7 días y pones el nombre, el logo y los colores de tu taller."],
  ["Subes tu Excel", "Descargas la plantilla, pegas tus clientes y coches y la app te enseña los errores antes de guardar nada."],
  ["Apuntas cada revisión", "En la ficha del coche: fecha, kilómetros, trabajos y piezas. Así se calcula la próxima."],
  ["RevisaYa avisa sola", "Cada día mira qué coches tienen la revisión cerca y envía el correo con tu nombre y un botón para pedir cita."],
  ["Tú confirmas la cita", "Ves en el panel quién ha pedido cita, la confirmas con un clic y al cliente le llega la confirmación."],
] as const;

const FEATURES = [
  ["Clientes y vehículos", "Ficha con contacto, origen, matrícula, marca, modelo, bastidor y kilómetros. Búsqueda rápida por nombre, teléfono o matrícula.", "Pro"],
  ["Historial de cada coche", "Cada revisión con su fecha, kilómetros, trabajos y piezas. Siempre a mano.", "Pro"],
  ["Importación de Excel o CSV", "Con plantilla, hasta 2.000 filas por archivo y revisión de errores. No se guarda nada a medias.", "Pro"],
  ["Avisos automáticos por correo", "Los días antes que elijas, en tu horario y sin enviar en festivos. Con registro de lo enviado.", "Pro"],
  ["Tu marca", "Tu logo, nombre y colores en el panel y en los correos. Plantillas editables y dominio propio (citas@tutaller.es).", "Pro"],
  ["Página para pedir cita", "El cliente elige día y hueco libre. Tú confirmas, cambias o rechazas.", "Pro"],
  ["Presupuestos en PDF", "Con IVA, numerados y enviados por correo.", "Pro"],
  ["Avisos por kilometraje", "Cuando un coche se acerca a los kilómetros de su próxima revisión.", "Max"],
  ["Google Calendar", "Las citas aparecen en la agenda de Google del taller.", "Max"],
  ["Informes", "Clientes que no han vuelto, revisiones pendientes, correos enviados y cuántos clientes vuelven tras un aviso.", "Max"],
  ["Varios talleres", "Sucursales bajo una cuenta, con datos y permisos separados.", "Business"],
  ["API", "Conecta RevisaYa con otros programas del taller.", "Excelencia"],
] as const;

const FAQ = [
  ["¿Hace falta tarjeta para la prueba?", "Sí: se pide al empezar, pero no se cobra nada hasta que terminan los 7 días. Si cancelas antes, no pagas."],
  ["¿Los precios llevan IVA?", "No. Los precios son sin IVA; el IVA se añade en la factura."],
  ["¿Los correos salen con el nombre de mi taller?", "Sí. Tus clientes ven el nombre, el logo y los colores de tu taller. Si verificas tu dominio, los correos salen desde tu propia dirección; si no, desde una dirección de RevisaYa con tu nombre y las respuestas te llegan a ti."],
  ["¿Puedo traer mis clientes desde un Excel?", "Sí. Descargas nuestra plantilla, pegas tus datos y la app revisa cada fila antes de guardar. Hasta 2.000 filas por archivo."],
  ["¿Os conectáis con la DGT o la ITV?", "No. Los datos del coche los pone el taller (a mano o con el Excel). Así no hacen falta permisos especiales."],
  ["¿Mis clientes pueden dejar de recibir avisos?", "Sí. Cada correo lleva un enlace para darse de baja y RevisaYa no vuelve a escribir a quien se ha dado de baja."],
  ["¿Quién es responsable de los datos de mis clientes?", "Tu taller. RevisaYa trata esos datos por encargo tuyo, con un contrato de encargo del tratamiento que aceptas al dar de alta el taller."],
  ["¿Qué pasa si cancelo?", "Mantienes el acceso hasta el final del periodo pagado. Después el taller queda en solo lectura y los datos se conservan 60 días por si vuelves; luego se borran."],
  ["¿Puedo cambiar de plan?", "Cuando quieras, desde Facturación. Stripe prorratea la diferencia. Para bajar de plan, tus datos tienen que caber en el nuevo."],
] as const;

export default function Home() {
  return (
    <main>
      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-[var(--accent)]">Para talleres mecánicos</p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Que tus clientes no se olviden de la revisión.</h1>
            <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
              {BRAND.name} avisa por correo a cada cliente cuando le toca la revisión, con el nombre de tu taller y un botón para pedir cita. Clientes, coches
              e historial en un solo sitio.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/registro" className={buttonClass("primary", "px-6 py-3 text-base")}>
                Empezar 7 días gratis
              </Link>
              <Link href="#precios" className={buttonClass("secondary", "px-6 py-3 text-base")}>
                Ver precios
              </Link>
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">Sin permanencia. Cancela cuando quieras desde el panel.</p>
          </div>
          <div aria-hidden className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Ejemplo de aviso</p>
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
              <p className="font-semibold">Revisión de tu Seat Ibiza en Taller Sur</p>
              <p className="mt-2 text-[var(--muted)]">
                Hola Laura, te recordamos que la revisión de tu Ibiza (1234 ABC) está prevista para el 15/03/2027. Pide cita con el botón de abajo.
              </p>
              <span className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white">Pedir cita</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="como" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="como" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Cómo funciona
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="funciones" aria-labelledby="funciones-t" className="scroll-mt-4 border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="funciones-t" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Funciones
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([title, text, plan]) => (
              <li key={title} className="flex flex-col gap-1 rounded-xl border border-[var(--border)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">{title}</h3>
                  <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium">{plan === "Pro" ? "Todos los planes" : `Desde ${plan}`}</span>
                </div>
                <p className="text-sm text-[var(--muted)]">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="precios" aria-labelledby="precios-t" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16">
        <h2 id="precios-t" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Precios
        </h2>
        <p className="mt-2 text-[var(--muted)]">
          7 días de prueba gratis en cualquier plan. Pago mensual, o anual con 2 meses gratis. Precios sin IVA.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_CODES.map((code) => {
            const p = PLANS[code];
            return (
              <article key={code} className={`flex flex-col gap-4 rounded-2xl border bg-[var(--surface)] p-6 ${code === "max" ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
                <div>
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="text-sm text-[var(--muted)]">{AUDIENCE[code]}</p>
                </div>
                <div>
                  <p className="text-3xl font-semibold tabular-nums">
                    {eur(p.priceMonthCents)}
                    <span className="text-sm font-normal text-[var(--muted)]">/mes + IVA</span>
                  </p>
                  <p className="text-sm text-[var(--muted)]">o {eur(p.priceYearCents)}/año + IVA</p>
                </div>
                <ul className="flex flex-col gap-1 text-sm">
                  <li>{limit(p.maxCustomers, "clientes")}</li>
                  <li>{limit(p.maxActiveVehicles, "vehículos activos")}</li>
                  <li>{p.monthlyEmails.toLocaleString("es-ES")} correos al mes</li>
                  <li>{p.maxUsers === null ? "Usuarios ilimitados" : `${p.maxUsers} ${p.maxUsers === 1 ? "usuario" : "usuarios"}`}</li>
                </ul>
                <ul className="flex flex-col gap-1 border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">
                  {EXTRAS[code].map((e) => (
                    <li key={e}>✓ {e}</li>
                  ))}
                </ul>
                <Link href="/registro" className={buttonClass(code === "max" ? "primary" : "secondary", "mt-auto w-full")}>
                  Probar {p.name} 7 días
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section id="preguntas" aria-labelledby="preguntas-t" className="scroll-mt-4 border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 id="preguntas-t" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span aria-hidden className="text-[var(--muted)] transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm text-[var(--muted)]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Empieza hoy con tu Excel de clientes</h2>
        <p className="mx-auto mt-2 max-w-xl text-[var(--muted)]">En unos minutos tienes las fichas creadas y los avisos programados.</p>
        <Link href="/registro" className={buttonClass("primary", "mt-6 px-6 py-3 text-base")}>
          Empezar 7 días gratis
        </Link>
      </section>
    </main>
  );
}
