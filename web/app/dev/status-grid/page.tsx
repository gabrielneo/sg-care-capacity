import { notFound } from "next/navigation";

import { StatusGrid } from "@/components/home/StatusGrid";
import { devPagesEnabled } from "@/lib/devPages";
import { edMeta, gridSampleHospitals, gridSampleLive, gridSampleStatuses } from "@/lib/samples";

export const dynamic = "force-dynamic";
export const metadata = { title: "Status grid (sample data)", robots: { index: false } };

/** The hospital cards on sample data: eight EDs and the urgent care centre. Dev pages only; the layout tests measure it. */
export default function Page() {
  if (!devPagesEnabled()) notFound();
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-8">
      <p className="mb-4 text-small text-muted" data-testid="sample-banner">Sample data, not from MOH or NUHS.</p>
      <StatusGrid statuses={gridSampleStatuses} hospitals={gridSampleHospitals} live={gridSampleLive} meta={edMeta}
                  latestWeek={{ week_start: "2026-10-19", week_end: "2026-10-25" }} sort="usual" query="" />
    </main>
  );
}
