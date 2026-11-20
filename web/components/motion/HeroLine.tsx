import type { LinePoint } from "@/lib/heroLine";

import { MonthLine } from "../charts/MonthLine";

/** The landing page's moving picture: the monthly bed-wait line, drawn in as the page loads (components/charts/MonthLine.tsx). */
export function HeroLine({ points, summary }: { points: LinePoint[]; summary: string }) {
  return <MonthLine points={points} summary={summary} animate gradientId="hero-area" />;
}
