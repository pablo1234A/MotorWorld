import { Skeleton } from "@/components/ui/primitives";

export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72" />
    </div>
  );
}
