"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, fieldAria } from "@/components/ui/form";
import { ConfirmDialog, Dialog } from "@/components/ui/overlays";
import { ApiClientError, api, errorMessage } from "@/lib/api-client";
import { changeEmailSchema, changePasswordSchema, deleteAccountSchema, profileSchema, workspaceSchema } from "@/validation/schemas";

export function ProfileForm({ fullName, email, avatarUrl }: { fullName: string; email: string; avatarUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<z.input<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { fullName } });

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return void toast.error("La imagen supera los 2 MB.");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      await api("/api/account/avatar", { formData });
      toast.success("Foto de perfil actualizada");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={handleSubmit(async (values) => {
        try {
          await api("/api/account", { method: "PATCH", body: values });
          toast.success("Perfil actualizado");
          reset(values);
          router.refresh();
        } catch (error) {
          toast.error(errorMessage(error));
        }
      })}
    >
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal de Storage privado
          <img src={avatarUrl} alt="Tu foto de perfil" className="size-16 rounded-full border border-line object-cover" />
        ) : (
          <span className="flex size-16 items-center justify-center rounded-full bg-ink font-display text-xl font-semibold text-white">{(fullName || email).slice(0, 1).toUpperCase()}</span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" loading={uploading} onClick={() => input.current?.click()}>
            <Camera aria-hidden /> Cambiar foto
          </Button>
          {avatarUrl ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await api("/api/account/avatar", { method: "DELETE" });
                  router.refresh();
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              <Trash2 aria-hidden /> Quitar
            </Button>
          ) : null}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => upload(event.target.files?.[0])} aria-label="Foto de perfil" />
          <p className="w-full text-xs text-muted">JPG, PNG o WebP · máximo 2 MB.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="profile-name" error={errors.fullName?.message}>
          <Input autoComplete="name" {...fieldAria("profile-name", errors.fullName?.message)} {...register("fullName")} />
        </Field>
        <Field label="Correo electrónico" htmlFor="profile-email" hint={<ChangeEmail current={email} />}>
          <Input id="profile-email" value={email} disabled readOnly />
        </Field>
      </div>
      <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
        Guardar perfil
      </Button>
    </form>
  );
}

function ChangeEmail({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof changeEmailSchema>>({ resolver: zodResolver(changeEmailSchema), defaultValues: { email: "", password: "" } });

  return (
    <>
      <button type="button" className="font-medium text-brand-strong hover:underline" onClick={() => setOpen(true)}>
        Cambiar correo
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setSentTo(null);
            reset();
          }
        }}
        title="Cambiar correo electrónico"
        description={sentTo ? undefined : `Tu correo actual es ${current}. El cambio no se aplica hasta que lo confirmes desde el enlace que te enviaremos.`}
        size="sm"
      >
        {sentTo ? (
          <p className="text-sm leading-relaxed text-ink-soft" role="status">
            Te hemos enviado un enlace de confirmación a <strong>{sentTo}</strong> y otro a tu correo actual. Abre ambos para completar el cambio; hasta entonces seguirás entrando con {current}.
          </p>
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={handleSubmit(async (values) => {
              setFormError(null);
              try {
                await api("/api/account/email", { body: values });
                setSentTo(values.email);
              } catch (error) {
                if (error instanceof ApiClientError && Object.keys(error.fields).length > 0) {
                  for (const [field, message] of Object.entries(error.fields)) setError(field as "email" | "password", { message });
                } else setFormError(errorMessage(error));
              }
            })}
          >
            <FormError message={formError} />
            <Field label="Nuevo correo electrónico" htmlFor="email-new" error={errors.email?.message}>
              <Input type="email" autoComplete="email" {...fieldAria("email-new", errors.email?.message)} {...register("email")} />
            </Field>
            <Field label="Tu contraseña" htmlFor="email-password" error={errors.password?.message}>
              <Input type="password" autoComplete="current-password" {...fieldAria("email-password", errors.password?.message)} {...register("password")} />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Enviar confirmación
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

export function PasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", password: "", confirmPassword: "" } });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        try {
          await api("/api/account/password", { body: values });
          toast.success("Contraseña actualizada. Se han cerrado las demás sesiones.");
          reset();
        } catch (error) {
          if (error instanceof ApiClientError && error.fields.currentPassword) setError("currentPassword", { message: error.fields.currentPassword });
          else setFormError(errorMessage(error));
        }
      })}
    >
      <FormError message={formError} />
      <Field label="Contraseña actual" htmlFor="password-current" error={errors.currentPassword?.message} className="sm:max-w-sm">
        <Input type="password" autoComplete="current-password" {...fieldAria("password-current", errors.currentPassword?.message)} {...register("currentPassword")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nueva contraseña" htmlFor="password-new" error={errors.password?.message} hint="Mínimo 8 caracteres, con letras y números.">
          <Input type="password" autoComplete="new-password" {...fieldAria("password-new", errors.password?.message)} {...register("password")} />
        </Field>
        <Field label="Confirmar nueva contraseña" htmlFor="password-confirm" error={errors.confirmPassword?.message}>
          <Input type="password" autoComplete="new-password" {...fieldAria("password-confirm", errors.confirmPassword?.message)} {...register("confirmPassword")} />
        </Field>
      </div>
      <Button type="submit" loading={isSubmitting}>
        Cambiar contraseña
      </Button>
    </form>
  );
}

export function SessionsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-muted">Si has iniciado sesión en un dispositivo que ya no usas o sospechas de un acceso no autorizado, cierra todas las sesiones excepto esta.</p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Cerrar las demás sesiones
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Cerrar las demás sesiones?"
        description="Se cerrará la sesión en todos los navegadores y dispositivos excepto en este."
        confirmLabel="Cerrar sesiones"
        variant="primary"
        onConfirm={async () => {
          try {
            await api("/api/account/sessions", { method: "DELETE" });
            toast.success("Se han cerrado las demás sesiones");
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}

export function DeleteAccount({ available }: { available: boolean }) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof deleteAccountSchema>>({ resolver: zodResolver(deleteAccountSchema), defaultValues: { password: "", confirmation: "" as "ELIMINAR" } });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-muted">Elimina de forma definitiva tu cuenta, tus productos, fotografías, anuncios e historial. Esta acción no se puede deshacer.</p>
        <Button variant="danger" onClick={() => setOpen(true)} disabled={!available}>
          Eliminar mi cuenta
        </Button>
      </div>
      {!available ? <p className="mt-2 text-[13px] text-warning">La eliminación de cuentas no está disponible en este entorno (falta la clave de servicio del servidor).</p> : null}
      <Dialog open={open} onOpenChange={setOpen} title="Eliminar cuenta definitivamente" description="Se borrarán todos tus datos y archivos. Si tienes una suscripción de pago activa, se cancelará." size="sm">
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            setFormError(null);
            try {
              await api("/api/account", { method: "DELETE", body: values });
              window.location.assign("/?cuenta=eliminada");
            } catch (error) {
              if (error instanceof ApiClientError && error.fields.password) setError("password", { message: error.fields.password });
              else setFormError(errorMessage(error));
            }
          })}
        >
          <FormError message={formError} />
          <Field label="Tu contraseña" htmlFor="delete-password" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...fieldAria("delete-password", errors.password?.message)} {...register("password")} />
          </Field>
          <Field label='Escribe "ELIMINAR" para confirmar' htmlFor="delete-confirmation" error={errors.confirmation?.message}>
            <Input autoComplete="off" {...fieldAria("delete-confirmation", errors.confirmation?.message)} {...register("confirmation")} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={isSubmitting}>
              Eliminar definitivamente
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function BillingActions({ plans, hasBilling }: { plans: { code: string; name: string }[]; hasBilling: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function go(key: string, path: string, body?: unknown) {
    setBusy(key);
    try {
      const { url } = await api<{ url: string }>(path, { method: "POST", body });
      window.location.assign(url);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {plans.map((plan) => (
        <Button key={plan.code} variant="secondary" loading={busy === plan.code} disabled={busy !== null} onClick={() => go(plan.code, "/api/billing/checkout", { plan: plan.code })}>
          Contratar {plan.name}
        </Button>
      ))}
      {hasBilling ? (
        <Button loading={busy === "portal"} disabled={busy !== null} onClick={() => go("portal", "/api/billing/portal")}>
          Gestionar facturación
        </Button>
      ) : null}
    </div>
  );
}

export function WorkspaceForm({ name, canEdit }: { name: string; canEdit: boolean }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<z.input<typeof workspaceSchema>>({ resolver: zodResolver(workspaceSchema), defaultValues: { name } });
  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={handleSubmit(async (values) => {
        try {
          await api("/api/workspace", { method: "PATCH", body: values });
          toast.success("Espacio de trabajo actualizado");
          reset(values);
          router.refresh();
        } catch (error) {
          toast.error(errorMessage(error));
        }
      })}
    >
      <Field label="Nombre del espacio de trabajo" htmlFor="workspace-name" error={errors.name?.message} className="min-w-64 flex-1 sm:max-w-md">
        <Input disabled={!canEdit} {...fieldAria("workspace-name", errors.name?.message)} {...register("name")} />
      </Field>
      <Button type="submit" loading={isSubmitting} disabled={!canEdit || !isDirty}>
        Guardar
      </Button>
    </form>
  );
}

export function CustomCategories({ categories, parents }: { categories: { id: string; name: string; parentName: string | null }[]; parents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  async function add() {
    if (name.trim().length < 2) return void toast.error("Escribe un nombre de al menos 2 caracteres.");
    setBusy(true);
    try {
      await api("/api/categories", { body: { name, parentId: parentId || null } });
      toast.success("Categoría creada");
      setName("");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nueva categoría" htmlFor="category-name" className="min-w-52 flex-1">
          <Input id="category-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Ej.: Instrumentos musicales" onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), void add())} />
        </Field>
        <Field label="Dentro de" htmlFor="category-parent" className="w-full sm:w-64">
          <span className="relative block">
            <select id="category-parent" value={parentId} onChange={(event) => setParentId(event.target.value)} className="h-10 w-full appearance-none rounded-[10px] border border-line-strong bg-surface px-3 text-sm shadow-card">
              <option value="">Categoría principal</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
          </span>
        </Field>
        <Button onClick={add} loading={busy}>
          Añadir
        </Button>
      </div>
      {categories.length > 0 ? (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span>
                {category.parentName ? <span className="text-muted">{category.parentName} › </span> : null}
                <span className="font-medium">{category.name}</span>
              </span>
              <Button size="sm" variant="danger-ghost" onClick={() => setDeleting(category)} aria-label={`Eliminar ${category.name}`}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">No has creado categorías propias. Las del sistema cubren los sectores más habituales.</p>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`¿Eliminar «${deleting?.name ?? ""}»?`}
        description="Los productos de esta categoría no se borran: quedarán sin categoría."
        confirmLabel="Eliminar categoría"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/api/categories/${deleting.id}`, { method: "DELETE" });
            toast.success("Categoría eliminada");
            router.refresh();
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </div>
  );
}
