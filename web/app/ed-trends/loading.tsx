import { ChartCardSkeleton, Skeleton } from "@/components/States";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-1/3" label="Loading emergency department trends" />
      <ChartCardSkeleton title="Time waiting for a ward bed after the decision to admit" />
      <ChartCardSkeleton title="The latest week against the usual level" />
      <ChartCardSkeleton title="Bed wait by day of the week" />
    </div>
  );
}
