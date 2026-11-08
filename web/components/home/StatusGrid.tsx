import { Provenance } from "@/components/Provenance";
import { Glossed } from "@/components/terms/Glossed";
import type { Hospital, LiveReading, Meta } from "@/lib/api/types";
import { BED_WAIT_SHORT } from "@/lib/copy";
import { type HospitalStatus, HIGHER_PCT, MUCH_HIGHER_PCT } from "@/lib/status";
import { formatWeek, type WeekRange } from "@/lib/weeks";

import { StatusCard } from "./StatusCard";

/** Every public ED as a status card, busiest first. */
export function StatusGrid({ statuses, hospitals, live, meta, latestWeek }: {
  statuses: HospitalStatus[]; hospitals: Hospital[]; live: LiveReading[]; meta: Meta; latestWeek: WeekRange | null }) {
  const byCode = new Map(hospitals.map((h) => [h.hospital_code, h]));
  const liveFor = (code: string) => live.find((r) => r.hospital_code === code && r.is_adult_ed) ?? null;
  return (
    <section aria-labelledby="status-heading" className="py-8" data-testid="status-grid">
      <h2 id="status-heading" className="text-xl font-semibold tracking-tight text-ink">
        How busy were hospital emergency departments last week?
      </h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        {latestWeek ? <>Week of {formatWeek(latestWeek)}, compared with each hospital&apos;s own usual week. </> : null}
        <Glossed text={BED_WAIT_SHORT} />
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statuses.map((s) => (
          <StatusCard key={s.code} status={s} isUcc={byCode.get(s.code)?.facility_type === "UCC"} live={liveFor(s.code)} />
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted" data-testid="status-key">
        Usual = the middle of the 8 weeks before. Higher = {HIGHER_PCT}% or more above usual; much higher = {MUCH_HIGHER_PCT}% or more.
        The line shows the last 12 weeks.
      </p>
      <Provenance meta={meta} compact />
    </section>
  );
}
