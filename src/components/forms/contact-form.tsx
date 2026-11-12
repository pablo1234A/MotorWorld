"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Textarea, fieldAria } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api-client";
import { contactSchema } from "@/validation/schemas";

type Values = z.input<typeof contactSchema>;

export function ContactForm({ defaults }: { defaults?: { name?: string; email?: string } }) {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(contactSchema), defaultValues: { name: defaults?.name ?? "", email: defaults?.email ?? "", subject: "", message: "", website: "" } });

  if (sent) {
    return (
      <div className="flex flex-col items-center py-10 text-center" role="status">
        <CheckCircle2 className="size-10 text-success" aria-hidden />
        <h2 className="mt-4 text-xl font-semibold">Mensaje enviado</h2>
        <p className="mt-2 max-w-sm text-sm text-muted">Hemos recibido tu consulta. Te responderemos al correo que has indicado.</p>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        setFormError(null);
        try {
          await api("/api/contact", { body: values });
          setSent(true);
        } catch (error) {
          setFormError(errorMessage(error));
        }
      })}
    >
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="contact-name" error={errors.name?.message} required>
          <Input autoComplete="name" {...fieldAria("contact-name", errors.name?.message)} {...register("name")} />
        </Field>
        <Field label="Correo electrónico" htmlFor="contact-email" error={errors.email?.message} required>
          <Input type="email" autoComplete="email" {...fieldAria("contact-email", errors.email?.message)} {...register("email")} />
        </Field>
      </div>
      <Field label="Asunto" htmlFor="contact-subject" error={errors.subject?.message} required>
        <Input {...fieldAria("contact-subject", errors.subject?.message)} {...register("subject")} />
      </Field>
      <Field label="Mensaje" htmlFor="contact-message" error={errors.message?.message} required>
        <Textarea rows={6} {...fieldAria("contact-message", errors.message?.message)} {...register("message")} />
      </Field>
      {/* Campo trampa para bots: oculto a personas y lectores de pantalla. */}
      <div className="hidden" aria-hidden>
        <label>
          Sitio web
          <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
        </label>
      </div>
      <Button type="submit" loading={isSubmitting}>
        Enviar mensaje
      </Button>
    </form>
  );
}
