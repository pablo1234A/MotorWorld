"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Display";

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}
function MsLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" /><path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" /><path fill="#00A4EF" d="M1 12.5h10.5V23H1z" /><path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  );
}

export function EmailConnectButtons({ providers, returnTo = "app", label = "Conectar" }: { providers: { google: boolean; microsoft: boolean }; returnTo?: "app" | "onboarding"; label?: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = async (provider: "GOOGLE" | "MICROSOFT") => {
    setLoading(provider);
    setErr(null);
    try {
      const r = await api<{ url: string }>("/api/v1/email-connection/connect", { body: { provider, returnTo } });
      window.location.href = r.url;
    } catch (e) {
      setErr((e as ApiError).message);
      setLoading(null);
    }
  };
  return (
    <div className="space-y-3">
      {err ? <Alert tone="bad">{err}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="secondary" size="lg" icon={<GoogleG />} loading={loading === "GOOGLE"} disabled={!providers.google} onClick={() => go("GOOGLE")}>
          {label} Gmail
        </Button>
        <Button variant="secondary" size="lg" icon={<MsLogo />} loading={loading === "MICROSOFT"} disabled={!providers.microsoft} onClick={() => go("MICROSOFT")}>
          {label} Outlook
        </Button>
      </div>
      {!providers.google || !providers.microsoft ? (
        <p className="text-xs text-ink-500">
          {!providers.google && !providers.microsoft
            ? "La conexión de correo no está configurada en el servidor (faltan GOOGLE_CLIENT_ID/SECRET y MICROSOFT_CLIENT_ID/SECRET)."
            : !providers.google
              ? "Gmail no está configurado en el servidor (GOOGLE_CLIENT_ID/SECRET)."
              : "Outlook no está configurado en el servidor (MICROSOFT_CLIENT_ID/SECRET)."}
        </p>
      ) : null}
      <p className="text-xs text-ink-500">Solo pedimos permiso para <strong>enviar</strong> correos en tu nombre. No leemos tu bandeja de entrada ni guardamos tu contraseña.</p>
    </div>
  );
}
