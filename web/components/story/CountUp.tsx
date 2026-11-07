/**
 * A number that counts up once, as rolling digits (an odometer). CSS only, no JavaScript:
 * - The final value is in the server-rendered HTML, for screen readers, search and readers without
 *   JavaScript. The animation starts at first paint, so there is no jump when the page hydrates.
 * - Only transform is animated (each digit's column slides up), 600 ms, ease-out, once.
 * - Each digit is a fixed-width cell (tabular figures), so nothing shifts while it rolls.
 * - prefers-reduced-motion: no animation; the final value is shown at once (globals.css).
 * The animation runs at first paint, so use it for a number that is on screen when the page loads (the hero).
 */
export function CountUp({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  return (
    <span className={`countup ${className}`} data-testid="countup" data-value={value}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="countup-digits">
        {[...value].map((ch, i) =>
          /\d/.test(ch) ? (
            <span key={i} className="countup-cell">
              <span className="countup-roll" data-digit={ch}>{ch}</span>
            </span>
          ) : (
            <span key={i}>{ch}</span>
          ),
        )}
      </span>
    </span>
  );
}
