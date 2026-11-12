import type { Metadata } from "next";

import { Hub } from "@/components/Hub";

export const metadata: Metadata = { title: "How it's built" };
export const dynamic = "force-static";

export default function HowItsBuiltPage() {
  return (
    <Hub title="How the figures are made and checked" intro="Where each number comes from, what was done to it, and what the data can't tell you."
         items={[
           { href: "/data-quality", title: "Review the data checks", text: "Every check on the latest release, each source's date and the days with gaps." },
           { href: "/methodology", title: "Read the methods", text: "Sources, definitions, and the limits of the figures." },
           { href: "/docs/insights-method", title: "See how findings are tested", text: "The test and the bar each finding has to pass before it is shown." },
           { href: "/decisions", title: "Browse decision records", text: "Why the project was built the way it was." },
           { href: "/glossary", title: "Look up a term", text: "Plain-language meanings for every abbreviation on the site." },
         ]} />
  );
}
