// Página provisional. La web pública (inicio, precios, legal…) se construye en
// la Fase 10; hasta entonces no se muestran botones ni formularios que aún no
// tengan backend real.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">RevisaYa</h1>
        <p className="mt-3 text-base text-[var(--muted)]">
          Avisos automáticos de revisión para talleres mecánicos. En construcción.
        </p>
      </div>
    </main>
  );
}
