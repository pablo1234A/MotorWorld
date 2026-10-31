"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { AuthCard } from "@/components/app/AuthCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Display";

function safeNext(n: string | null) {
  // "/\evil.com" lo normaliza el navegador a "//evil.com": se rechaza cualquier "/" seguido de "/" o "\".
  return n && /^\/(?![/\\])/.test(n) ? n : "/app";
}

function LoginForm() {
  const sp = useSearchParams();
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reset = sp.get("restablecida");
  return (
    <AuthCard title="Inicia sesión" subtitle="Accede a tu panel de Reseñalo." footer={<>¿No tienes cuenta? <Link href="/registro" className="font-medium text-ink-900 underline underline-offset-2">Regístrate</Link></>}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setErr(null);
          try {
            const r = await api<{ user: { emailVerified: boolean } }>("/api/v1/auth/login", { body: f });
            window.location.href = r.user.emailVerified ? safeNext(sp.get("next")) : "/verificar-pendiente";
          } catch (er) {
            setErr((er as ApiError).message);
            setLoading(false);
          }
        }}
      >
        {reset ? <Alert tone="ok">Contraseña actualizada. Ya puedes iniciar sesión.</Alert> : null}
        {err ? <Alert tone="bad">{err}</Alert> : null}
        <Input label="Correo electrónico" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <div>
          <Input label="Contraseña" type="password" autoComplete="current-password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <div className="mt-2 text-right">
            <Link href="/recuperar-contrasena" className="text-sm text-ink-600 underline-offset-2 hover:underline">¿Has olvidado tu contraseña?</Link>
          </div>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Entrar
        </Button>
      </form>
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
