import { Alert } from "@/components/ui/feedback";

export function ReadOnlyNotice() {
  return (
    <Alert tone="warning" title="Modo de solo lectura">
      Tu taller no tiene un plan activo: puedes consultar los datos, pero no crear ni modificar fichas.
    </Alert>
  );
}
