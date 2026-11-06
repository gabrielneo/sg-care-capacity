import { Fragment } from "react";

import { segmentText } from "@/lib/glossary";

import { Term } from "./Term";

/** Text with every glossary term wrapped: for data strings and generated sentences. */
export function Glossed({ text, plain = false }: { text: string; plain?: boolean }) {
  return (
    <>
      {segmentText(text).map((s, i) =>
        typeof s === "string" ? (
          <Fragment key={i}>{s}</Fragment>
        ) : (
          <Term key={i} id={s.id} plural={s.plural} plain={plain}>{s.text}</Term>
        ),
      )}
    </>
  );
}
