"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Display";

export type CustomerFormValue = { name: string; email: string; phone: string; serviceName: string; completedAt: string; notes: string; tags: string };
const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function CustomerForm({ initial, id, tagsEnabled, onDone }: { initial?: Partial<CustomerFormValue>; id?: string; tagsEnabled: boolean; onDone: (r: { message?: string }) => void }) {
  const [v, setV] = useState<CustomerFormValue>({ name: "", email: "", phone: "", serviceName: "", completedAt: todayLocal(), notes: "", tags: "", ...initial });
  const [request, setRequest] = useState(!id);
  const [sendNow, setSendNow] = useState(false);
  const [legal, setLegal] = useState(Boolean(id));
  const [err, setErr] = useState<{ msg?: string; fields?: Record<string, string> }>({});
  const [loading, setLoading] = useState(false);
  const set = (k: keyof CustomerFormValue, val: string) => setV({ ...v, [k]: val });
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setErr({});
        const body = {
          name: v.name, email: v.email, phone: v.phone || null, serviceName: v.serviceName || null, notes: v.notes || null,
          completedAt: v.completedAt ? new Date(v.completedAt).toISOString() : null,
          ...(tagsEnabled ? { tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean) } : {}),
        };
        try {
          if (id) {
            await api(`/api/v1/customers/${id}`, { method: "PATCH", body });
            onDone({ message: "Cliente actualizado" });
          } else {
            const r = await api<{ request: { status: string; message: string } | null }>("/api/v1/customers", { body: { ...body, requestReview: request, sendNow } });
            onDone({ message: r.request ? `Cliente añadido. ${r.request.message}` : "Cliente añadido" });
          }
        } catch (ex) {
          const x = ex as ApiError;
          setErr({ msg: x.message, fields: x.fields });
        }
        setLoading(false);
      }}
    >
      {err.msg ? <Alert tone="bad">{err.msg}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre" required value={v.name} onChange={(e) => set("name", e.target.value)} error={err.fields?.name} autoComplete="off" />
        <Input label="Correo electrónico" type="email" required value={v.email} onChange={(e) => set("email", e.target.value)} error={err.fields?.email} autoComplete="off" />
        <Input label="Servicio o producto" placeholder="Ej. Corte y peinado" value={v.serviceName} onChange={(e) => set("serviceName", e.target.value)} help="Se usa en {{nombre_servicio}}." />
        <Input label="Fecha de finalización" type="datetime-local" value={v.completedAt} onChange={(e) => set("completedAt", e.target.value)} />
        <Input label="Teléfono (opcional)" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
        {tagsEnabled ? <Input label="Etiquetas" placeholder="vip, centro" value={v.tags} onChange={(e) => set("tags", e.target.value)} help="Separadas por comas." /> : null}
      </div>
      <Textarea label="Notas internas (opcional)" rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      {!id ? (
        <div className="space-y-3 rounded-lg bg-cream-200/70 p-4">
          <Checkbox checked={request} onChange={(e) => setRequest(e.target.checked)} label="Generar la solicitud de reseña según la automatización" />
          {request ? <Checkbox checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} label="Enviar ahora (sin esperar el retardo configurado)" /> : null}
          <Checkbox checked={legal} onChange={(e) => setLegal(e.target.checked)} label="Este cliente ha contratado mis servicios y puedo contactarle (relación previa, art. 21.2 LSSI-CE)." />
        </div>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={loading} disabled={!legal}>{id ? "Guardar cambios" : "Añadir cliente"}</Button>
      </div>
    </form>
  );
}
