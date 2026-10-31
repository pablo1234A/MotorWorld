"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { AuthCard } from "@/components/app/AuthCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Display";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [state, setState] = useState<{ loading?: boolean; err?: string; field?: string }>({});
  if (!token)
    return (
      <AuthCard title="Enlace no válido">
        <Alert tone="bad">Falta el token de recuperación. <Link href="/recuperar-contrasena" className="underline">Solicita un enlace nuevo</Link>.</Alert>
      </AuthCard>
    );
  return (
    <AuthCard title="Nueva contraseña" subtitle="Elige una contraseña segura. Se cerrarán las sesiones abiertas.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw !== pw2) return setState({ field: "Las contraseñas no coinciden" });
          setState({ loading: true });
          try {
            await api("/api/v1/auth/reset-password", { body: { token, password: pw } });
            router.push("/login?restablecida=1");
          } catch (er) {
            const x = er as ApiError;
            setState({ err: x.fields ? undefined : x.message, field: x.fields?.password });
          }
        }}
      >
        {state.err ? <Alert tone="bad">{state.err} <Link href="/recuperar-contrasena" className="underline">Solicitar otro enlace</Link></Alert> : null}
        <Input label="Nueva contraseña" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} help="Mínimo 10 caracteres, con letras y números." error={state.field} />
        <Input label="Repite la contraseña" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <Button type="submit" size="lg" className="w-full" loading={state.loading}>
          Guardar contraseña
        </Button>
      </form>
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
