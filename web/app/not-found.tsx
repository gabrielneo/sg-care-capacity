import Link from "next/link";

import { EmptyState } from "@/components/States";

/** A wrong address: say so, and offer the main ways on rather than one link (critique, 20 Nov 2026). */
export default function NotFound() {
  return (
    <EmptyState title="Page not found" message="That page doesn't exist. It may have moved, or the address may be mistyped."
                action={(
                  <ul className="flex flex-wrap justify-center gap-x-4" data-testid="not-found-links">
                    <li><Link href="/" className="inline-flex min-h-11 items-center">Go to the overview</Link></li>
                    <li><Link href="/find" className="inline-flex min-h-11 items-center">Find a clinic</Link></li>
                    <li><Link href="/ed-trends/monthly" className="inline-flex min-h-11 items-center">All hospitals, month by month</Link></li>
                    <li><Link href="/findings" className="inline-flex min-h-11 items-center">Read the findings</Link></li>
                  </ul>
                )} />
  );
}
