import { ChartCardSkeleton, Skeleton } from "@/components/States";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-1/3" label="Loading ED trends" />
      <ChartCardSkeleton title="Daily median wait for a ward bed" />
      <ChartCardSkeleton title="Day-of-week pattern" />
      <ChartCardSkeleton title="Wait vs attendances" />
    </div>
  );
}
