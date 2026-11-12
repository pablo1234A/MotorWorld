"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FormError, Input, Select, Textarea, fieldAria } from "@/components/ui/form";
import { ConfirmDialog, Dialog } from "@/components/ui/overlays";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { MARKETPLACE_OPTIONS, MARKETPLACE_PROFILES, platformName, type MarketplaceProfile, type TemplateConfiguration } from "@/domain/marketplaces/profiles";
import { LENGTHS, LENGTH_LABELS, TONES, TONE_LABELS } from "@/domain/product";
import { api, errorMessage } from "@/lib/api-client";
import { templateSchema } from "@/validation/schemas";

export type TemplateRow = { id: string; name: string; platform: string; is_active: boolean; configuration: TemplateConfiguration };
type Values = z.input<typeof templateSchema>;

const blankToUndefined = (value: unknown) => (value === "" || value === null || (typeof value === "number" && Number.isNaN(value)) ? undefined : value);

function TemplateDialog({ open, onOpenChange, template }: { open: boolean; onOpenChange: (open: boolean) => void; template: TemplateRow | null }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(templateSchema),
    defaultValues: { name: template?.name ?? "", platform: template?.platform ?? "generic", categoryId: null, isActive: template?.is_active ?? true, configuration: { includePrice: false, includeCta: true, includeLocation: true, hashtags: false, ...template?.configuration } },
  });
  const platform = useWatch({ control, name: "platform" });
  const base: MarketplaceProfile = (MARKETPLACE_PROFILES as Record<string, MarketplaceProfile>)[platform] ?? MARKETPLACE_PROFILES.generic;
  const config = errors.configuration ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={template ? "Editar plantilla" : "Nueva plantilla"} description="Parte de un perfil de plataforma y ajusta solo lo que necesites. Los campos vacíos usan el valor del perfil." size="lg">
      <form
        id="template-form"
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => {
          setFormError(null);
          const configuration = Object.fromEntries(Object.entries(values.configuration ?? {}).map(([key, value]) => [key, blankToUndefined(value)]).filter(([, value]) => value !== undefined));
          try {
            await api(template ? `/api/templates/${template.id}` : "/api/templates", { method: template ? "PATCH" : "POST", body: { ...values, configuration } });
            toast.success(template ? "Plantilla actualizada" : "Plantilla creada");
            onOpenChange(false);
            router.refresh();
          } catch (error) {
            setFormError(errorMessage(error));
          }
        })}
      >
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="template-name" error={errors.name?.message} required>
            <Input placeholder="Ej.: Wallapop con precio" {...fieldAria("template-name", errors.name?.message)} {...register("name")} />
          </Field>
          <Field label="Perfil base" htmlFor="template-platform" error={errors.platform?.message}>
            <Select {...fieldAria("template-platform", errors.platform?.message)} {...register("platform")}>
              {MARKETPLACE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="custom">Otro marketplace (personalizado)</option>
            </Select>
          </Field>
          <Field label="Máx. caracteres del título" htmlFor="template-title-max" error={config.titleMaxLength?.message} hint={`Perfil: ${base.titleMaxLength}`}>
            <Input type="number" min={20} max={300} placeholder={String(base.titleMaxLength)} {...fieldAria("template-title-max", config.titleMaxLength?.message)} {...register("configuration.titleMaxLength", { setValueAs: blankToUndefined })} />
          </Field>
          <Field label="Máx. caracteres de la descripción" htmlFor="template-description-max" error={config.descriptionMaxLength?.message} hint={`Perfil: ${base.descriptionMaxLength}`}>
            <Input type="number" min={100} max={20000} placeholder={String(base.descriptionMaxLength)} {...fieldAria("template-description-max", config.descriptionMaxLength?.message)} {...register("configuration.descriptionMaxLength", { setValueAs: blankToUndefined })} />
          </Field>
          <Field label="Formato de la descripción" htmlFor="template-format">
            <Select id="template-format" {...register("configuration.descriptionFormat", { setValueAs: blankToUndefined })}>
              <option value="">El del perfil ({base.descriptionFormat === "html" ? "HTML" : "texto plano"})</option>
              <option value="plain">Texto plano</option>
              <option value="html">HTML sencillo</option>
            </Select>
          </Field>
          <Field label="Idioma" htmlFor="template-language">
            <Select id="template-language" {...register("configuration.language", { setValueAs: blankToUndefined })}>
              <option value="">El del perfil</option>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
            </Select>
          </Field>
          <Field label="Tono por defecto" htmlFor="template-tone">
            <Select id="template-tone" {...register("configuration.defaultTone", { setValueAs: blankToUndefined })}>
              <option value="">El del perfil</option>
              {TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {TONE_LABELS[tone]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Extensión por defecto" htmlFor="template-length">
            <Select id="template-length" {...register("configuration.defaultLength", { setValueAs: blankToUndefined })}>
              <option value="">La del perfil</option>
              {LENGTHS.map((length) => (
                <option key={length} value={length}>
                  {LENGTH_LABELS[length]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Frase inicial fija" htmlFor="template-intro" hint="Sustituye a la frase de apertura. Ej.: «Envíos a toda la península en 24-48 h.»" optional>
          <Textarea id="template-intro" rows={2} maxLength={300} {...register("configuration.customIntro", { setValueAs: blankToUndefined })} />
        </Field>
        <Field label="Llamada a la acción fija" htmlFor="template-cta" optional>
          <Input id="template-cta" maxLength={300} {...register("configuration.customCta", { setValueAs: blankToUndefined })} />
        </Field>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(
            [
              ["configuration.includePrice", "Incluir el precio en la descripción"],
              ["configuration.includeCta", "Incluir llamada a la acción"],
              ["configuration.includeLocation", "Incluir la ubicación"],
              ["configuration.hashtags", "Añadir palabras clave como hashtags"],
              ["isActive", "Plantilla activa"],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="flex items-center gap-2.5 text-sm">
              <Checkbox {...register(name)} />
              {label}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {template ? "Guardar cambios" : "Crear plantilla"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function TemplatesManager({ templates, maxTemplates }: { templates: TemplateRow[]; maxTemplates: number | null }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ template: TemplateRow | null } | null>(null);
  const [deleting, setDeleting] = useState<TemplateRow | null>(null);
  const atLimit = maxTemplates !== null && templates.length >= maxTemplates;

  return (
    <Card>
      <CardHeader
        title="Mis plantillas"
        description={maxTemplates === null ? "Plantillas propias con tus límites y textos fijos." : `${templates.length} de ${maxTemplates} plantillas de tu plan.`}
        action={
          <Button size="sm" onClick={() => setDialog({ template: null })} disabled={atLimit}>
            <Plus aria-hidden /> Nueva plantilla
          </Button>
        }
      />
      {templates.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="Sin plantillas propias" description="Crea una plantilla para fijar tus propios límites de caracteres, tono, frase inicial o llamada a la acción, y reutilízala al generar." className="py-10" />
      ) : (
        <ul className="divide-y divide-line">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{template.name}</span>
                <span className="block text-xs text-muted">Basada en {platformName(template.platform)}</span>
              </span>
              {!template.is_active ? <Badge tone="warning">Inactiva</Badge> : null}
              <Button size="sm" variant="ghost" onClick={() => setDialog({ template })} aria-label={`Editar ${template.name}`}>
                <Pencil aria-hidden /> Editar
              </Button>
              <Button size="sm" variant="danger-ghost" onClick={() => setDeleting(template)} aria-label={`Eliminar ${template.name}`}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {atLimit ? <p className="border-t border-line px-5 py-3 text-[13px] text-muted">Has alcanzado el máximo de plantillas de tu plan.</p> : null}

      {dialog ? <TemplateDialog key={dialog.template?.id ?? "new"} open onOpenChange={(open) => !open && setDialog(null)} template={dialog.template} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="¿Eliminar esta plantilla?"
        description="Los anuncios creados con ella se conservan, pero dejarán de estar vinculados a la plantilla."
        confirmLabel="Eliminar plantilla"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/api/templates/${deleting.id}`, { method: "DELETE" });
            toast.success("Plantilla eliminada");
            router.refresh();
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </Card>
  );
}
