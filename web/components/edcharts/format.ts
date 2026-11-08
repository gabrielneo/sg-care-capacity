/** Number formats shared by the ED Trends charts. Hours to one decimal, as everywhere on the site. */
export const hours = (v: number) => v.toLocaleString("en-SG", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "+0.8", "−1.2", "0.0": a difference, signed. */
export function signed(v: number, digits = 1): string {
  const text = Math.abs(v).toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return Number(text) === 0 ? text : `${v > 0 ? "+" : "−"}${text}`;
}

const DAY = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", day: "numeric", month: "short" });
/** "19 Oct". */
export const shortDay = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));
