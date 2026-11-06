import type { Metadata } from "next";

import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Data Quality" };

export default function DataQualityPage() {
  return (
    <ComingNext
      title="Data Quality"
      intro="The checks every snapshot passes before it is published."
      planned={[
        "Results of the validation run behind the current snapshot",
        "What was quarantined and why",
        "How current each source is",
      ]}
    />
  );
}
