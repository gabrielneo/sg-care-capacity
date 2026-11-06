import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { GlossaryList } from "@/components/terms/GlossaryList";
import { GLOSSARY } from "@/lib/glossary";

export const metadata: Metadata = { title: "Glossary" };
export const dynamic = "force-static";

export default function GlossaryPage() {
  return (
    <>
      <PageHeader
        title="Glossary"
        intro={
          <>
            Every abbreviation and term used on this site, in plain words. The list is kept in{" "}
            <a href="https://github.com/gabrielneo/sg-care-capacity/blob/main/docs/glossary.yml">docs/glossary.yml</a>, following the{" "}
            <a href="https://github.com/gabrielneo/sg-care-capacity/blob/main/docs/language_rules.md">language rules</a>. See also the{" "}
            <Link href="/methodology">Methodology</Link>.
          </>
        }
      />
      <GlossaryList terms={GLOSSARY} />
    </>
  );
}
