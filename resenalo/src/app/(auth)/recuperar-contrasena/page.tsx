"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { AuthCard } from "@/components/app/AuthCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Display";

export default function Page() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ loading?: boolean; sent?: boolean; err?: string }>({});
  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace para crear una nueva." footer={<Link href="/login" className="underline underline-offset-2">Volver a iniciar sesión</Link>}>
      {state.sent ? (
        <Alert tone="ok" title="Revisa tu correo">Si existe una cuenta con {email}, recibirás un enlace válido durante 60 minutos. Mira también en la carpeta de spam.</Alert>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setState({ loading: true });
            try {
              await api("/api/v1/auth/forgot-password", { body: { email } });
              setState({ sent: true });
            } catch (er) {
              setState({ err: (er as ApiError).message });
            }
          }}
        >
          {state.err ? <Alert tone="bad">{state.err}</Alert> : null}
          <Input label="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="lg" className="w-full" loading={state.loading}>
            Enviar enlace
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
