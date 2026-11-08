import type { Metadata } from "next";
import Link from "next/link";

import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: `Guía de inicio · ${BRAND.name}`, description: `Cómo poner en marcha ${BRAND.name} en tu empresa de protección contra incendios, paso a paso.` };

const STEPS: Array<{ title: string; where: string; body: string[] }> = [
  {
    title: "Crea tu cuenta y tu empresa",
    where: "Registro → Da de alta tu empresa",
    body: [
      "Regístrate con tu correo y confirma el enlace que te llega.",
      "Escribe el nombre de la empresa tal y como quieres que lo vean tus clientes. La dirección pública (por ejemplo, extintores-norte) se usa en el enlace para pedir una visita.",
    ],
  },
  {
    title: "Elige un plan y empieza la prueba",
    where: "Configuración → Facturación",
    body: [
      "Todos los planes tienen 7 días gratis. Se pide la tarjeta, pero no se cobra hasta que termina la prueba.",
      "Hasta que no haya un plan, el panel está en solo lectura y no se envían avisos.",
    ],
  },
  {
    title: "Pon los datos y el logo de la empresa",
    where: "Configuración → Datos de la empresa",
    body: ["Logo, color, teléfono y dirección aparecen en los correos, los partes de trabajo y la página para pedir visita.", "El NIF y la razón social salen en los presupuestos."],
  },
  {
    title: "Revisa las operaciones de mantenimiento",
    where: "Configuración → Mantenimiento",
    body: [
      "Vienen las operaciones del RIPCI (RD 513/2017, anexo II) con su periodicidad de referencia: las de la tabla II (empresa mantenedora) activadas y las de la tabla I (que puede hacer el titular) desactivadas.",
      "Activa las que hagas y, si quieres, acorta alguna periodicidad. No se pueden alargar. RevisaYa ayuda a planificar; no certifica el cumplimiento normativo.",
    ],
  },
  {
    title: "Da de alta a tus técnicos",
    where: "Configuración → Técnicos",
    body: [
      "Añade a las personas que hacen las revisiones. Si les invitas como usuarios con el rol «Técnico / operario» y les vinculas, verán en el móvil solo sus órdenes.",
    ],
  },
  {
    title: "Importa clientes, instalaciones y equipos",
    where: "Importar",
    body: [
      "Hay una plantilla para cada cosa. Sube primero los clientes, luego las instalaciones (cada una con su cliente) y por último los equipos (cada uno con su instalación y su categoría).",
      "Antes de guardar verás qué se crea, qué se omite porque ya existe y qué filas tienen errores. Todo se crea a la vez o nada.",
    ],
  },
  {
    title: "Imprime las etiquetas QR",
    where: "Instalaciones → ficha → Etiquetas QR",
    body: ["Pega cada etiqueta en su equipo. Al escanearla, el técnico abre la ficha del equipo tras iniciar sesión; el QR no contiene datos del cliente."],
  },
  {
    title: "Crea la primera orden de trabajo",
    where: "Instalaciones → ficha → Nueva orden de trabajo",
    body: [
      "La orden propone lo que vence en los próximos días. Asígnala a un técnico, ponle fecha y avisa al cliente con un clic.",
      "En la instalación, el técnico pulsa «Empezar el trabajo», registra el resultado de cada equipo (con materiales, fotos e incidencias) y la finaliza. El historial del equipo y sus próximos vencimientos se actualizan solos.",
    ],
  },
  {
    title: "Activa los avisos de vencimiento",
    where: "Configuración → Avisos",
    body: [
      "Elige cuántos días antes avisar (por ejemplo, 30 y 7), el horario de envío y los días sin envíos.",
      "Revisa el texto en Configuración → Plantillas de correo y mándate un correo de prueba.",
    ],
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Guía de inicio</h1>
      <p className="mt-2 text-[var(--muted)]">De la cuenta nueva a la primera orden de trabajo terminada, en 9 pasos.</p>
      <ol className="mt-8 flex flex-col gap-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">{i + 1}</span>
              <div className="min-w-0">
                <h2 className="font-semibold">{s.title}</h2>
                <p className="text-sm text-[var(--muted)]">{s.where}</p>
                {s.body.map((p) => (
                  <p key={p} className="mt-2 text-[15px]">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-[var(--muted)]">
        ¿Dudas? Responde al correo de bienvenida o escríbenos desde la dirección de contacto del{" "}
        <Link href="/legal/aviso-legal" className="underline">
          aviso legal
        </Link>
        .
      </p>
    </main>
  );
}
