import { ChartCardSkeleton, Skeleton } from "@/components/States";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-1/3" label="Loading the access map" />
      <ChartCardSkeleton title="Clinic access by planning area" />
    </div>
  );
}
