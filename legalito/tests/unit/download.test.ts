import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Ruta de descarga. La lectura de la versión se hace con la sesión del usuario
 * (RLS, probado contra PostgreSQL real en tests/integration/rls.test.ts); aquí
 * se comprueba la lógica de la ruta: autenticación, revocación, coherencia de
 * la ruta de almacenamiento y emisión de una URL firmada.
 */
const ORG = "11111111-1111-1111-1111-111111111111";
const VERSION = "22222222-2222-2222-2222-222222222222";

let sessionUser: { id: string; email: string } | null;
let versionRow: Record<string, unknown> | null;
const createSignedUrl = vi.fn();

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => sessionUser }));
vi.mock("@/lib/observability", () => ({ audit: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: versionRow }) }) }) }),
  }),
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}));

let GET: (req: NextRequest, ctx: { params: Promise<{ versionId: string }> }) => Promise<Response>;
beforeAll(async () => {
  ({ GET } = (await import("@/app/api/documentos/[versionId]/descargar/route")) as unknown as { GET: typeof GET });
});
beforeEach(() => {
  sessionUser = { id: "u1", email: "u@example.com" };
  versionRow = {
    id: VERSION,
    organization_id: ORG,
    version_number: 2,
    html_path: `${ORG}/aviso_legal/${VERSION}.html`,
    pdf_path: `${ORG}/aviso_legal/${VERSION}.pdf`,
    revoked_at: null,
    documents: { document_type: "aviso_legal" },
  };
  createSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: "https://storage.example/firmada?token=x" }, error: null });
});

const call = (id = VERSION, format = "pdf") =>
  GET(new NextRequest(`http://localhost/api/documentos/${id}/descargar?formato=${format}`), { params: Promise.resolve({ versionId: id }) });

describe("Descarga de documentos", () => {
  it("exige sesión", async () => {
    sessionUser = null;
    expect((await call()).status).toBe(401);
  });

  it("responde 404 si la versión no es del usuario (RLS no la devuelve)", async () => {
    versionRow = null;
    const r = await call();
    expect(r.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("rechaza identificadores mal formados", async () => {
    expect((await call("../../etc/passwd")).status).toBe(404);
  });

  it("bloquea documentos revocados (p. ej. compra reembolsada)", async () => {
    versionRow!.revoked_at = "2026-10-20T00:00:00Z";
    expect((await call()).status).toBe(403);
  });

  it("no firma rutas de almacenamiento de otra organización", async () => {
    versionRow!.pdf_path = `99999999-9999-9999-9999-999999999999/aviso_legal/${VERSION}.pdf`;
    expect((await call()).status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("redirige a una URL firmada de corta duración con nombre de archivo", async () => {
    const r = await call(VERSION, "html");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("https://storage.example/firmada?token=x");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(createSignedUrl).toHaveBeenCalledWith(`${ORG}/aviso_legal/${VERSION}.html`, 60, { download: "aviso-legal-v2.html" });
  });
});
