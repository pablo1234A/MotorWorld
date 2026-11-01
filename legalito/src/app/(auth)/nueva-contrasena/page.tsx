import type { Metadata } from "next";
import Link from "next/link";
import { NewPasswordForm } from "@/components/auth-forms";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function NewPasswordPage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Enlace caducado</h1>
        <p className="mt-2 text-[15px] text-muted">Este enlace ya no es válido. Solicita uno nuevo para cambiar tu contraseña.</p>
        <Link href="/recuperar" className="mt-6 inline-block font-medium text-blue hover:underline">
          Solicitar un nuevo enlace
        </Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">Crea una nueva contraseña</h1>
      <p className="mt-1.5 mb-7 text-[15px] text-muted">Para la cuenta {user.email}.</p>
      <NewPasswordForm />
    </>
  );
}
