import { Fragment } from "react";

import { segmentText } from "@/lib/glossary";

import { Term } from "./Term";

/** Text with every glossary term wrapped: for data strings and generated sentences. Server components only; client components use ClientGlossed. */
export function Glossed({ text, plain = false, standalone = false }: { text: string; plain?: boolean; standalone?: boolean }) {
  return (
    <>
      {segmentText(text).map((s, i) =>
        typeof s === "string" ? (
          <Fragment key={i}>{s}</Fragment>
        ) : (
          <Term key={i} id={s.id} plural={s.plural} plain={plain} standalone={standalone}>{s.text}</Term>
        ),
      )}
    </>
  );
}
