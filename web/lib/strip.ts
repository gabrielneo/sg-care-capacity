/**
 * The site strip's content: how many hospitals are busier than usual, and how fresh each dataset is.
 * Built on the server (app/strip.json) from the same statuses as the cards, so the strip can't disagree
 * with them, and with the age worked out there: the browser's clock is never used to judge freshness.
 * `now` is injected, so tests never read the real clock.
 */
import type { EdWeek, Hospital, LiveReading, Meta } from "./api/types";
import { formatAsOf } from "./dates";
import { latestCompleteWeek, usualLevels } from "./edCompare";
import { CADENCE_TEXT, freshness, type Level } from "./freshness";
import { aboveUsual } from "./planner";
import { sourceDates } from "./provenance";
import { hospitalStatus, levelCounts } from "./status";
import { formatWeek } from "./weeks";

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export interface StripPill {
  id: "bed" | "doctor";
  /** "Bed waits", "Doctor-wait estimates". */
  dataset: string;
  /** Publisher, e.g. "MOH". */
  source: string;
  level: Level;
  /** "Up to date", "Due an update", "Out of date", "Date unknown". */
  label: string;
  /** "weekly · as of 31 Oct 2026 · 11 days old", or "some hospitals only · updated 11 Nov 2026, 12:01 pm SGT" for the estimates. */
  detail: string;
  /** The source's own as_of, as the API gave it. */
  asOf: string;
}

export interface StripData {
  /** Hospitals with a status (dim_hospital rows). */
  total: number;
  /** Higher or much higher than usual. */
  above: number;
  /** Hospitals with nothing to compare against: said separately, never counted as "not busier". */
  noComparison: number;
  /** "19–25 Oct 2026". */
  week: string | null;
  pills: StripPill[];
  /** The bed-wait source's name and as-of date, for the line under the count (null if the API gave none). */
  bed: { source: string; asOf: string } | null;
}

interface Inputs {
  hospitals: Hospital[];
  weekly: EdWeek[];
  weeklyMeta: Meta | null;
  live: LiveReading[];
  liveMeta: Meta | null;
  now: Date;
}

function pillFor(id: StripPill["id"], dataset: string, meta: Meta | null, now: Date): StripPill | null {
  const src = meta ? sourceDates(meta.sources)[0] : undefined;
  if (!src) return null;
  const f = freshness(src.asOf, src.cadence, now);
  // The date is written out, not only the age: a visitor on a phone can't hover for it.
  const detail = id === "doctor"
    ? `some hospitals only · updated ${formatAsOf(src.asOf, { withTime: true })}`
    : `${CADENCE_TEXT[src.cadence].replace(" data", "")} · as of ${formatAsOf(src.asOf)}${f.age ? ` · ${f.age} old` : ""}`;
  return { id, dataset, source: src.name, level: f.level, label: f.label, detail, asOf: src.asOf };
}

export function buildStrip({ hospitals, weekly, weeklyMeta, live, liveMeta, now }: Inputs): StripData | null {
  if (!hospitals.length || !weeklyMeta) return null;
  const codes = hospitals.map((h) => h.hospital_code);
  const latest = latestCompleteWeek(weekly);
  const usual = usualLevels(weekly, codes, latest);
  const statuses = codes.map((c) => hospitalStatus(c, usual[c], weekly, latest));
  const pills = [
    pillFor("bed", "Bed waits", weeklyMeta, now),
    // Only where NUHS publishes an estimate: no reading, no pill.
    live.length ? pillFor("doctor", "Doctor-wait estimates", liveMeta, now) : null,
  ].filter((p): p is StripPill => p != null);
  const bedPill = pills.find((p) => p.id === "bed");
  return {
    total: statuses.length,
    above: aboveUsual(statuses).length,
    noComparison: levelCounts(statuses).unknown,
    week: latest ? formatWeek({ week_start: latest, week_end: addDays(latest, 6) }) : null,
    pills,
    bed: bedPill ? { source: bedPill.source, asOf: bedPill.asOf } : null,
  };
}
