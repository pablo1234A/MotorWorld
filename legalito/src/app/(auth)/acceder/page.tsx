import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth-forms";
import { getSessionUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Acceder" };

export default async function SignInPage({ searchParams }: PageProps<"/acceder">) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  if (await getSessionUser()) redirect(next);
  return (
    <>
      <h1 className="text-2xl font-semibold">Accede a tu cuenta</h1>
      <p className="mt-1.5 mb-7 text-[15px] text-muted">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-blue hover:underline">
          Regístrate
        </Link>
      </p>
      <SignInForm next={next} linkError={sp.error === "enlace"} />
    </>
  );
}
