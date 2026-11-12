"use client";

import { Tip } from "@/components/terms/TermView";
import { BED_WAIT_EXPLAINER } from "@/lib/copy";

/**
 * A "?" that explains the bed wait: it is not the time to see a doctor. A 44 px target, opened by
 * hover, keyboard focus or a tap, closed by Escape.
 */
export function BedWaitHelp() {
  return (
    <Tip data={{ "data-testid": "bed-wait-help" }}
         label={
           <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-page text-base font-semibold text-ink no-underline">
             <span aria-hidden="true">?</span>
             <span className="sr-only">What does this wait mean?</span>
           </span>
         }>
      <strong>Not the time to see a doctor.</strong> {BED_WAIT_EXPLAINER.replace(/^This is not the time to see a doctor\. /, "")}
    </Tip>
  );
}
