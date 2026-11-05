import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Crea tu cuenta</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Describe tu web y tenla diseñada en menos de un minuto.</p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </>
  );
}
