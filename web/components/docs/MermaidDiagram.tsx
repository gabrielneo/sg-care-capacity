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
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", fontFamily: "system-ui, sans-serif" });
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
      {failed ? <figcaption className="text-xs text-muted">The diagram couldn&apos;t be drawn; its source is shown instead.</figcaption> : null}
    </figure>
  );
}
