/**
 * The landing page's line: a series drawn as SVG path data (no chart library). A missing value breaks the line into pieces
 * and is never joined; a lone point is a dot, not a line. The y axis starts at 0 so the line's height is its value.
 */
export interface LinePoint {
  label: string;
  value: number | null;
}

export interface DrawnLine {
  /** One "M x y L x y …" string per unbroken run (a run of one point is a dot). */
  paths: string[];
  dots: { x: number; y: number }[];
  /** The area under each run of two or more points, closed down to the axis. */
  areas: string[];
  last: { x: number; y: number; value: number; label: string } | null;
  top: number;
}

export function drawLine(points: LinePoint[], width: number, height: number, pad = 8): DrawnLine {
  const known = points.filter((p): p is LinePoint & { value: number } => p.value != null);
  if (!known.length) return { paths: [], dots: [], areas: [], last: null, top: 0 };
  const top = Math.max(...known.map((p) => p.value)) * 1.1 || 1;
  const x = (i: number) => pad + (points.length <= 1 ? 0 : (i * (width - 2 * pad)) / (points.length - 1));
  const y = (v: number) => height - pad - (v / top) * (height - 2 * pad);
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  points.forEach((p, i) => {
    if (p.value == null) { if (run.length) runs.push(run); run = []; return; }
    run.push({ x: x(i), y: y(p.value) });
  });
  if (run.length) runs.push(run);
  const f = (n: number) => n.toFixed(1);
  const lastIndex = points.reduce((k, p, i) => (p.value != null ? i : k), -1);
  const lastPoint = points[lastIndex] as LinePoint & { value: number };
  return {
    paths: runs.filter((r) => r.length > 1).map((r) => r.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join(" ")),
    dots: runs.filter((r) => r.length === 1).map((r) => r[0] as { x: number; y: number }),
    areas: runs.filter((r) => r.length > 1).map((r) =>
      `${r.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join(" ")} L${f(r.at(-1)!.x)} ${f(height - pad)} L${f(r[0]!.x)} ${f(height - pad)} Z`),
    last: { x: x(lastIndex), y: y(lastPoint.value), value: lastPoint.value, label: lastPoint.label },
    top,
  };
}

/**
 * Round values for the y axis of a line drawn by drawLine (which starts at 0 and runs to `top`): 0 and up to five steps of
 * 1, 2 or 5 × 10^n, all below `top`, each with its height as a % of the drawing (for labels placed beside it in HTML).
 */
export function lineTicks(top: number, height: number, pad = 8): { value: number; pct: number }[] {
  if (!(top > 0)) return [];
  const raw = top / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: { value: number; pct: number }[] = [];
  for (let v = 0; v < top; v += step) {
    const y = height - pad - (v / top) * (height - 2 * pad);
    ticks.push({ value: Number(v.toFixed(6)), pct: (y / height) * 100 });
  }
  return ticks;
}
