"use client";

/** Error en el propio diseño de la aplicación: documento mínimo, sin dependencias. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <title>Error · RevisaYa</title>
        <div role="alert" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>Algo ha fallado</h1>
          <p style={{ color: "#5b616e" }}>Tus datos están a salvo. Vuelve a intentarlo en unos segundos.</p>
          <button type="button" onClick={() => retry()} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 8, border: 0, background: "#1f4fd8", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
