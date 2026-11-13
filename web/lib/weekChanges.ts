/**
 * What changed since the week before: which hospitals' badge moved.
 *
 * Both weeks use the same rule as the cards (lib/status.ts): last week against the median of the 8
 * complete weeks before it. A hospital counts only if it has a badge in BOTH weeks; one without a
 * comparison in either week is counted as "not compared", never as "unchanged".
 * No new statistic: this reads two badges already defined, side by side.
 */
import type { EdWeek } from "./api/types";
import { usualLevels } from "./edCompare";
import { hospitalStatus, type HospitalStatus, type Level } from "./status";

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export interface Move {
  code: string;
  from: Level;
  to: Level;
  /** Positive = busier than the week before (by badge scale), negative = quieter. */
  step: number;
}

export interface WeekChanges {
  /** Start of the week before the latest complete week; null when there is no latest week. */
  previousWeek: string | null;
  moved: Move[];
  /** Hospitals with a badge in both weeks that kept it. */
  unchanged: number;
  /** Hospitals missing a badge in either week. */
  notCompared: number;
}

const SCALE: Record<Level, number> = { lower: 0, usual: 1, higher: 2, much_higher: 3, unknown: -1 };

/** The hospitals whose badge differs between the previous complete week and the latest, busiest-now first. */
export function weekChanges(weekly: EdWeek[], codes: string[], latest: string | null, current: HospitalStatus[]): WeekChanges {
  if (!latest) return { previousWeek: null, moved: [], unchanged: 0, notCompared: codes.length };
  const previousWeek = addDays(latest, -7);
  const usual = usualLevels(weekly, codes, previousWeek);
  const before = new Map(codes.map((c) => [c, hospitalStatus(c, usual[c], weekly, previousWeek)]));
  const moved: Move[] = [];
  let unchanged = 0;
  let notCompared = 0;
  for (const now of current) {
    const was = before.get(now.code);
    if (!was || was.level === "unknown" || now.level === "unknown") {
      notCompared += 1;
    } else if (was.level === now.level) {
      unchanged += 1;
    } else {
      moved.push({ code: now.code, from: was.level, to: now.level, step: SCALE[now.level] - SCALE[was.level] });
    }
  }
  moved.sort((a, b) => Math.abs(b.step) - Math.abs(a.step) || SCALE[b.to] - SCALE[a.to] || a.code.localeCompare(b.code));
  return { previousWeek, moved, unchanged, notCompared };
}
