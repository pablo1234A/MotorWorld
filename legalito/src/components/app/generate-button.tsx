"use client";

import { useActionState } from "react";
import { FileCheck2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/field";
import { generateNow } from "@/lib/actions/forms";
import { initialFormState } from "@/lib/actions/types";

export function GenerateButton({ label = "Generar mis documentos" }: { label?: string }) {
  const [state, action] = useActionState(generateNow, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <SubmitButton pendingLabel="Generando documentos…">
        <FileCheck2 className="h-4 w-4" /> {label}
      </SubmitButton>
      <FormMessage state={state.error ? { error: state.error } : null} />
    </form>
  );
}
