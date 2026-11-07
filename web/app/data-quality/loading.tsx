import { ChartCardSkeleton, Skeleton } from "@/components/States";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-1/3" label="Loading data quality" />
      <ChartCardSkeleton title="Check results" />
      <ChartCardSkeleton title="Emergency department coverage: hospital × day" />
    </div>
  );
}
