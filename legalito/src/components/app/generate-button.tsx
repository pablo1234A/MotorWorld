"use client";

import { useActionState } from "react";
import { FileCheck2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/field";
import { generateNow } from "@/lib/actions/forms";
import { initialFormState } from "@/lib/actions/types";

export function GenerateButton({
  label = "Generar mis documentos",
  documentType,
  variant = "primary",
  size = "md",
}: {
  label?: string;
  documentType?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const [state, action] = useActionState(generateNow, initialFormState);
  return (
    <form action={action} className="space-y-3">
      {documentType && <input type="hidden" name="document_type" value={documentType} />}
      <SubmitButton variant={variant} size={size} pendingLabel={documentType ? "Regenerando…" : "Generando documentos…"}>
        <FileCheck2 className="h-4 w-4" /> {label}
      </SubmitButton>
      <FormMessage state={state.error ? { error: state.error } : null} />
    </form>
  );
}
