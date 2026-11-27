import { cssColors as colors } from "@/lib/palette";
import { type ScatterPoint, zeroScale } from "@/lib/longRun";

const H = 280;
const TOP = 10;
const BOTTOM = 34;
const XL = 11;     // % of width: room for the y labels
const XR = 97;

const num = (v: number, digits: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-SG", { maximumFractionDigits: digits })}`;

/**
 * The pairs a correlation was tested on, one dot each, on the server as plain SVG. Both axes hold 0, drawn darker: the "usual" (or
 * "no change") lines, so a dot's quadrant reads at a glance. No fitted line: the test is a rank correlation, and a straight line
 * would claim a shape it didn't test. x positions are percentages and y pixels, so dots keep their size at any width.
 */
export function Scatter({ points, xLabel, yLabel, summary, digits = 1, testId = "scatter" }: {
  points: ScatterPoint[]; xLabel: string; yLabel: string; summary: string; digits?: number; testId?: string;
}) {
  if (!points.length) return <p className="text-small text-muted" data-testid={`${testId}-empty`}>No pairs to draw.</p>;
  const xs = zeroScale(points.map((p) => p.x));
  const ys = zeroScale(points.map((p) => p.y));
  const x = (v: number) => XL + ((v - xs.min) / (xs.max - xs.min)) * (XR - XL);
  const y = (v: number) => TOP + (1 - (v - ys.min) / (ys.max - ys.min)) * (H - TOP - BOTTOM);
  return (
    <div>
      <p className="text-meta text-muted">{yLabel}</p>
      <svg width="100%" height={H} role="img" aria-label={summary} data-testid={testId}>
        {ys.ticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={`${XL}%`} x2={`${XR}%`} y1={y(t)} y2={y(t)} stroke={t === 0 ? colors.ink : colors.line} strokeWidth={t === 0 ? 1.25 : 1} />
            <text x={`${XL}%`} dx={-6} y={y(t) + 4} textAnchor="end" fontSize="13" fill={colors.muted}>{num(t, digits)}</text>
          </g>
        ))}
        {xs.ticks.map((t) => (
          <g key={`x${t}`}>
            <line x1={`${x(t)}%`} x2={`${x(t)}%`} y1={TOP} y2={H - BOTTOM} stroke={t === 0 ? colors.ink : colors.line} strokeWidth={t === 0 ? 1.25 : 1}
                  opacity={t === 0 ? 1 : 0.6} />
            <text x={`${x(t)}%`} y={H - BOTTOM + 18} textAnchor="middle" fontSize="13" fill={colors.muted}>{num(t, 0)}</text>
          </g>
        ))}
        {/* Styled once on the group, each dot only its place: a few hundred dots stay light. Exact values: the table and the CSV. */}
        <g data-testid={`${testId}-dots`} fill={colors["data-mark"]} fillOpacity={0.55} stroke={colors["data-mark"]} strokeWidth={0.75}>
          {points.map((p) => <circle key={p.date} cx={`${x(p.x).toFixed(2)}%`} cy={y(p.y).toFixed(1)} r={3.5} />)}
        </g>
      </svg>
      <p className="text-center text-meta text-muted">{xLabel}</p>
    </div>
  );
}

/** The pairs as a table: the chart's text alternative. */
export function ScatterTable({ points, xLabel, yLabel }: { points: ScatterPoint[]; xLabel: string; yLabel: string }) {
  return (
    <table className="w-full text-left text-small tabular-nums">
      <thead><tr><th scope="col">Date</th><th scope="col">{xLabel}</th><th scope="col">{yLabel}</th></tr></thead>
      <tbody>
        {points.map((p) => <tr key={p.date}><td>{p.date}</td><td>{num(p.x, 1)}</td><td>{num(p.y, 2)}</td></tr>)}
      </tbody>
    </table>
  );
}
