import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth-forms";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Crea tu cuenta en Legalito y prepara el aviso legal, la política de privacidad y la política de cookies de tu web.",
};

const ACQ_KEYS = ["utm_source", "utm_medium", "utm_campaign", "ref"] as const;

export default async function SignUpPage({ searchParams }: PageProps<"/registro">) {
  if (await getSessionUser()) redirect("/panel");
  const sp = await searchParams;
  // Parámetros de captación (campañas, afiliados) que se guardan con la cuenta.
  const acquisition: Record<string, string> = {};
  for (const k of ACQ_KEYS) {
    const v = sp[k];
    if (typeof v === "string" && /^[\w.-]{1,100}$/.test(v)) acquisition[k] = v;
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">Crea tu cuenta</h1>
      <p className="mt-1.5 mb-7 text-[15px] text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/acceder" className="text-link">
          Accede
        </Link>
      </p>
      <SignUpForm acquisition={acquisition} defaultAccountType={sp.tipo === "agencia" ? "agency" : "business"} />
    </>
  );
}
