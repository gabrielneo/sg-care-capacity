import type { ReactNode } from "react";

/** A short caveat shown next to a figure. Warnings are for data-quality findings. `large` is the public view's 14px size. */
export function CaveatChip({ children, tone = "info", large = false }: { children: ReactNode; tone?: "info" | "warning"; large?: boolean }) {
  const style = tone === "warning" ? "border-status-higher/40 bg-status-higher-soft text-status-higher" : "border-line bg-page text-muted";
  return (
    <span className={`inline-flex max-w-full items-start gap-1 rounded-md border px-2 py-1 ${large ? "text-small" : "text-meta"} ${style}`}>
      <span aria-hidden="true">{tone === "warning" ? "!" : "i"}</span>
      <span className="sr-only">{tone === "warning" ? "Data-quality note: " : "Caveat: "}</span>
      <span>{children}</span>
    </span>
  );
}
