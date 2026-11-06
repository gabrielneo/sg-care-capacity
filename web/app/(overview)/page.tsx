import Link from "next/link";

import { ChartCard } from "@/components/ChartCard";
import { KpiTile } from "@/components/KpiTile";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import { shortNote } from "@/lib/hospitalNotes";
import { formatWeek, summaryParagraph, weekKpis } from "@/lib/summary";

export const dynamic = "force-dynamic"; // rendered per request; API responses are cached for an hour

const LINKS = [
  { href: "/ed-trends", title: "ED Trends", text: "Daily bed waits and attendances by hospital, by weekday, and how they relate." },
  { href: "/access-map", title: "Access Map", text: "CHAS and CDMP clinics for residents aged 65+, by planning area." },
  { href: "/live", title: "Live", text: "The latest NUHS emergency department wait estimates in this snapshot." },
  { href: "/data-quality", title: "Data Quality", text: "The checks every snapshot passes before it is published." },
];

export default async function OverviewPage() {
  const result = await settle(Promise.all([api.edSummary(), api.hospitals()]));
  if (!result.ok) {
    return (
      <>
        <PageHeader title="This week" />
        <ErrorState error={result.error} />
      </>
    );
  }
  const [summary, hospitals] = result.value;
  const k = weekKpis(summary.data);
  const byCode = new Map(hospitals.data.map((h) => [h.hospital_code, h]));
  const change = (v: number | null) => ({ value: v, unit: "%", label: "vs its previous 4-week average" });

  return (
    <>
      <PageHeader
        title="This week in Singapore's emergency departments"
        intro={
          k.week
            ? `The latest complete week MOH has published: ${formatWeek(k.week)}. A week counts as complete when all 7 days of both measures are in.`
            : "MOH figures for the latest complete week."
        }
      />

      {!k.week ? (
        <EmptyState title="No complete week yet" message="This snapshot has no week with all 7 days of MOH figures for any hospital." />
      ) : (
        <>
          <ChartCard title="In plain English" meta={summary.meta} caveat={null}>
            <p className="max-w-prose text-ink">{summaryParagraph(k, hospitals.data)}</p>
          </ChartCard>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Across all hospitals</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <KpiTile
              label={`Attendances, week of ${formatWeek(k.week)}`}
              value={k.attendances.total}
              unit="patients"
              format={(v) => v.toLocaleString("en-SG")}
              meta={summary.meta}
              change={{ value: k.attendances.changePct, unit: "%", label: "vs the previous 4-week average" }}
              caveat={k.missing.length ? `Leaves out ${k.missing.map((m) => m.code).join(", ")} (no complete week)` : undefined}
            />
            <KpiTile
              label="Hospitals above their previous 4-week average wait"
              value={k.above.outOf ? k.above.count : null}
              unit={`of ${k.above.outOf}`}
              format={(v) => String(v)}
              meta={summary.meta}
              caveat={k.above.codes.length ? `Above: ${k.above.codes.join(", ")}` : undefined}
            />
          </div>

          <h2 className="mb-1 mt-8 text-lg font-semibold">Average of daily median waits for a ward bed</h2>
          <p className="mb-3 max-w-prose text-sm text-muted">
            MOH publishes a median for each day; this is the average of the week&apos;s daily medians, not a weekly median.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {k.current.map((h) => {
              const hospital = byCode.get(h.code);
              const note = hospital ? shortNote(hospital) : null;
              return (
                <KpiTile
                  key={h.code}
                  label={`${h.name.replace(/\s*\(UCC\)$/, "")} (${h.code})`}
                  value={h.wait}
                  unit="hours"
                  meta={summary.meta}
                  change={change(h.waitChangePct)}
                  caveat={note ?? undefined}
                />
              );
            })}
          </div>
        </>
      )}

      <h2 className="mb-3 mt-10 text-lg font-semibold">Details</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block rounded-lg border border-line bg-surface p-4 no-underline hover:border-accent">
              <span className="font-medium text-accent">{l.title} →</span>
              <span className="mt-1 block text-sm text-muted">{l.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
