"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label, Notice } from "@/components/ui";
import { api, errMsg } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", display_name: "", accept_terms: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pwOk = form.password.length >= 10 && /[a-z]/.test(form.password) && /[A-Z]/.test(form.password) && /\d/.test(form.password);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/register", { method: "POST", json: form });
      router.replace("/");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="display text-[40px] leading-none">Crea tu estudio</h1>
        <p className="mt-2 text-sm text-muted">Tus archivos y proyectos son privados y solo tú puedes acceder a ellos.</p>
      </div>
      {error && <Notice tone="err">{error}</Notice>}
      <div>
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="password" hint={form.password ? (pwOk ? "✓ segura" : "10+ car., Aa, 1-9") : "10+ caracteres"}>Contraseña</Label>
        <Input id="password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
      </div>
      <label className="flex items-start gap-2.5 text-[13px] text-muted">
        <input type="checkbox" className="mt-0.5 accent-[#ff5a36]" checked={form.accept_terms} onChange={(e) => setForm({ ...form, accept_terms: e.target.checked })} />
        <span>
          Acepto las <Link href="/legal/terms" className="text-text underline" target="_blank">condiciones de uso</Link> y la{" "}
          <Link href="/legal/privacy" className="text-text underline" target="_blank">política de privacidad</Link>.
        </span>
      </label>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={!form.accept_terms || !pwOk}>Crear cuenta</Button>
      <p className="text-center text-sm text-muted">
        ¿Ya tienes cuenta? <Link href="/login" className="text-text hover:underline">Inicia sesión</Link>
      </p>
    </form>
  );
}
