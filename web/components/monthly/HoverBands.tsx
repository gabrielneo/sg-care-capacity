/**
 * Exact values on hover, for a chart drawn on the server (LineChart, ChangeBars). One clear (unpainted) column per x label over the plot:
 * pointing at it shows a guide line, a dot on each line at that month, and a tooltip with every series' value there. CSS only
 * (app/globals.css, .hover-bands), so it works before any script loads and adds no JavaScript.
 *
 * It is hidden from screen readers and out of the tab order on purpose: the same figures, every one, are in the chart's
 * "Show as table" and its CSV, which are the accessible route (40 or more tab stops per chart would not be).
 */
export interface HoverBand {
  /** Left edge and width of the column, in % of the chart's width. */
  left: number;
  width: number;
  /** The x label in full ("October 2026"). */
  title: string;
  /** One line per series, in legend order: its name (optional for a single series), its value as text, its colour. */
  rows: { label?: string; value: string; color?: string }[];
  /** Dots to mark on the lines at this x, at their y in px from the top of the chart. */
  marks?: { y: number; color: string }[];
}

export function HoverBands({ bands, plotTop, plotBottom, testId = "hover-bands" }: {
  bands: HoverBand[]; plotTop: number; plotBottom: number; testId?: string;
}) {
  const last = bands.length - 1;
  return (
    <div className="hover-bands" aria-hidden="true" data-testid={testId} style={{ top: plotTop, height: plotBottom - plotTop }}>
      {bands.map((b, i) => (
        <div key={`${b.title}-${i}`} className="hover-band" style={{ left: `${b.left}%`, width: `${b.width}%` }} data-testid="hover-band">
          <span className="hover-guide" />
          {b.marks?.map((m, k) => (
            <span key={k} className="hover-mark" style={{ top: m.y - plotTop, background: m.color }} />
          ))}
          {/* Near either edge the tooltip opens inwards, so it never runs off the chart. */}
          <span className={`hover-tip ${i < bands.length * 0.2 ? "hover-tip-start" : i > last - bands.length * 0.2 ? "hover-tip-end" : ""}`}
                data-testid="hover-tip">
            <span className="hover-tip-title">{b.title}</span>
            {b.rows.map((r, k) => (
              <span key={k} className="hover-tip-row">
                {r.color ? <span className="hover-swatch" style={{ background: r.color }} /> : null}
                {r.label ? <span className="hover-tip-label">{r.label}</span> : null}
                <span className="hover-tip-value">{r.value}</span>
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
