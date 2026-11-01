"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { Building2, Users } from "lucide-react";
import { switchAccount } from "@/lib/actions/clients";
import { inputClass } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export interface SwitcherOption {
  id: string;
  label: string;
}

/** Al cambiar de cliente se vuelve a la sección equivalente (nunca a un documento de otro cliente). */
function sectionFor(pathname: string): string {
  if (pathname.startsWith("/panel/generador")) return "/panel/generador";
  if (pathname.startsWith("/panel/documentos")) return "/panel/documentos";
  if (pathname.startsWith("/panel/datos")) return "/panel/datos";
  if (pathname.startsWith("/panel/clientes")) return "/panel/clientes";
  return "/panel";
}

export function AccountSwitcher({ rootId, rootLabel, activeId, clients }: { rootId: string; rootLabel: string; activeId: string; clients: SwitcherOption[] }) {
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const isClient = activeId !== rootId;
  return (
    <div className={cn("border-b px-4 py-2.5 sm:px-6 lg:px-10", isClient ? "border-blue/20 bg-blue-50" : "border-line bg-sand/40")}>
      <form ref={formRef} action={switchAccount} className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
        <input type="hidden" name="next" value={sectionFor(pathname)} />
        <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
          {isClient ? <Building2 className="h-4 w-4 text-blue" aria-hidden /> : <Users className="h-4 w-4 text-subtle" aria-hidden />}
          <label htmlFor="cuenta-activa">{isClient ? "Trabajando en el cliente" : "Trabajando en"}</label>
        </span>
        <select
          id="cuenta-activa"
          name="org"
          defaultValue={activeId}
          onChange={() => formRef.current?.requestSubmit()}
          className={cn(inputClass, "w-auto max-w-[min(22rem,100%)] py-1.5 pr-8 text-sm font-medium")}
        >
          <option value={rootId}>{rootLabel}</option>
          {clients.length > 0 && (
            <optgroup label="Clientes">
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <noscript>
          <button type="submit" className="text-sm text-link">Cambiar</button>
        </noscript>
        <Link href="/panel/clientes" className="ml-auto text-sm text-link">
          Gestionar clientes
        </Link>
      </form>
    </div>
  );
}
