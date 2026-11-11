import "./globals.css";

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { DataStatus } from "@/components/DataStatus";
import { Nav } from "@/components/Nav";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { Glossed } from "@/components/terms/Glossed";

const DESCRIPTION = "Check how busy Singapore's hospital emergency departments were last week, and find a GP clinic or "
  + "polyclinic near you. Built from published MOH, data.gov.sg, SingStat and NUHS data.";

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

export default function RootLayout({ children }: { children: ReactNode }) {
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
          <div className="mx-auto max-w-6xl px-4 pt-3">
            <Link href="/" className="text-base font-semibold text-ink no-underline">
              Right-siting care <span className="font-normal text-muted">· a super-aged Singapore</span>
            </Link>
            <Nav />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
          {children}
        </main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-4 text-sm text-muted">
            {/* Standalone: the footer is site chrome, so it doesn't use up the page's first use of a term. */}
            <Glossed text="Aggregate public data only (MOH, data.gov.sg, SingStat, NUHS). No personal or patient-level data." standalone />{" "}
            Visits are counted without cookies, and searches aren&apos;t recorded.{" "}
            <Link href="/methodology">How the figures are made</Link> · <Link href="/glossary">Glossary</Link>
            {/* Loaded in the browser (/status.json): building a page never waits on the API. */}
            <DataStatus />
          </div>
        </footer>
        <SiteAnalytics />
      </body>
    </html>
  );
}
