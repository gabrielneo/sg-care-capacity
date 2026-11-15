"use client";

import { useState } from "react";

/**
 * "Copy with caption": puts the chart's title, what it shows, its date and source, and a link to it on the clipboard as plain text,
 * so a figure pasted into a report or a message keeps its provenance. Text and a link, not a picture: a chart's labels,
 * map tiles and 3D view don't copy as an image without losing their meaning. The title is read from the heading on the page.
 */
export function CopyCaption({ headingId, summary, provenance }: { headingId: string; summary: string; provenance: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    // The heading as read on the page, without the glossary pop-ups its terms carry.
    const heading = document.getElementById(headingId)?.cloneNode(true) as HTMLElement | undefined;
    heading?.querySelectorAll("[role=tooltip]").forEach((el) => el.remove());
    const title = heading?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${headingId}`;
    const text = [title, summary, provenance, url].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 4000);
  }
  return (
    <>
      <button type="button" onClick={copy} data-testid="copy-caption"
              className="inline-flex min-h-11 items-center text-accent underline underline-offset-2 hover:text-accent-strong">
        Copy with caption
      </button>
      <span role="status" className="text-meta text-muted" data-testid="copy-status">
        {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy: select the title and source and copy them instead" : ""}
      </span>
    </>
  );
}
