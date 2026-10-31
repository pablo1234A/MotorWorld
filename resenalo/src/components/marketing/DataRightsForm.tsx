"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Display";

const TYPES = [
  ["ACCESS", "Acceso"],
  ["RECTIFICATION", "Rectificación"],
  ["ERASURE", "Supresión"],
  ["OBJECTION", "Oposición"],
  ["RESTRICTION", "Limitación"],
  ["PORTABILITY", "Portabilidad"],
];

export function DataRightsForm() {
  const [f, setF] = useState({ type: "ACCESS", name: "", email: "", message: "" });
  const [state, setState] = useState<{ loading?: boolean; ok?: string; err?: string; fields?: Record<string, string> }>({});
  return (
    <form
      className="not-prose mt-6 grid gap-4 rounded-xl border border-ink-200 bg-white p-5 sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ loading: true });
        try {
          const r = await api<{ reference: string }>("/api/public/data-request", { body: f });
          setState({ ok: `Solicitud registrada. Referencia: ${r.reference}. Te hemos enviado un acuse de recibo.` });
          setF({ type: "ACCESS", name: "", email: "", message: "" });
        } catch (er) {
          const e2 = er as ApiError;
          setState({ err: e2.message, fields: e2.fields });
        }
      }}
    >
      {state.ok ? <Alert tone="ok">{state.ok}</Alert> : null}
      {state.err ? <Alert tone="bad">{state.err}</Alert> : null}
      <Select label="Derecho que quieres ejercer" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
        {TYPES.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre y apellidos" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={state.fields?.name} />
        <Input label="Email" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={state.fields?.email} />
      </div>
      <Textarea label="Describe tu solicitud" required value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={state.fields?.message} help="Indica, si procede, el negocio del que recibiste el correo." />
      <div>
        <Button type="submit" loading={state.loading}>Enviar solicitud</Button>
      </div>
    </form>
  );
}
