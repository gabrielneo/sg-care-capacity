import type { Metadata } from "next";

import { ComingNext } from "@/components/ComingNext";

export const metadata: Metadata = { title: "Methodology" };

export default function MethodologyPage() {
  return (
    <ComingNext
      title="Methodology"
      intro="How each figure is defined, where it comes from and what it can't tell you."
      planned={[
        "Definitions, units and caveats for every measure",
        "How access is measured: SVY21 distances, planning-area boundaries, mixed data vintages",
        "What isn't included, and why",
      ]}
    />
  );
}
