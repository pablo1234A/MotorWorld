import type { Metadata } from "next";
import Link from "next/link";

import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: `Guía de inicio · ${BRAND.name}`, description: `Cómo poner en marcha ${BRAND.name} en tu taller, paso a paso.` };

const STEPS: Array<{ title: string; where: string; body: string[] }> = [
  {
    title: "Crea tu cuenta y tu taller",
    where: "Registro → Da de alta tu taller",
    body: [
      "Regístrate con tu correo y confirma el enlace que te llega.",
      "Escribe el nombre del taller tal y como quieres que lo vean tus clientes. La dirección pública (por ejemplo, taller-sur) se usa en el enlace para pedir cita.",
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
    title: "Pon los datos y el logo del taller",
    where: "Configuración → Datos del taller",
    body: ["Logo, color, teléfono y dirección aparecen en los correos y en la página para pedir cita.", "El NIF y la razón social salen en los presupuestos."],
  },
  {
    title: "Elige desde qué dirección salen los correos",
    where: "Configuración → Correo",
    body: [
      "Sin hacer nada, los avisos salen con el nombre de tu taller desde una dirección de RevisaYa, y las respuestas te llegan a tu correo.",
      "Si tienes dominio propio (tutaller.es), añade los registros DNS que te enseñamos y los correos saldrán desde tu dirección. Hay una guía para cada registrador en el propio panel.",
    ],
  },
  {
    title: "Sube tu Excel de clientes y coches",
    where: "Importar",
    body: [
      "Descarga la plantilla, copia tus datos (nombre, correo, teléfono, matrícula, marca, modelo, última revisión y kilómetros) y súbela. Hasta 2.000 filas por archivo.",
      "Antes de guardar verás las filas con problemas (una matrícula mal escrita, una fecha que no existe…) y podrás corregirlas. No se guarda nada a medias.",
    ],
  },
  {
    title: "Activa los avisos",
    where: "Configuración → Avisos",
    body: [
      "Elige cuántos días antes avisar (por ejemplo, 30 y 7), el horario de envío y los días sin envíos (festivos, fines de semana).",
      "Revisa el texto del correo en Configuración → Plantillas y mándate un correo de prueba.",
    ],
  },
  {
    title: "Abre la página para pedir cita",
    where: "Configuración → Citas",
    body: ["Pon tu horario y cuántos coches puedes atender a la vez. El botón de cada aviso lleva a esa página.", "Las solicitudes te llegan al panel (Citas) y por correo; las confirmas o las rechazas con un clic."],
  },
  {
    title: "Apunta cada revisión",
    where: "Vehículos → ficha del coche → Añadir revisión",
    body: ["Fecha, kilómetros, trabajos y piezas. Con eso se calcula la próxima revisión y se programan los avisos.", "En el inicio verás cuántos clientes han vuelto tras un aviso."],
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Guía de inicio</h1>
      <p className="mt-2 text-[var(--muted)]">Todo lo necesario para tener los avisos funcionando hoy, en 8 pasos.</p>
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
