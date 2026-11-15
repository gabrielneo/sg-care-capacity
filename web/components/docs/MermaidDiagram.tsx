"use client";

import { useEffect, useId, useState } from "react";

/**
 * A Mermaid diagram, drawn in the browser. Mermaid is loaded only when a diagram is on the page.
 * Until it renders (or if it can't), the diagram's source is shown. Every diagram in the docs is
 * followed by the same steps as text, for screen readers.
 */
export function MermaidDiagram({ chart }: { chart: string }) {
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        // Diagram text stays on the type scale (13px or larger): the quadrant chart's own defaults are 12px and 20px.
        mermaid.initialize({
          startOnLoad: false, securityLevel: "strict", theme: "neutral", fontFamily: "system-ui, sans-serif", themeVariables: { fontSize: "14px" },
          quadrantChart: { titleFontSize: 14, quadrantLabelFontSize: 13, pointLabelFontSize: 13, xAxisLabelFontSize: 13, yAxisLabelFontSize: 13 },
        });
        const out = await mermaid.render(id, chart);
        if (!cancelled) setSvg(out.svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  return (
    <figure className="doc-diagram" data-testid="mermaid" data-rendered={svg ? "true" : "false"}>
      {svg ? (
        // Mermaid's own output with securityLevel "strict" (labels are sanitised, no scripts or links).
        <div role="img" aria-label="Diagram. The same steps are written out in the text that follows."
             dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <pre tabIndex={0} aria-label="Diagram source">{chart}</pre>
      )}
      {failed ? <figcaption className="text-meta text-muted">The diagram couldn&apos;t be drawn; its source is shown instead.</figcaption> : null}
    </figure>
  );
}
