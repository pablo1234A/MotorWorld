import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/forms/auth-forms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-3xl font-bold">Crea tu cuenta</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Gratis, sin tarjeta. Empieza a generar anuncios en un minuto.</p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-brand-strong hover:underline">
          Iniciar sesión
        </Link>
      </p>
    </>
  );
}
