"use client";
import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AuthCard } from "@/components/app/AuthCard";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Display";

export default function Page() {
  const [email, setEmail] = useState<string | null>(null);
  const [state, setState] = useState<{ loading?: boolean; ok?: boolean; err?: string }>({});
  useEffect(() => {
    api<{ user: { email: string; emailVerified: boolean } | null }>("/api/v1/auth/me")
      .then((r) => {
        if (r.user?.emailVerified) window.location.href = "/onboarding";
        else setEmail(r.user?.email ?? null);
      })
      .catch(() => (window.location.href = "/login"));
  }, []);
  return (
    <AuthCard title="Confirma tu correo">
      <div className="space-y-5">
        <div className="flex gap-3 rounded-lg bg-cream-200 p-4 text-sm text-ink-700">
          <MailCheck className="h-5 w-5 shrink-0 text-ink-600" />
          <p>Te hemos enviado un enlace de confirmación{email ? <> a <strong>{email}</strong></> : null}. Ábrelo para activar tu cuenta. Si no lo ves, revisa la carpeta de spam.</p>
        </div>
        {state.ok ? <Alert tone="ok">Te hemos enviado un nuevo enlace.</Alert> : null}
        {state.err ? <Alert tone="bad">{state.err}</Alert> : null}
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          loading={state.loading}
          onClick={async () => {
            setState({ loading: true });
            try {
              await api("/api/v1/auth/resend-verification", { method: "POST", body: {} });
              setState({ ok: true });
            } catch (e) {
              setState({ err: (e as ApiError).message });
            }
          }}
        >
          Reenviar el enlace
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          onClick={async () => {
            await api("/api/v1/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
            window.location.href = "/login";
          }}
        >
          Usar otra cuenta
        </Button>
      </div>
    </AuthCard>
  );
}
