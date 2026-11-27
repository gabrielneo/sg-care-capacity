import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HospitalDrawer } from "./HospitalDrawer";

// jsdom has no modal dialog: open/close like a browser, whose "close" event is queued (it arrives a task later).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute("open");
    setTimeout(() => this.dispatchEvent(new Event("close")), 0);
  };
});
afterEach(() => vi.useRealTimers());

const flush = () => new Promise((r) => setTimeout(r, 5));

describe("HospitalDrawer", () => {
  it("doesn't report a close that the address made (Back), so a quick Forward isn't undone", async () => {
    // e2e race (3 in 48 runs): Back set code null, the queued close event then ran onClose after Forward had put
    // ?hospital= back, and onClose removed it again.
    const onClose = vi.fn();
    const { rerender } = render(<HospitalDrawer code="AH" title="Alexandra" onClose={onClose}><p>body</p></HospitalDrawer>);
    rerender(<HospitalDrawer code={null} title="" onClose={onClose}>{null}</HospitalDrawer>);
    await flush();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports the reader's own close (the Close button, Esc, the backdrop)", async () => {
    const onClose = vi.fn();
    render(<HospitalDrawer code="AH" title="Alexandra" onClose={onClose}><p>body</p></HospitalDrawer>);
    fireEvent.click(screen.getByTestId("drawer-close"));
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
