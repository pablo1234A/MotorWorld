import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/forms/auth-forms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Solo accesible justo después de abrir un enlace de recuperación válido.
  if (!user || (await cookies()).get("ap_recovery")?.value !== user.id) redirect("/login?error=enlace");
  return (
    <>
      <h1 className="text-3xl font-bold">Elige una nueva contraseña</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Al guardarla se cerrarán las sesiones abiertas en otros dispositivos.</p>
      <ResetPasswordForm />
    </>
  );
}
