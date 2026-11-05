import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Bienvenido de nuevo</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Entra para seguir construyendo tus webs.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
