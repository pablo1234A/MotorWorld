import { Skeleton } from "@/components/ui/feedback";

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-11" />
      <Skeleton className="h-11" />
      <Skeleton className="h-11" />
    </div>
  );
}
