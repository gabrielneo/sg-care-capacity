import Link from "next/link";

/**
 * Says how often the figures on a page change, so a page that looks the same from one week to the
 * next is not mistaken for one that has stopped updating. No dates here on purpose: the note
 * can't go out of date. The release in use is in the footer.
 * - "case-study": written up from annual and slow-moving data.
 * - "findings": recomputed every Sunday, but only a test that passes is published.
 */
export function FigureCadenceNote({ kind }: { kind: "case-study" | "findings" }) {
  return (
    <aside className="mb-8 rounded-xl border border-line bg-surface p-4 text-sm text-ink" aria-label="How often this page changes" data-testid="cadence-note" data-kind={kind}>
      <p className="font-semibold">How often this page changes</p>
      {kind === "case-study" ? (
        <p className="mt-1 max-w-prose">
          This page is written up from slow-moving data: emergency department visits and bed waits by year, the latest clinic list and
          the latest resident count. Those change when their publishers release new figures, not every week.
          For what moved last week, see the <Link href="/?view=planner">weekly summary</Link>.
        </p>
      ) : (
        <p className="mt-1 max-w-prose">
          Findings are recomputed every Sunday from the latest release. A finding is published only if it passes its
          statistical test, so in a quiet week the same findings can appear again. For what moved since the week before,
          see the <Link href="/?view=planner">weekly summary</Link>.
        </p>
      )}
    </aside>
  );
}
