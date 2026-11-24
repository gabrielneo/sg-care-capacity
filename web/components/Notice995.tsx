/**
 * The emergency line and "not medical advice", in one sentence, in the footer of every page (the landing page's hero has its own
 * short line). 995 is always a tel: link.
 */
export const NOTICE_995_LINE = "This site shows public statistics for information only. It isn't medical advice and doesn't show current hospital availability.";

export function Notice995({ className = "" }: { variant?: "footer"; className?: string }) {
  return (
    <p className={`text-small text-muted ${className}`.trim()} data-testid="footer-notice">
      <span aria-hidden="true">✚ </span>
      <span className="font-semibold text-ink">Emergency?{" "}
        <a href="tel:995" className="inline-flex min-h-11 items-center">Call 995</a>.</span>{" "}
      {NOTICE_995_LINE}
    </p>
  );
}
