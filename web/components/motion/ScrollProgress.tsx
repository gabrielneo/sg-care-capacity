/**
 * A thin bar across the top that fills as the page scrolls. Pure CSS (a scroll timeline, app/globals.css): no script, and it
 * simply does not appear in browsers without scroll timelines or with reduced motion.
 */
export function ScrollProgress() {
  return <div aria-hidden="true" className="scroll-progress" data-testid="scroll-progress" />;
}
