import { prisma } from "@/server/db";
import { Logo } from "@/components/brand/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Darse de baja", robots: { index: false } };

/** Página de baja del destinatario (enlace del pie del correo). Requiere confirmación (POST) para evitar bajas por escáneres de enlaces. */
export default async function Unsubscribe({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ hecho?: string }> }) {
  const { token } = await params;
  const { hecho } = await searchParams;
  const job = /^[A-Za-z0-9_-]{10,64}$/.test(token) ? await prisma.emailJob.findUnique({ where: { publicToken: token }, include: { business: { select: { name: true } }, customer: { select: { unsubscribedAt: true } } } }) : null;
  const done = hecho || job?.customer.unsubscribedAt;
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center"><Logo size="sm" /></div>
        {!job ? (
          <p className="text-sm text-ink-600">Este enlace no es válido o ha caducado.</p>
        ) : done ? (
          <>
            <h1 className="text-xl font-semibold">Baja confirmada</h1>
            <p className="mt-2 text-sm text-ink-600">No recibirás más solicitudes de opinión de {job.business.name}.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">¿Dejar de recibir solicitudes de opinión?</h1>
            <p className="mt-2 text-sm text-ink-600">{job.business.name} no volverá a enviarte solicitudes de reseña a través de Reseñalo.</p>
            <form method="post" action={`/api/public/unsubscribe/${token}`} className="mt-6">
              <button className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-ink-800 px-5 text-sm font-semibold text-white hover:bg-ink-900">Confirmar la baja</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
