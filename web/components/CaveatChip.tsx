import type { ReactNode } from "react";

/**
 * A short caveat shown next to a figure, set as a footnote: a thin rule on the left and plain text, not a pill (owner's review,
 * 16 Nov 2026). Warnings are for data-quality findings and keep a visible "!" and an amber rule, so the difference is never colour
 * alone. `large` is the public view's 14px size. The screen-reader label ("Caveat:", "Data-quality note:") is unchanged.
 */
export function CaveatChip({ children, tone = "info", large = false }: { children: ReactNode; tone?: "info" | "warning"; large?: boolean }) {
  const warning = tone === "warning";
  return (
    <span className={`flex max-w-prose items-start gap-2 border-l-2 pl-3 ${large ? "text-small" : "text-meta"} ${warning ? "border-status-higher text-ink" : "border-control text-muted"}`}>
      {warning ? <span aria-hidden="true" className="font-semibold text-status-higher">!</span> : null}
      <span className="sr-only">{warning ? "Data-quality note: " : "Caveat: "}</span>
      <span>{children}</span>
    </span>
  );
}
