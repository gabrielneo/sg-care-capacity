import type { ReactNode } from "react";

import { AsIsFlow } from "./diagrams/AsIsFlow";
import { StakeholderMap } from "./diagrams/StakeholderMap";
import { ToBeFlow } from "./diagrams/ToBeFlow";

/**
 * Hand-laid SVG versions of diagrams in docs/*.md. The Markdown keeps its Mermaid source (GitHub draws that), and
 * a "%% designed: <name>" line in it asks the site to show the version laid out here instead: drawn on the server,
 * coloured by the theme tokens (.dg-* in app/globals.css), no Mermaid script on the page. The text version of each
 * diagram still follows it in the doc.
 */
export const DESIGNED: Record<string, () => ReactNode> = {
  "stakeholder-map": StakeholderMap,
  "as-is-flow": AsIsFlow,
  "to-be-flow": ToBeFlow,
};

/** The name in a Mermaid source's "%% designed: <name>" line, if a designed version exists for it. */
export function designedName(chart: string): string | null {
  const name = chart.match(/^\s*%%\s*designed:\s*([a-z0-9-]+)\s*$/m)?.[1];
  return name && name in DESIGNED ? name : null;
}

export function DesignedDiagram({ name }: { name: string }) {
  const Diagram = DESIGNED[name];
  if (!Diagram) return null;
  return (
    <figure className="doc-diagram dg-frame" data-testid="diagram" tabIndex={0} aria-label="Diagram (scrolls sideways on a narrow screen)">
      <Diagram />
    </figure>
  );
}
