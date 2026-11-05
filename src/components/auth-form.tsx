"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, Field, Input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: Object.fromEntries(fd) });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      const details = err instanceof ApiError && Array.isArray(err.details) ? (err.details as Array<{ message: string }>).map((d) => d.message).join(" ") : "";
      setError(details || (err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "register" ? (
        <Field label="Nombre">
          <Input name="name" autoComplete="name" required className="h-10" />
        </Field>
      ) : null}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" inputMode="email" required className="h-10" />
      </Field>
      <Field label="Contraseña" hint={mode === "register" ? "Mínimo 8 caracteres" : undefined}>
        <Input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : undefined} className="h-10" />
      </Field>
      {error ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        {mode === "login" ? "Entrar" : "Crear cuenta"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        {mode === "login" ? (
          <>
            ¿No tienes cuenta?{" "}
            <Link className="text-fg underline-offset-4 hover:underline" href="/register">
              Regístrate
            </Link>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link className="text-fg underline-offset-4 hover:underline" href="/login">
              Entra
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
