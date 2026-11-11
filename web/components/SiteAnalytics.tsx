"use client";

import { Analytics } from "@vercel/analytics/next";

import { withoutQuery } from "@/lib/analytics";

/** Page-view counts (Vercel Web Analytics), paths only: see lib/analytics.ts. Off until enabled in Vercel. */
export function SiteAnalytics() {
  return <Analytics beforeSend={withoutQuery} />;
}
