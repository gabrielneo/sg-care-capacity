import type { Metadata } from "next";

import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Case Study" };

export default function CaseStudyPage() {
  return (
    <ComingNext
      title="Case Study"
      intro="The problem, the approach and what the data shows."
      planned={["The question", "How the data was gathered and checked", "Findings and their limits"]}
    />
  );
}
