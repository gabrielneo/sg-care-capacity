import { ChartFrameSkeleton, Skeleton } from "@/components/States";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-1/3" label="Loading the access map" />
      <ChartFrameSkeleton title="Clinic access by area" />
    </div>
  );
}
