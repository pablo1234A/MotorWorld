"use client";

import { FileStack, Package, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlays";
import { api } from "@/lib/api-client";

const STEPS = [
  { icon: Package, title: "1. Añade un producto", text: "Nombre, categoría, estado y los datos que conozcas. Cuanta más información real aportes, mejor será el anuncio." },
  { icon: PenLine, title: "2. Genera y ajusta el anuncio", text: "Elige plataforma y tono. Edita el resultado, cambia la extensión o prueba otro título, y guárdalo." },
  { icon: FileStack, title: "3. Escala con CSV", text: "Cuando tengas muchos productos, impórtalos desde un CSV y genera todos los anuncios por lotes." },
];

/** Bienvenida de primer acceso. Se muestra una sola vez (se registra en el perfil). */
export function Onboarding({ name }: { name: string }) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function finish(target?: string) {
    setLoading(true);
    try {
      await api("/api/account/onboarding", { method: "POST" });
    } catch {
      // Si falla, la bienvenida volverá a mostrarse en el siguiente acceso.
    }
    setOpen(false);
    if (target) router.push(target);
    else router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && finish()}
      title={name ? `Te damos la bienvenida, ${name.split(" ")[0]}` : "Te damos la bienvenida a AnunciaPro"}
      description="Así se trabaja con AnunciaPro. Puedes empezar ahora mismo con tu primer producto."
      footer={
        <>
          <Button variant="secondary" onClick={() => finish()} disabled={loading}>
            Explorar por mi cuenta
          </Button>
          <Button variant="brand" onClick={() => finish("/app/crear")} loading={loading}>
            Crear mi primer anuncio
          </Button>
        </>
      }
    >
      <ol className="space-y-4">
        {STEPS.map((step) => (
          <li key={step.title} className="flex gap-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <step.icon className="size-[18px]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
