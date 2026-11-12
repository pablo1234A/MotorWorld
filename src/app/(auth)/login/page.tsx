import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Iniciar sesión" };

const NOTICES: Record<string, string> = {
  enlace: "El enlace no es válido o ha caducado. Solicita uno nuevo o inicia sesión.",
  desactivada: "Esta cuenta está desactivada. Contacta con soporte.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-bold">Bienvenido de nuevo</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Inicia sesión para acceder a tu catálogo y tus anuncios.</p>
      <LoginForm next={params.next} notice={params.error ? NOTICES[params.error] : undefined} />
      <p className="mt-6 text-center text-sm text-muted">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-brand-strong hover:underline">
          Crear cuenta gratis
        </Link>
      </p>
    </>
  );
}
