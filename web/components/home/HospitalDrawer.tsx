"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";

/**
 * A slide-over for one hospital's details, on the browser's own <dialog>: showModal() traps focus
 * inside, makes the rest of the page inert, closes on Esc and puts focus back where it was.
 * - It overlays (position: fixed), so opening it moves nothing on the page.
 * - `code` null = closed. `onClose` runs for Esc, the Close button and a click on the backdrop;
 *   the caller owns the address (?hospital=).
 * - After it closes, focus returns to the control that opened it (`[data-hospital-trigger]`), also
 *   when the page was loaded with the drawer already open and there was no opener to remember.
 * - The slide-in is in globals.css (.care-drawer) and is switched off for prefers-reduced-motion.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab wrap inside the drawer: the browser's own modal can let focus out to its toolbar. */
function trap(e: KeyboardEvent<HTMLDialogElement>) {
  if (e.key !== "Tab") return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return;
  const at = document.activeElement;
  if (e.shiftKey && (at === first || at === e.currentTarget)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
}

export function HospitalDrawer({ code, title, children, onClose }: {
  code: string | null; title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(onClose);
  const last = useRef<string | null>(null);
  useEffect(() => { closing.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (code) last.current = code;
    if (code && !dialog.open) dialog.showModal();
    if (!code && dialog.open) dialog.close();
  }, [code]);

  // The browser closes the dialog itself on Esc; tell the owner so the address follows.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const done = () => {
      closing.current();
      const opener = last.current;
      requestAnimationFrame(() => {
        // The browser restores focus to the opener when it is still on the page; otherwise do it here.
        if (document.activeElement && document.activeElement !== document.body) return;
        document.querySelector<HTMLElement>(`[data-hospital-trigger="${opener}"]`)?.focus();
      });
    };
    dialog.addEventListener("close", done);
    return () => dialog.removeEventListener("close", done);
  }, []);

  return (
    <dialog ref={ref} aria-labelledby="care-drawer-title" data-testid="hospital-drawer"
            className="care-drawer m-0 flex flex-col overflow-hidden border border-line bg-surface p-0 text-ink shadow-xl"
            onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }} onKeyDown={trap}>
      {code ? (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <h2 id="care-drawer-title" className="text-xl font-semibold leading-snug tracking-tight">{title}</h2>
            <button type="button" onClick={() => ref.current?.close()} data-testid="drawer-close"
                    className="min-h-11 shrink-0 rounded-md border border-line px-3 text-sm font-medium">Close</button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        </>
      ) : null}
    </dialog>
  );
}
