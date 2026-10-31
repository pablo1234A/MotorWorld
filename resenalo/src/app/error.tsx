"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold">Algo ha fallado</h1>
      <p className="mt-2 text-ink-600">Se ha producido un error inesperado. Ya lo hemos registrado.</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-ink-800 px-4 py-2 text-sm font-semibold text-white">Reintentar</button>
    </main>
  );
}
