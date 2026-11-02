"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Input, Label, Notice } from "@/components/ui";
import { api, errMsg } from "@/lib/api";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
          const r = await api<{ message: string }>("/api/auth/forgot-password", { method: "POST", json: { email } });
          setMsg(r.message);
        } catch (err) {
          setError(errMsg(err));
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <h1 className="display text-[40px] leading-none">Recuperar acceso</h1>
        <p className="mt-2 text-sm text-muted">Te enviaremos un enlace de un solo uso para elegir una nueva contraseña.</p>
      </div>
      {msg && <Notice tone="ok">{msg}</Notice>}
      {error && <Notice tone="err">{error}</Notice>}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>Enviar enlace</Button>
      <p className="text-center text-sm text-muted"><Link href="/login" className="hover:text-text">Volver a iniciar sesión</Link></p>
    </form>
  );
}
