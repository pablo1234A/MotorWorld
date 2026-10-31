import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="container-page flex h-16 items-center">
        <Link href="/" aria-label="Reseñalo, inicio">
          <Logo />
        </Link>
      </header>
      <main id="contenido" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
      <footer className="pb-6 text-center text-xs text-ink-500">
        <Link href="/legal/privacidad" className="hover:text-ink-800">Privacidad</Link> · <Link href="/legal/condiciones" className="hover:text-ink-800">Condiciones</Link> · <Link href="/legal/cookies" className="hover:text-ink-800">Cookies</Link>
      </footer>
    </div>
  );
}
