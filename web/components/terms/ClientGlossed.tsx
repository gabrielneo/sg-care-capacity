"use client";

import { Fragment } from "react";

import { segmentText } from "@/lib/glossary";

import { ClientTerm } from "./ClientTerm";

/** <Glossed> for client components: every glossary term wrapped as a ClientTerm. */
export function ClientGlossed({ text, plain = false }: { text: string; plain?: boolean }) {
  return (
    <>
      {segmentText(text).map((s, i) =>
        typeof s === "string" ? (
          <Fragment key={i}>{s}</Fragment>
        ) : (
          <ClientTerm key={i} id={s.id} plural={s.plural} plain={plain}>{s.text}</ClientTerm>
        ),
      )}
    </>
  );
}
