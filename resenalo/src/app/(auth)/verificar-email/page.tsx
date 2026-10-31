"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { AuthCard } from "@/components/app/AuthCard";
import { Alert } from "@/components/ui/Display";
import { buttonClass } from "@/components/ui/button-class";
import { Spinner } from "@/components/ui/Spinner";

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (!token) {
      setState("error");
      setMsg("Falta el token de verificación.");
      return;
    }
    api("/api/v1/auth/verify-email", { body: { token } })
      .then(() => setState("ok"))
      .catch((e: ApiError) => {
        setState("error");
        setMsg(e.message);
      });
  }, [token]);
  return (
    <AuthCard title="Verificación de correo">
      {state === "loading" ? (
        <div className="flex items-center gap-3 text-sm text-ink-600"><Spinner className="h-4 w-4" /> Verificando…</div>
      ) : state === "ok" ? (
        <div className="space-y-5">
          <Alert tone="ok" title="¡Correo confirmado!">Tu cuenta está activa. Vamos a configurar tu negocio.</Alert>
          <Link href="/onboarding" className={buttonClass("primary", "lg", "w-full")}>Continuar</Link>
        </div>
      ) : (
        <div className="space-y-5">
          <Alert tone="bad">{msg}</Alert>
          <Link href="/verificar-pendiente" className={buttonClass("secondary", "lg", "w-full")}>Solicitar un enlace nuevo</Link>
        </div>
      )}
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
