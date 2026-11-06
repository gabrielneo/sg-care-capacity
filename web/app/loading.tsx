import { ChartCardSkeleton, Skeleton } from "@/components/States";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-2/3" label="Loading page" />
      <ChartCardSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-36 rounded-lg border border-line bg-surface p-4">
            <div className="h-full rounded bg-map-none motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
