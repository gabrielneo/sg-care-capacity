/** Week labels: "19–25 Oct 2026", "26 Oct – 1 Nov 2026", "29 Dec 2025 – 4 Jan 2026". */
export interface WeekRange {
  week_start: string;
  week_end: string;
}

const MONTH = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", month: "short" });
const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return { y, d, mon: MONTH.format(new Date(Date.UTC(y, m - 1, d))) };
};

export function formatWeek(week: WeekRange): string {
  const a = parts(week.week_start);
  const b = parts(week.week_end);
  if (a.y !== b.y) return `${a.d} ${a.mon} ${a.y} – ${b.d} ${b.mon} ${b.y}`;
  if (a.mon !== b.mon) return `${a.d} ${a.mon} – ${b.d} ${b.mon} ${b.y}`;
  return `${a.d}–${b.d} ${b.mon} ${b.y}`;
}
