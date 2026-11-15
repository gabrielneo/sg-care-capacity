import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SiteAnalytics } from "@/components/SiteAnalytics";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { colors, darkColors } from "@/lib/palette";
import { SITE, SITE_TITLE } from "@/lib/site";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const DESCRIPTION = "A public-data analytics project by Gabriel Neo: where Singapore's emergency departments wait longest for ward beds, "
  + "and where seniors have the fewest clinics. Also check how long ED bed waits were in the latest complete week and find a clinic near you.";

// Absolute links for the share preview. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deploy.
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE.name}` },
  description: DESCRIPTION,
  openGraph: { title: SITE_TITLE, description: DESCRIPTION, siteName: SITE.name, locale: "en_SG", type: "website" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: colors.page }, { media: "(prefers-color-scheme: dark)", color: darkColors.page }] };

export default function RootLayout({ children, viewbar }: { children: ReactNode; viewbar: ReactNode }) {
  return (
    <html lang="en-SG" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body className="flex min-h-screen flex-col bg-page text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <SiteHeader viewbar={viewbar} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 pt-3 sm:pt-4">
          {children}
        </main>
        <SiteFooter />
        <SiteAnalytics />
      </body>
    </html>
  );
}
