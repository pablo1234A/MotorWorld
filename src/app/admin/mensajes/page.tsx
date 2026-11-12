import type { Metadata } from "next";
import { ContactHandledAction } from "@/components/admin/actions";
import { pageParams } from "@/components/admin/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import { adminListContactMessages } from "@/server/services/admin";

export const metadata: Metadata = { title: "Mensajes" };

export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page, pageSize } = pageParams(await searchParams, 20);
  const result = await adminListContactMessages(page, pageSize);
  return (
    <>
      <PageHeader title="Mensajes de contacto" description="Consultas recibidas desde el formulario público. Responde por correo y márcalas como atendidas." />
      {result.items.length === 0 ? (
        <p className="rounded-card border border-line bg-surface px-5 py-10 text-center text-sm text-muted shadow-card">No hay mensajes.</p>
      ) : (
        <div className="space-y-3">
          {result.items.map((message) => (
            <Card key={message.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{message.subject}</p>
                  <p className="text-[13px] text-muted">
                    {message.name} ·{" "}
                    <a href={`mailto:${message.email}`} className="text-brand-strong hover:underline">
                      {message.email}
                    </a>{" "}
                    · {formatDateTime(message.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {message.handled_at ? <Badge tone="success">Atendido</Badge> : <Badge tone="warning">Pendiente</Badge>}
                  <ContactHandledAction id={message.id} handled={Boolean(message.handled_at)} />
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{message.message}</p>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} pageCount={Math.ceil(result.total / pageSize)} total={result.total} pageSize={pageSize} basePath="/admin/mensajes" params={{}} noun="mensajes" />
    </>
  );
}
