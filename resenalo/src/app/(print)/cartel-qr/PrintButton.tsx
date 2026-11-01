"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
export function PrintButton() {
  return <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimir</Button>;
}
