import type { Metadata } from "next";
import { UserStatusAction } from "@/components/admin/actions";
import { AdminTable, pageParams } from "@/components/admin/table";
import { SearchInput } from "@/components/app/url-filters";
import { Pagination } from "@/components/ui/pagination";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";
import { requireAdminPage } from "@/server/auth/session";
import { adminListUsers } from "@/server/services/admin";

export const metadata: Metadata = { title: "Usuarios" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const actor = await requireAdminPage();
  const { page, pageSize, q } = pageParams(await searchParams);
  const result = await adminListUsers(q, page, pageSize);
  return (
    <>
      <PageHeader title="Usuarios" description="Consulta de cuentas. La administración no puede iniciar sesión como otro usuario ni ver contraseñas." />
      <SearchInput placeholder="Buscar por correo o nombre" className="mb-4 max-w-md" />
      <AdminTable
        rows={result.items}
        rowKey={(user) => user.id}
        empty="No hay usuarios que coincidan."
        columns={[
          {
            header: "Usuario",
            cell: (user) => (
              <>
                <p className="font-medium">{user.full_name || "Sin nombre"}</p>
                <p className="text-xs text-muted">{user.email}</p>
              </>
            ),
          },
          { header: "Espacio", cell: (user) => <span className="text-muted">{user.workspaceName ?? "—"}</span> },
          { header: "Plan", cell: (user) => <Badge tone={user.planCode === "free" ? "neutral" : "brand"}>{user.planName}</Badge> },
          { header: "Alta", cell: (user) => <span className="whitespace-nowrap text-muted">{formatDate(user.created_at)}</span> },
          {
            header: "Estado",
            cell: (user) =>
              user.disabled_at ? (
                <>
                  <Badge tone="danger">Desactivada</Badge>
                  <p className="mt-1 max-w-56 text-xs text-muted">{user.disabled_reason}</p>
                </>
              ) : (
                <span className="flex gap-1.5">
                  <Badge tone="success">Activa</Badge>
                  {user.isAdmin ? <Badge tone="info">Admin</Badge> : null}
                </span>
              ),
          },
          { header: "Acciones", cell: (user) => <UserStatusAction userId={user.id} email={user.email} disabled={Boolean(user.disabled_at)} locked={user.id === actor.user.id || (user.isAdmin && !user.disabled_at)} /> },
        ]}
      />
      <Pagination page={page} pageCount={Math.ceil(result.total / pageSize)} total={result.total} pageSize={pageSize} basePath="/admin/usuarios" params={{ q }} noun="usuarios" />
    </>
  );
}
