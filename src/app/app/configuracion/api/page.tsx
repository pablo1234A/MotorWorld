import type { Metadata } from "next";
import Link from "next/link";

import { CreateApiKeyForm, RevokeApiKeyButton } from "@/components/integrations/api-keys";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/dates";
import { isAdmin } from "@/server/auth/context";
import { requireOrgPage } from "@/server/auth/guards";
import { API_SCOPES, apiAvailable, apiConfigured, apiUsage, listApiKeys, SCOPE_LABELS } from "@/server/api/keys";
import { listAccessibleBranches } from "@/server/modules/branches/service";

export const metadata: Metadata = { title: "API · RevisaYa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ApiKeysPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireOrgPage("/app/configuracion/api");
  if (!isAdmin(ctx)) return <Alert tone="error" title="Sin permiso">Solo los administradores de la empresa pueden gestionar la API.</Alert>;
  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">API</h1>
      <p className="text-sm text-[var(--muted)]">
        Conecta tu programa de gestión con RevisaYa: clientes, vehículos, historial, citas y avisos.{" "}
        <a href="/api/v1/openapi.json" className="text-[var(--accent)] underline">
          Especificación OpenAPI
        </a>
        .
      </p>
    </div>
  );
  if (!apiAvailable(ctx)) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert tone="info" title="Incluida en el plan Excelencia">
          <Link href="/app/facturacion" className="underline">
            Cambiar de plan
          </Link>
        </Alert>
      </div>
    );
  }
  if (!apiConfigured()) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert tone="info" title="No configurada">Esta instalación de RevisaYa todavía no tiene la API activada (falta API_KEY_PEPPER).</Alert>
      </div>
    );
  }
  const revokedNow = (await searchParams).revocada === "1";
  const [keys, usage, branches] = await Promise.all([listApiKeys(ctx), apiUsage(ctx), listAccessibleBranches(ctx)]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <div className="flex flex-col gap-6">
      {header}
      {revokedNow ? <Alert tone="success">Clave revocada: deja de funcionar al momento.</Alert> : null}
      <p className="text-sm text-[var(--muted)]">
        Últimos 30 días: {usage.requests.toLocaleString("es-ES")} peticiones, {usage.errors.toLocaleString("es-ES")} con error.
      </p>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Claves activas</h2>
        <p className="text-sm text-[var(--muted)]">
          Cada clave actúa con tus permisos de administrador. Si dejas de ser administrador de la empresa, tus claves dejan de funcionar. Guárdalas como una
          contraseña: nunca en el código de una web ni en un correo.
        </p>
        {active.length === 0 ? (
          <p className="text-sm">Todavía no hay ninguna clave.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {active.map((k) => (
              <li key={k.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{k.name}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">{k.prefix}_••••</p>
                  <p className="break-words text-xs text-[var(--muted)]">
                    {k.scopes.join(" · ")}
                    {k.branchIds ? ` · solo ${k.branchIds.map((b) => branchName.get(b) ?? "otra delegación").join(", ")}` : ""}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    Creada el {formatDateTime(k.createdAt)}
                    {k.createdByEmail ? ` por ${k.createdByEmail}` : ""} · {k.lastUsedAt ? `último uso: ${formatDateTime(k.lastUsedAt)}` : "sin usar"}
                    {k.expiresAt ? ` · caduca el ${formatDateTime(k.expiresAt)}` : ""}
                  </p>
                </div>
                <RevokeApiKeyButton id={k.id} name={k.name} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Crear una clave</h2>
        <CreateApiKeyForm scopes={API_SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))} branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
      </Card>

      {revoked.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--muted)]">Claves revocadas ({revoked.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {revoked.map((k) => (
              <li key={k.id}>
                {k.name} · <span className="font-mono text-xs">{k.prefix}</span> · revocada el {formatDateTime(k.revokedAt!)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
