"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

import { type ButtonVariant as Variant, buttonClass } from "./button-styles";


export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

/** Botón de envío que se desactiva y muestra "pendiente" mientras la acción se ejecuta. */
export function SubmitButton({
  children,
  pendingLabel = "Guardando…",
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, className)} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}
