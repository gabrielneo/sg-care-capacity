import "./globals.css";

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";

import { AuthorByline } from "@/components/AuthorByline";
import { DataStatus } from "@/components/DataStatus";
import { Nav } from "@/components/Nav";
import { SiteStrip } from "@/components/SiteStrip";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { Glossed } from "@/components/terms/Glossed";

const DESCRIPTION = "A public-data analytics project by Gabriel Neo: where Singapore's emergency departments wait longest for ward beds, "
  + "and where seniors have the fewest clinics. Also check how busy EDs were last week and find a clinic near you.";

// Absolute links for the share preview. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deploy.
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Right-siting care in a super-aged Singapore", template: "%s · Right-siting care" },
  description: DESCRIPTION,
  openGraph: { title: "Right-siting care in Singapore", description: DESCRIPTION, siteName: "Right-siting care", locale: "en_SG", type: "website" },
  twitter: { card: "summary_large_image", title: "Right-siting care in Singapore", description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F8FAFC" };

export default function RootLayout({ children, viewbar }: { children: ReactNode; viewbar: ReactNode }) {
  return (
    <html lang="en-SG">
      <body className="flex min-h-screen flex-col bg-page text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Link href="/" className="text-base font-semibold text-ink no-underline">
                Right-siting care <span className="hidden font-normal text-muted sm:inline">· a super-aged Singapore</span>
              </Link>
              {/* The home page's view control (app/@viewbar): a slot, because a layout can't read ?view=. */}
              {viewbar}
            </div>
            <Nav />
          </div>
        </header>
        {/* Loaded in the browser (/strip.json), like the footer status: building a page never waits on the API. */}
        <Suspense fallback={<div className="h-10 border-b border-line bg-surface" />}>
          <SiteStrip />
        </Suspense>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-6 pt-3 sm:pb-8 sm:pt-4">
          {children}
        </main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-4 text-sm text-muted">
            {/* Standalone: the footer is site chrome, so it doesn't use up the page's first use of a term. */}
            <Glossed text="Aggregate public data only (MOH, data.gov.sg, SingStat, NUHS). No personal or patient-level data." standalone />{" "}
            Visits are counted without cookies, and searches aren&apos;t recorded.{" "}
            <span data-testid="footer-notice">This site shows public statistics. It isn&apos;t medical advice. In an emergency, call <a href="tel:995">995</a>.</span>{" "}
            <Link href="/methodology">How the figures are made</Link> · <Link href="/glossary">Glossary</Link>
            {/* Loaded in the browser (/status.json): building a page never waits on the API. */}
            <DataStatus />
            <AuthorByline className="mt-2 border-t border-line pt-2" />
          </div>
        </footer>
        <SiteAnalytics />
      </body>
    </html>
  );
}
