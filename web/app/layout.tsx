import "./globals.css";

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: { default: "Right-siting care in a super-aged Singapore", template: "%s · Right-siting care" },
  description:
    "Emergency department pressure and clinic access for residents aged 65+ in Singapore, from published MOH, data.gov.sg, SingStat and NUHS data.",
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
            Aggregate public data only (MOH, data.gov.sg, SingStat, NUHS). No personal or patient-level data.{" "}
            <Link href="/methodology">How the figures are made</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
