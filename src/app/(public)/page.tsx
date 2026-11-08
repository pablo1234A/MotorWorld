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
  pro: "Mantenedor que empieza o trabaja solo",
  max: "Empresa con varios técnicos",
  business: "Empresa con varias delegaciones",
  excelencia: "Redes de delegaciones o todo incluido",
};
const EXTRAS: Record<string, string[]> = {
  pro: ["Avisos de vencimiento", "Órdenes de trabajo y etiquetas QR", "Importación de Excel", "Presupuestos y partes en PDF", "Página para pedir visita"],
  max: ["Todo lo de Pro", "Google Calendar", "Informes y exportación CSV"],
  business: ["Todo lo de Max", "Hasta 3 delegaciones", "Soporte prioritario y acompañamiento inicial"],
  excelencia: ["Todo lo de Business", "Delegaciones ilimitadas", "API", "Plantillas a medida", "Dominio incluido", "Gestor de cuenta"],
};

const STEPS = [
  ["Te registras", "Empiezas la prueba de 7 días y pones el nombre, el logo y los colores de tu empresa."],
  ["Traes tus datos", "Importas clientes, instalaciones y equipos con las plantillas Excel. Antes de guardar nada ves qué se crea y qué falla."],
  ["Planificas", "Cada equipo tiene su programa de mantenimiento según el RIPCI. Creas órdenes de trabajo con lo que vence y las asignas a un técnico."],
  ["El técnico trabaja en el móvil", "Escanea el QR del equipo, registra el resultado, añade fotos e incidencias y cierra la orden en la instalación."],
  ["Todo queda registrado", "El historial de cada equipo no se borra: se corrige o se anula dejando constancia. Envías el parte en PDF al cliente."],
] as const;

const FEATURES = [
  ["Clientes e instalaciones", "Empresas, comunidades y particulares con sus datos fiscales; cada uno con sus instalaciones, direcciones y responsables.", "Pro"],
  ["Equipos PCI", "Extintores (agente, carga, eficacia, timbrado, retimbrados), BIE, hidrantes, detección, extinción automática y más, con su código y ubicación.", "Pro"],
  ["Programa de mantenimiento", "Operaciones de las tablas I y II del anexo II del RIPCI con su periodicidad, configurables por tu empresa (se pueden acortar, no alargar).", "Pro"],
  ["Órdenes de trabajo", "Varios equipos de una instalación por orden, técnico asignado, fecha y hora, resultado por equipo y seguimiento de cada cambio.", "Pro"],
  ["Etiquetas QR", "Imprime las etiquetas de una instalación. El QR abre la ficha del equipo solo a usuarios de tu empresa.", "Pro"],
  ["Incidencias, fotos y documentos", "Registra anomalías con su gravedad y adjunta fotos y PDF de forma privada.", "Pro"],
  ["Avisos de vencimiento", "Un correo al cliente antes de que venza el mantenimiento de su instalación, con tu marca y un botón para pedir visita.", "Pro"],
  ["Importación de Excel", "Plantillas separadas para clientes, instalaciones y equipos, con revisión de errores. Todo se crea a la vez o nada.", "Pro"],
  ["Presupuestos y partes en PDF", "Presupuestos con IVA y partes de trabajo con el resultado de cada equipo, enviados por correo.", "Pro"],
  ["Google Calendar", "Las órdenes de trabajo y las visitas aparecen en vuestra agenda de Google.", "Max"],
  ["Informes", "Vencimientos, actuaciones por técnico y por tipo de equipo, estado de cada instalación e incidencias, con exportación CSV.", "Max"],
  ["Varias delegaciones", "Delegaciones bajo una cuenta, con datos y permisos separados.", "Business"],
  ["API", "Conecta RevisaYa con tu ERP o tu programa de facturación.", "Excelencia"],
] as const;

const FAQ = [
  ["¿RevisaYa certifica que cumplo el RIPCI?", "No. RevisaYa te ayuda a planificar y a registrar el mantenimiento con las periodicidades del RIPCI (RD 513/2017) como referencia, pero no certifica el cumplimiento normativo ni emite certificados oficiales. Los partes que genera no sustituyen a las actas, certificados o registros que exige la normativa."],
  ["¿Comprueba la habilitación de mi empresa o de mis técnicos?", "No. La habilitación como empresa mantenedora y la cualificación de los técnicos son responsabilidad de tu empresa. Puedes anotar la información que quieras, pero RevisaYa no la verifica."],
  ["¿Hace falta tarjeta para la prueba?", "Sí: se pide al empezar, pero no se cobra nada hasta que terminan los 7 días. Si cancelas antes, no pagas."],
  ["¿Los precios llevan IVA?", "No. Los precios son sin IVA; el IVA se añade en la factura."],
  ["¿Cuentan los equipos retirados en el límite del plan?", "No. El límite es de equipos en uso: los retirados o en la papelera no cuentan."],
  ["¿Los correos salen con el nombre de mi empresa?", "Sí. Tus clientes ven el nombre, el logo y los colores de tu empresa. Si verificas tu dominio, los correos salen desde tu propia dirección; si no, desde una dirección de RevisaYa con tu nombre y las respuestas te llegan a ti."],
  ["¿Puedo traer mis datos desde un Excel?", "Sí. Hay una plantilla para clientes, otra para instalaciones y otra para equipos. La app revisa cada fila antes de guardar. Hasta 2.000 filas por archivo."],
  ["¿Mis clientes pueden dejar de recibir avisos?", "Sí. Cada aviso lleva un enlace para darse de baja y RevisaYa no vuelve a enviar avisos a quien se ha dado de baja."],
  ["¿Quién es responsable de los datos de mis clientes?", "Tu empresa. RevisaYa trata esos datos por encargo tuyo, con un contrato de encargo del tratamiento que aceptas al dar de alta la empresa."],
  ["¿Qué pasa si cancelo?", "Mantienes el acceso hasta el final del periodo pagado. Después la cuenta queda en solo lectura y los datos se conservan 60 días por si vuelves; luego se borran."],
  ["¿Puedo cambiar de plan?", "Cuando quieras, desde Facturación. Stripe prorratea la diferencia. Para bajar de plan, tus datos tienen que caber en el nuevo."],
] as const;

export default function Home() {
  return (
    <main>
      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-[var(--accent)]">Para empresas mantenedoras de protección contra incendios</p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">El mantenimiento de cada extintor, BIE y equipo, bajo control.</h1>
            <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
              Clientes, instalaciones y equipos PCI con su programa de mantenimiento, órdenes de trabajo para tus técnicos en el móvil, etiquetas QR, incidencias
              e historial que no se pierde. Y avisos a tus clientes antes de cada vencimiento.
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
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Ejemplo (datos ficticios)</p>
            <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
              <p className="font-semibold">OT-2027-0042 · Garaje comunitario</p>
              <ul className="mt-2 flex flex-col gap-1 text-[var(--muted)]">
                <li>EXT-000012 · Mantenimiento anual · Correcto</li>
                <li>EXT-000013 · Mantenimiento anual · Correcto con observaciones</li>
                <li>BIE-000002 · Mantenimiento anual · Pendiente</li>
              </ul>
              <span className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white">Registrar resultado</span>
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
                  <li>{limit(p.maxEquipment, "equipos en uso")}</li>
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
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Empieza hoy con tus Excel de clientes y equipos</h2>
        <p className="mx-auto mt-2 max-w-xl text-[var(--muted)]">Importa tus datos, revisa los vencimientos y crea la primera orden de trabajo.</p>
        <Link href="/registro" className={buttonClass("primary", "mt-6 px-6 py-3 text-base")}>
          Empezar 7 días gratis
        </Link>
      </section>
    </main>
  );
}
