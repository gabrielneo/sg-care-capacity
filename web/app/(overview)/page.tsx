import Link from "next/link";

import { ChartCard } from "@/components/ChartCard";
import { KpiTile } from "@/components/KpiTile";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/States";
import { Glossed } from "@/components/terms/Glossed";
import { Term } from "@/components/terms/Term";
import { api, settle } from "@/lib/api/client";
import { BED_WAIT_EXPLAINER, BED_WAIT_LABEL, BED_WAIT_UNIT_WEEKLY, CAVEAT, plainError } from "@/lib/copy";
import { shortNote } from "@/lib/hospitalNotes";
import { formatWeek, summaryParagraph, weekKpis } from "@/lib/summary";

export const dynamic = "force-dynamic"; // rendered per request; API responses are cached for an hour

const LINKS = [
  { href: "/ed-trends", title: "ED Trends", text: "Daily bed waits and ED visits, by hospital and weekday." },
  { href: "/access-map", title: "Access Map", text: "CHAS and CDMP GP clinics for residents aged 65+, by area." },
  { href: "/live", title: "Live", text: "The latest NUHS ED wait estimates in this week's data release." },
  { href: "/data-quality", title: "Data Quality", text: "The checks every weekly data release passes before it is published." },
];

export default async function OverviewPage() {
  const result = await settle(Promise.all([api.edSummary(), api.hospitals()]));
  if (!result.ok) {
    return (
      <>
        <PageHeader title="This week" />
        <ErrorState error={plainError(result.error)} />
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
          k.week ? (
            <>
              <Glossed text={`The latest complete week published by MOH: ${formatWeek(k.week)}.`} /> A week is complete when all 7 days
              have both figures.
            </>
          ) : (
            <Glossed text="MOH figures for the latest complete week." />
          )
        }
      />

      {!k.week ? (
        <EmptyState title="No complete week yet" message={<Glossed text="This week's data release has no complete week of MOH figures for any hospital." />} />
      ) : (
        <>
          <ChartCard title="In plain English" meta={summary.meta} caveat={CAVEAT.weeklyAverage}>
            <p className="max-w-prose text-ink"><Glossed text={summaryParagraph(k, hospitals.data)} /></p>
          </ChartCard>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Across all hospitals</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <KpiTile
              label={<><Term id="ed" /> visits, week of {formatWeek(k.week)}</>}
              value={k.attendances.total}
              unit="visits"
              format={(v) => v.toLocaleString("en-SG")}
              meta={summary.meta}
              change={{ value: k.attendances.changePct, unit: "%", label: "vs the previous 4-week average" }}
              caveat={k.missing.length ? `Leaves out ${k.missing.map((m) => m.code).join(", ")} (no complete week)` : undefined}
            />
            <KpiTile
              label="Hospitals with a longer bed wait than their previous 4-week average"
              value={k.above.outOf ? k.above.count : null}
              unit={`of ${k.above.outOf}`}
              format={(v) => String(v)}
              meta={summary.meta}
              caveat={k.above.codes.length ? `Longer wait: ${k.above.codes.join(", ")}` : undefined}
            />
          </div>

          <h2 className="mb-1 mt-8 text-lg font-semibold">{BED_WAIT_LABEL}</h2>
          <p className="mb-1 max-w-prose text-sm text-muted">
            Hours, average of each day&apos;s <Term id="median">median</Term>, for the week of {formatWeek(k.week)}.
          </p>
          <p className="mb-3 max-w-prose text-sm text-ink" data-testid="bed-wait-explainer"><Glossed text={BED_WAIT_EXPLAINER} /></p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {k.current.map((h) => {
              const hospital = byCode.get(h.code);
              const note = hospital ? shortNote(hospital) : null;
              return (
                <KpiTile
                  key={h.code}
                  label={<Term id={h.code.toLowerCase()} />}
                  value={h.wait}
                  unit={BED_WAIT_UNIT_WEEKLY}
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
              <span className="font-medium text-accent"><Glossed text={l.title} plain /> →</span>
              <span className="mt-1 block text-sm text-muted"><Glossed text={l.text} plain /></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
