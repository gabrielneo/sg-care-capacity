import { ComingNext } from "@/components/ComingNext";

export default function OverviewPage() {
  return (
    <ComingNext
      title="Overview"
      intro="How Singapore's emergency departments and community clinics are coping as the population ages."
      planned={[
        "Latest complete week: bed waits and attendances per hospital, against the previous 4 weeks",
        "Clinic access for residents aged 65+: the planning areas with the fewest CDMP clinics per 1,000 seniors",
        "How current each source is",
      ]}
    />
  );
}
