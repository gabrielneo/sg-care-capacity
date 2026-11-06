/**
 * "This week" for the Overview: the KPI figures and a plain-English paragraph, from /ed/summary.
 * Rule-based on purpose: every sentence is a fixed template filled with the numbers, so it can't
 * say anything the data doesn't. A hospital without the figure is named as missing, never guessed.
 */
import type { EdSummary, Hospital } from "./api/types";

export interface WeekRange {
  week_start: string;
  week_end: string;
}

export interface HospitalWeek {
  code: string;
  name: string;
  facilityType: string;
  wait: number | null;
  waitBaseline: number | null;
  waitChangePct: number | null;
  attendances: number | null;
}

export interface WeekKpis {
  week: WeekRange | null;
  /** Hospitals whose latest complete week is `week`. */
  current: HospitalWeek[];
  /** Hospitals with no complete week, or an older one. */
  missing: { code: string; name: string }[];
  attendances: { total: number | null; baseline: number | null; changePct: number | null; hospitals: number };
  above: { count: number; outOf: number; codes: string[] };
}

const pct = (change: number | null | undefined, base: number | null | undefined) =>
  change == null || base == null || base === 0 ? null : (change / base) * 100;

export function weekKpis(rows: EdSummary[]): WeekKpis {
  const starts = rows.map((r) => r.latest_complete_week?.week_start).filter((s): s is string => !!s).sort();
  const newest = starts.at(-1) ?? null;
  const currentRows = rows.filter((r) => r.is_current && r.latest_complete_week?.week_start === newest);
  const current: HospitalWeek[] = currentRows.map((r) => ({
    code: r.hospital_code,
    name: r.hospital_name,
    facilityType: r.facility_type,
    wait: r.mean_of_daily_median_wait_hours.latest ?? null,
    waitBaseline: r.mean_of_daily_median_wait_hours.baseline_mean ?? null,
    waitChangePct: r.mean_of_daily_median_wait_hours.change_pct ?? null,
    attendances: r.total_attendances.latest ?? null,
  }));
  const withAtt = currentRows.filter((r) => r.total_attendances.latest != null);
  const total = withAtt.length ? withAtt.reduce((s, r) => s + (r.total_attendances.latest ?? 0), 0) : null;
  const allBase = withAtt.length > 0 && withAtt.every((r) => r.total_attendances.baseline_mean != null);
  const baseline = allBase ? withAtt.reduce((s, r) => s + (r.total_attendances.baseline_mean ?? 0), 0) : null;
  const compared = current.filter((h) => h.waitChangePct != null && h.waitBaseline != null && h.wait != null);
  const aboveCodes = compared.filter((h) => (h.wait as number) > (h.waitBaseline as number)).map((h) => h.code);
  const week = newest ? currentRows[0]?.latest_complete_week : null;
  return {
    week: week ? { week_start: week.week_start, week_end: week.week_end } : null,
    current,
    missing: rows.filter((r) => !currentRows.includes(r)).map((r) => ({ code: r.hospital_code, name: r.hospital_name })),
    attendances: { total, baseline, changePct: total != null && baseline != null ? pct(total - baseline, baseline) : null,
                   hospitals: withAtt.length },
    above: { count: aboveCodes.length, outOf: compared.length, codes: aboveCodes },
  };
}

const MONTH = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", month: "short" });
const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return { y, d, mon: MONTH.format(date) };
};

/** "19–25 Oct 2026", "26 Oct – 1 Nov 2026", "29 Dec 2025 – 4 Jan 2026". */
export function formatWeek(week: WeekRange): string {
  const a = parts(week.week_start);
  const b = parts(week.week_end);
  if (a.y !== b.y) return `${a.d} ${a.mon} ${a.y} – ${b.d} ${b.mon} ${b.y}`;
  if (a.mon !== b.mon) return `${a.d} ${a.mon} – ${b.d} ${b.mon} ${b.y}`;
  return `${a.d}–${b.d} ${b.mon} ${b.y}`;
}

const hours = (v: number) => `${v.toLocaleString("en-SG", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} hours`;
const count = (v: number) => v.toLocaleString("en-SG", { maximumFractionDigits: 0 });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

function label(h: HospitalWeek, hospitals: Map<string, Hospital>): string {
  return hospitals.get(h.code)?.facility_type === "UCC" || h.facilityType === "UCC"
    ? `${h.name.replace(/\s*\(UCC\)$/, "")} (an urgent care centre)`
    : h.name;
}

export function summaryParagraph(k: WeekKpis, hospitalList: Hospital[] = []): string {
  if (!k.week || k.current.length === 0) {
    return "No hospital has a complete week of MOH data in this snapshot yet, so there is nothing to summarise.";
  }
  const hospitals = new Map(hospitalList.map((h) => [h.hospital_code, h]));
  const out: string[] = [];
  const waits = k.current.filter((h) => h.wait != null).sort((a, b) => (a.wait as number) - (b.wait as number));
  const lo = waits[0];
  const hi = waits.at(-1);
  if (lo && hi && lo !== hi) {
    out.push(`In the week of ${formatWeek(k.week)}, the average of daily median waits for a ward bed ranged from ` +
             `${hours(lo.wait as number)} at ${label(lo, hospitals)} to ${hours(hi.wait as number)} at ${label(hi, hospitals)}.`);
  } else if (lo) {
    out.push(`In the week of ${formatWeek(k.week)}, the average of daily median waits for a ward bed was ` +
             `${hours(lo.wait as number)} at ${label(lo, hospitals)}.`);
  }
  const { count: n, outOf: m } = k.above;
  if (m === 0) out.push("No hospital had four complete earlier weeks to compare with.");
  else if (m === 1) {
    const only = k.current.find((h) => h.waitChangePct != null);
    out.push(`The one hospital with a comparison${only ? `, ${only.name},` : ""} was ${n === 1 ? "above" : "not above"} its previous 4-week average.`);
  } else if (n === 0) out.push(`None of the ${m} hospitals with a comparison was above its previous 4-week average.`);
  else out.push(`${n} of ${m} hospitals ${n === 1 ? "was" : "were"} above ${n === 1 ? "its" : "their"} previous 4-week average.`);
  const a = k.attendances;
  if (a.total != null) {
    const who = a.hospitals === 1 ? "It" : `Together the ${a.hospitals} hospitals`;
    let trend = "";
    if (a.changePct != null) {
      const p = Math.abs(a.changePct).toLocaleString("en-SG", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
      trend = Math.abs(a.changePct) < 0.5 ? ", about the same as the 4-week average"
        : `, ${p}% ${a.changePct > 0 ? "more" : "fewer"} than the 4-week average`;
    }
    out.push(`${who} recorded ${count(a.total)} attendances${trend}.`);
  }
  if (k.missing.length) {
    const names = k.missing.map((h) => h.name);
    out.push(`${list(names)} ${names.length === 1 ? "has" : "have"} no complete data for that week and ${names.length === 1 ? "is" : "are"} left out.`);
  }
  return out.join(" ");
}
