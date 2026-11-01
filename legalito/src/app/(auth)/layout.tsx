import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="px-4 py-5 sm:px-8">
        <Logo />
      </header>
      <main id="contenido" className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px] animate-rise rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-lift)] sm:p-8">{children}</div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-subtle">
        <Link href="/legal/privacidad" className="hover:underline">
          Privacidad
        </Link>{" "}
        ·{" "}
        <Link href="/legal/condiciones" className="hover:underline">
          Condiciones
        </Link>{" "}
        ·{" "}
        <Link href="/contacto" className="hover:underline">
          Ayuda
        </Link>
      </footer>
    </div>
  );
}
