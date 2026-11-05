import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { Logo } from "@/components/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="w-fit">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
        <p className="text-xs text-faint">Tus datos se guardan en tu propia base de datos. Nada se comparte con terceros sin tu configuración.</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-panel lg:block" aria-hidden>
        <div className="absolute inset-0 canvas-grid" />
        <div className="absolute inset-x-12 top-1/2 -translate-y-1/2 space-y-3">
          {["Restaurante de cocina de temporada en Valencia, con reservas", "Convierte el hero en algo más premium, fondo oscuro", "Añade una sección de precios con tres planes"].map((t, i) => (
            <div key={t} className="animate-pop rounded-xl border border-line bg-elev/90 px-4 py-3 text-[13px] text-muted shadow-[var(--shadow-pop)]" style={{ marginLeft: i * 28, animationDelay: `${i * 90}ms` }}>
              <span className="mr-2 font-mono text-[11px] text-accent">{i === 0 ? "brief" : "chat"}</span>
              {t}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
