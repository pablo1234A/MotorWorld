"use client";
import { useState } from "react";
import { Input, Select, Checkbox } from "@/components/ui/Field";

export type BusinessData = {
  name: string; legalName: string; taxId: string; addressLine: string; city: string; postalCode: string; country: string; phone: string; website: string;
  reviewUrl: string; reviewPlatform: string; senderName: string; replyToEmail: string; timezone: string; resendCooldownDays: number; trackClicks: boolean;
};
export const emptyBusiness: BusinessData = {
  name: "", legalName: "", taxId: "", addressLine: "", city: "", postalCode: "", country: "ES", phone: "", website: "",
  reviewUrl: "", reviewPlatform: "google", senderName: "", replyToEmail: "", timezone: "Europe/Madrid", resendCooldownDays: 30, trackClicks: true,
};

export const PLATFORMS = [
  ["google", "Google (Perfil de Empresa)"],
  ["tripadvisor", "Tripadvisor"],
  ["trustpilot", "Trustpilot"],
  ["facebook", "Facebook"],
  ["otro", "Otra plataforma"],
];
const TZ = ["Europe/Madrid", "Atlantic/Canary", "Europe/Lisbon", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome", "America/Mexico_City", "America/Bogota", "America/Argentina/Buenos_Aires"];

export function BusinessFields({ value, onChange, errors, sections = ["basic", "review", "sender", "legal", "advanced"] }: { value: BusinessData; onChange: (v: BusinessData) => void; errors?: Record<string, string>; sections?: string[] }) {
  const set = <K extends keyof BusinessData>(k: K, v: BusinessData[K]) => onChange({ ...value, [k]: v });
  const [showGoogleHelp, setShowGoogleHelp] = useState(false);
  return (
    <div className="space-y-8">
      {sections.includes("basic") ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-semibold">Tu negocio</legend>
          <Input wrapperClassName="sm:col-span-2" label="Nombre comercial" required value={value.name} onChange={(e) => set("name", e.target.value)} error={errors?.name} help="Es el nombre que verán tus clientes en los correos." />
          <Input label="Teléfono" value={value.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" />
          <Input label="Web" type="url" placeholder="https://" value={value.website} onChange={(e) => set("website", e.target.value)} error={errors?.website} />
        </fieldset>
      ) : null}
      {sections.includes("review") ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-semibold">Dónde quieres recibir las reseñas</legend>
          <Select label="Plataforma" value={value.reviewPlatform} onChange={(e) => set("reviewPlatform", e.target.value)}>
            {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input
            label="Enlace directo para dejar una reseña"
            type="url"
            placeholder="https://g.page/r/…/review"
            value={value.reviewUrl}
            onChange={(e) => set("reviewUrl", e.target.value)}
            error={errors?.reviewUrl}
            help={<button type="button" className="underline" onClick={() => setShowGoogleHelp((s) => !s)}>¿Cómo consigo el enlace de Google?</button>}
          />
          {showGoogleHelp ? (
            <div className="rounded-lg bg-cream-200 p-4 text-sm text-ink-700 sm:col-span-2">
              Entra en tu Perfil de Empresa de Google (busca el nombre de tu negocio en Google con la sesión iniciada), pulsa <strong>«Pedir reseñas»</strong> y copia el enlace que aparece (empieza por <code>https://g.page/r/</code>).
            </div>
          ) : null}
        </fieldset>
      ) : null}
      {sections.includes("sender") ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-semibold">Remitente</legend>
          <Input label="Nombre del remitente (opcional)" placeholder={value.name || "Nombre del negocio"} value={value.senderName} onChange={(e) => set("senderName", e.target.value)} help="Por defecto, el nombre comercial." />
          <Input label="Responder a (opcional)" type="email" placeholder="atencion@tunegocio.es" value={value.replyToEmail} onChange={(e) => set("replyToEmail", e.target.value)} error={errors?.replyToEmail} help="Si quieres que las respuestas vayan a otra dirección." />
        </fieldset>
      ) : null}
      {sections.includes("legal") ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold">Datos de identificación del remitente</legend>
          <p className="text-xs text-ink-500 sm:col-span-2">Aparecen al pie de cada correo (LSSI-CE exige identificar al remitente) y se usan en tus facturas.</p>
          <Input label="Razón social" value={value.legalName} onChange={(e) => set("legalName", e.target.value)} />
          <Input label="NIF / CIF" value={value.taxId} onChange={(e) => set("taxId", e.target.value.toUpperCase())} />
          <Input wrapperClassName="sm:col-span-2" label="Dirección" value={value.addressLine} onChange={(e) => set("addressLine", e.target.value)} autoComplete="street-address" />
          <Input label="Código postal" value={value.postalCode} onChange={(e) => set("postalCode", e.target.value)} autoComplete="postal-code" />
          <Input label="Ciudad" value={value.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" />
        </fieldset>
      ) : null}
      {sections.includes("advanced") ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-semibold">Preferencias de envío</legend>
          <Select label="Zona horaria" value={value.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {TZ.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
          <Input label="No repetir solicitud al mismo cliente durante (días)" type="number" min={0} max={365} value={value.resendCooldownDays} onChange={(e) => set("resendCooldownDays", Number(e.target.value))} help="Evita pedir reseña varias veces a la misma persona. 0 = sin límite." />
          <Checkbox className="sm:col-span-2" checked={value.trackClicks} onChange={(e) => set("trackClicks", e.target.checked)} label="Medir los clics en el enlace de reseña (redirección a través de Reseñalo, sin cookies)." />
        </fieldset>
      ) : null}
    </div>
  );
}

export function toPayload(v: BusinessData) {
  return { ...v, resendCooldownDays: Number(v.resendCooldownDays) || 0 };
}
export function fromBusiness(b: Record<string, unknown>): BusinessData {
  const out = { ...emptyBusiness };
  for (const k of Object.keys(out) as (keyof BusinessData)[]) {
    const v = b[k];
    if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
