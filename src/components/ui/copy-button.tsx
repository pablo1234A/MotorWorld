"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonVariant } from "./button";

export async function copyText(text: string, label = "Copiado al portapapeles"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
    return true;
  } catch {
    toast.error("No se pudo copiar. Selecciona el texto y cópialo manualmente.");
    return false;
  }
}

export function CopyButton({ text, label, variant = "secondary", size = "sm" }: { text: string | (() => string); label: string; variant?: ButtonVariant; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      onClick={async () => {
        if (await copyText(typeof text === "function" ? text() : text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {label}
    </Button>
  );
}
