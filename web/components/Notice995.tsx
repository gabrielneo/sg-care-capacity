/**
 * The emergency line and "not medical advice", in one sentence everywhere it is short:
 * - "compact": under the page heading in the Planner and Analyst views.
 * - "footer": in the footer of every page.
 * The public view's full notice card is components/home/HomeHero.tsx. All three say to call 995, and 995 is always a tel: link.
 */
export const NOTICE_995_LINE = "This site shows public statistics, not medical advice.";

export function Notice995({ variant, className = "" }: { variant: "compact" | "footer"; className?: string }) {
  return (
    <p className={`text-small ${variant === "compact" ? "text-ink" : "text-muted"} ${className}`.trim()}
       data-testid={variant === "compact" ? "emergency-note" : "footer-notice"}>
      <span aria-hidden="true">✚ </span>
      <span className="font-semibold text-ink">Emergency?{" "}
        {/* The footer's link is the only 995 control on the public view: a 44px target there (the compact line stays one line). */}
        <a href="tel:995" className={variant === "footer" ? "inline-flex min-h-11 items-center" : undefined}>Call 995</a>.</span>{" "}
      {NOTICE_995_LINE}
    </p>
  );
}
