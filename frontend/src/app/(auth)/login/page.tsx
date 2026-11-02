"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Input, Label, Notice } from "@/components/ui";
import { api, errMsg } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      const next = sp.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="display text-[40px] leading-none">Bienvenido de nuevo</h1>
        <p className="mt-2 text-sm text-muted">Entra en tu estudio para continuar tus proyectos.</p>
      </div>
      {error && <Notice tone="err">{error}</Notice>}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="password" hint={<Link href="/forgot-password" className="text-muted hover:text-text">¿La olvidaste?</Link>}>Contraseña</Label>
        <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>Iniciar sesión</Button>
      <p className="text-center text-sm text-muted">
        ¿No tienes cuenta? <Link href="/register" className="text-text underline-offset-4 hover:underline">Crear cuenta</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
