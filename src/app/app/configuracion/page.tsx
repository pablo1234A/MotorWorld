import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/feedback";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Configuración · RevisaYa" };

const SECTIONS = [
  { href: "/app/configuracion/taller", title: "Datos del taller", text: "Nombre, logo, color, datos fiscales y de contacto." },
  { href: "/app/configuracion/avisos", title: "Avisos", text: "Activar los avisos, días de antelación, horario de envío, festivos y avisos por kilometraje." },
  { href: "/app/configuracion/plantillas", title: "Plantillas de correo", text: "El texto que reciben tus clientes, con vista previa y correo de prueba." },
  { href: "/app/configuracion/correo", title: "Correo", text: "Remitente o dominio propio, resumen para el taller y direcciones bloqueadas." },
  { href: "/app/usuarios", title: "Usuarios", text: "Quién puede entrar en el panel y qué puede hacer." },
] as const;

export default async function SettingsPage() {
  const ctx = await requireOrgPage("/app/configuracion");
  if (!isAdmin(ctx)) {
    return <Alert tone="error" title="Sin permiso">Solo los administradores del taller pueden cambiar la configuración.</Alert>;
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex h-full flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--accent)]"
            >
              <span className="font-semibold">{s.title}</span>
              <span className="text-sm text-[var(--muted)]">{s.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
