"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { type KeyboardEvent, Suspense, useEffect, useId, useRef, useState } from "react";

import { Nav } from "@/components/Nav";
import { ViewSwitch } from "@/components/ViewSwitch";
import { parseView } from "@/lib/homeViews";

/** The view group needs the address's ?view=, which a static page can only read in the browser, so it sits in its own Suspense boundary. */
function SheetViews({ onChoose }: { onChoose: () => void }) {
  const params = useSearchParams();
  return <ViewSwitch view={parseView(params.get("view"))} placement="sheet" onChoose={onChoose} />;
}

/**
 * The menu below 1024px (phones and tablets): a "Menu" button that opens a full-height sheet with the navigation, the view choice
 * (Home only) and the 995 link.
 *
 * It is a native modal <dialog>: the browser makes the rest of the page inert, closes it on Esc and puts focus back on the
 * button that opened it. Tab is wrapped by hand (below), because a bare dialog lets focus leave for the browser's own bar. It is closed when a link is
 * followed, a view is chosen, or the window grows past the phone layout. Without JavaScript the plain links are in the page (see <noscript> in the header).
 */
export function MenuSheet() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const pathname = usePathname();

  const closeSheet = () => { if (dialog.current?.open) dialog.current.close(); };

  // Following a link (or any route change) closes the sheet.
  useEffect(closeSheet, [pathname]);
  // From 1024px the header's own nav and view switch take over.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 64rem)");
    const close = () => { if (wide.matches) closeSheet(); };
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);

  /** Tab on the last control goes to the first, and Shift+Tab on the first to the last: a modal <dialog> alone lets focus leave for the browser's own bar. */
  const wrapFocus = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab" || !dialog.current) return;
    const stops = [...dialog.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]):not(.sr-only)")]
      .filter((el) => el.getClientRects().length > 0 || el.matches("input"));
    const first = stops[0], last = stops.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="lg:hidden">
      <button type="button" data-testid="menu-button" aria-haspopup="dialog" aria-expanded={open}
              onClick={() => { dialog.current?.showModal(); setOpen(true); }}
              className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-4 text-small font-semibold text-ink hover:border-accent">
        Menu
      </button>
      <dialog ref={dialog} aria-labelledby={titleId} data-testid="menu-sheet" className="menu-sheet bg-page text-ink"
              onClose={() => setOpen(false)} onKeyDown={wrapFocus}>
        <div className="flex h-full flex-col px-4">
          <div className="flex header-h items-center justify-between">
            <h2 id={titleId} className="text-h3 font-semibold text-ink">Menu</h2>
            <button type="button" data-testid="menu-close" onClick={closeSheet}
                    className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-4 text-small font-semibold text-ink hover:border-accent">
              Close<span className="sr-only"> menu</span>
            </button>
          </div>
          <Nav variant="sheet" onNavigate={closeSheet} />
          <Suspense fallback={null}>
            <div className="mt-6 empty:hidden"><SheetViews onChoose={closeSheet} /></div>
          </Suspense>
          <p className="mt-auto pb-6 pt-6 text-body" data-testid="menu-995">
            <span aria-hidden="true">✚ </span>Emergency? <a href="tel:995" className="inline-flex min-h-11 items-center font-semibold">Call 995</a>
          </p>
        </div>
      </dialog>
    </div>
  );
}
