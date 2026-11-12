import type { Metadata } from "next";

import { Hub } from "@/components/Hub";

export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-static";

export default function ExplorePage() {
  return (
    <Hub title="Explore the data" intro="Pick the question you have. Each page shows its data's date and source."
         items={[
           { href: "/ed-trends", title: "Compare hospitals", text: "Daily bed waits and emergency department visits for one hospital, or side by side." },
           { href: "/access-map", title: "See clinic access for seniors", text: "Clinics for each 1,000 residents aged 65 and over, by planning area, on a map or in a table." },
           { href: "/live", title: "Check live waits", text: "The latest wait estimates some hospitals publish, next to last week's figures." },
         ]} />
  );
}
