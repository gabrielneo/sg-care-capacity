import type { ReactNode } from "react";

/** A short caveat shown next to a figure. Warnings are for data-quality findings. */
export function CaveatChip({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  const style = tone === "warning" ? "border-warn/40 bg-warn-soft text-warn" : "border-line bg-page text-muted";
  return (
    <span className={`inline-flex max-w-full items-start gap-1 rounded-md border px-2 py-0.5 text-xs ${style}`}>
      <span aria-hidden="true">{tone === "warning" ? "!" : "i"}</span>
      <span className="sr-only">{tone === "warning" ? "Data-quality note: " : "Caveat: "}</span>
      <span>{children}</span>
    </span>
  );
}
