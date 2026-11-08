import Link from "next/link";

import type { Mode } from "@/lib/edCompare";

/** "vs own usual level" (the default) or raw values across hospitals. Links, so the choice is in the URL. */
export function ModeToggle({ mode, params }: { mode: Mode; params: Record<string, string | string[] | undefined> }) {
  const href = (m: Mode) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "mode" || v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [v]) q.append(k, one);
    }
    if (m === "raw") q.set("mode", "raw");
    const s = q.toString();
    return s ? `/ed-trends?${s}` : "/ed-trends";
  };
  const options: { m: Mode; label: string }[] = [
    { m: "usual", label: "Each against its own usual level" },
    { m: "raw", label: "Raw values across hospitals" },
  ];
  return (
    <nav aria-label="Compare" className="mb-6 inline-flex flex-wrap rounded-md border border-line bg-surface p-1" data-testid="mode-toggle">
      {options.map((o) => (
        <Link key={o.m} href={href(o.m)} aria-current={mode === o.m ? "page" : undefined}
              className={`flex min-h-11 items-center rounded px-4 text-sm font-medium no-underline ${
                mode === o.m ? "bg-accent-soft text-accent-strong" : "text-muted hover:text-ink"}`}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
