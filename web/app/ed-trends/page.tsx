import type { Metadata } from "next";

import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "ED Trends" };

export default function EdTrendsPage() {
  return (
    <ComingNext
      title="ED Trends"
      intro="Daily and weekly emergency department bed waits and attendances, from MOH."
      planned={[
        "Median wait for a ward bed by hospital, daily and as weekly averages of daily medians",
        "Attendances by hospital, with incomplete weeks marked",
        "Alexandra Hospital shown as an Urgent Care Centre, not ranked against EDs",
      ]}
    />
  );
}
