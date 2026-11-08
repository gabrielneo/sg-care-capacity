"use client";

/** Opens the browser's print dialog, where the page can also be saved as a PDF. Not printed itself. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} data-testid="print-button"
            className="print-hide min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:border-accent">
      Print or save as PDF
    </button>
  );
}
