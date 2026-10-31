"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { AuthCard } from "@/components/app/AuthCard";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Display";

function RegisterForm() {
  const router = useRouter();
  const plan = useSearchParams().get("plan");
  const [f, setF] = useState({ name: "", email: "", password: "", acceptTerms: false });
  const [err, setErr] = useState<{ msg?: string; fields?: Record<string, string> }>({});
  const [loading, setLoading] = useState(false);
  return (
    <AuthCard title="Crea tu cuenta" subtitle="Empieza a automatizar tus solicitudes de reseñas." footer={<>¿Ya tienes cuenta? <Link href="/login" className="font-medium text-ink-900 underline underline-offset-2">Inicia sesión</Link></>}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setErr({});
          try {
            await api("/api/v1/auth/register", { body: f });
            if (plan) sessionStorage.setItem("rsn_plan", plan);
            router.push("/verificar-pendiente");
          } catch (er) {
            const x = er as ApiError;
            setErr({ msg: x.message, fields: x.fields });
            setLoading(false);
          }
        }}
      >
        {err.msg ? <Alert tone="bad">{err.msg}</Alert> : null}
        <Input label="Nombre y apellidos" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={err.fields?.name} />
        <Input label="Correo electrónico" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={err.fields?.email} />
        <Input label="Contraseña" type="password" autoComplete="new-password" required minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={err.fields?.password} help="Mínimo 10 caracteres, con letras y números." />
        <Checkbox
          checked={f.acceptTerms}
          onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })}
          label={
            <>
              He leído y acepto las <Link href="/legal/condiciones" target="_blank" className="underline">condiciones de contratación</Link> y la <Link href="/legal/privacidad" target="_blank" className="underline">política de privacidad</Link>.
            </>
          }
        />
        {err.fields?.acceptTerms ? <p className="text-xs font-medium text-bad-600">{err.fields.acceptTerms}</p> : null}
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Crear cuenta
        </Button>
        <p className="text-xs leading-relaxed text-ink-500">
          Responsable: titular de Reseñalo. Finalidad: gestionar tu cuenta y el servicio. Base: contrato. Derechos: acceso, rectificación, supresión y otros, en <Link href="/legal/derechos" className="underline">derechos</Link>.
        </p>
      </form>
    </AuthCard>
  );
}

export default function Page() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
