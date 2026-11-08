"use client";

import { buttonClass } from "@/components/ui/button-styles";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary")}>
      {label}
    </button>
  );
}
