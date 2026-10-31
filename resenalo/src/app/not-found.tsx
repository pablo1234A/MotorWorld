import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-3xl font-bold">Página no encontrada</h1>
      <p className="mt-2 text-ink-600">El enlace no existe o se ha movido.</p>
      <Link href="/" className="mt-6 underline">Volver al inicio</Link>
    </main>
  );
}
