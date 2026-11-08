/** Day lists and gap counts for the ED Trends charts. A missing day is a gap: never 0, never joined. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export type WideRow = { date: string } & Record<string, number | null | string>;

/** Days in the range with no value for each hospital (absent rows and null values alike). */
export function missingDays(wide: WideRow[], codes: string[]): Record<string, number> {
  return Object.fromEntries(codes.map((c) => [c, wide.filter((r) => r[c] == null).length]));
}
