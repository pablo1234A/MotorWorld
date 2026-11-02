"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Input, Label, Notice } from "@/components/ui";
import { api, errMsg } from "@/lib/api";

function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  if (!token) return <Notice tone="err">Enlace incompleto. Solicita uno nuevo desde «¿La olvidaste?».</Notice>;
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
          await api("/api/auth/reset-password", { method: "POST", json: { token, password } });
          setDone(true);
        } catch (err) {
          setError(errMsg(err));
        } finally {
          setLoading(false);
        }
      }}
    >
      <h1 className="display text-[40px] leading-none">Nueva contraseña</h1>
      {done ? (
        <Notice tone="ok">
          Contraseña actualizada. Por seguridad hemos cerrado todas tus sesiones. <Link href="/login" className="underline">Inicia sesión</Link>.
        </Notice>
      ) : (
        <>
          {error && <Notice tone="err">{error}</Notice>}
          <div>
            <Label htmlFor="pw" hint="10+ car., mayúsculas, minúsculas y número">Contraseña</Label>
            <Input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>Guardar</Button>
        </>
      )}
    </form>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
