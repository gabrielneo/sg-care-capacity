import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createScope, setTestScope } from "@/lib/termScope";

import { ClientGlossed } from "./ClientGlossed";
import { Glossed } from "./Glossed";
import { Term } from "./Term";
import { TermView } from "./TermView";

/** Render as one page: a fresh scope, as a server request has. */
const inScope = (ui: React.ReactNode) => {
  setTestScope(createScope());
  return render(<>{ui}</>);
};
afterEach(() => setTestScope(null));

describe("Term", () => {
  it("spells out an abbreviation on first use, then shows it with a definition", () => {
    inScope(<p><Term id="chas" /> helps. <Term id="chas" /> again.</p>);
    expect(screen.getByText("Community Health Assist Scheme (CHAS)")).toHaveAttribute("data-first");
    const later = screen.getByRole("button", { name: "CHAS" });
    expect(later).toHaveAccessibleDescription(/Community Health Assist Scheme \(CHAS\): Government subsidies at private GP and dental clinics/);
  });

  it("explains a Rule 2 word on first use only", () => {
    inScope(<p><Term id="median">median</Term> and <Term id="median">medians</Term></p>);
    expect(screen.getByRole("button", { name: "median" })).toHaveAccessibleDescription(/The middle value/);
    expect(screen.queryByRole("button", { name: "medians" })).toBeNull();
    expect(screen.getByText("medians")).toHaveAttribute("data-term", "median");
  });

  it("explains self-named terms on every use", () => {
    inScope(<p><Term id="singhealth" /> and <Term id="singhealth" /></p>);
    expect(screen.getAllByRole("button", { name: "SingHealth" })).toHaveLength(2);
  });

  it("renders text only where a button isn't allowed", () => {
    inScope(<p><Term id="ed" /> <a href="/x"><Term id="ed" plain /> link</a></p>);
    expect(screen.getByRole("link")).toHaveTextContent("ED link");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("each page scope starts again", () => {
    const { unmount } = inScope(<Term id="moh" />);
    unmount();
    inScope(<Term id="moh" />);
    expect(screen.getByText("Ministry of Health (MOH)")).toBeInTheDocument();
  });

  it("outside any scope, a term is always spelled out", () => {
    render(<p><Term id="moh" /> <Term id="moh" /></p>);
    expect(screen.getAllByText("Ministry of Health (MOH)")).toHaveLength(2);
  });

  it("the footer's standalone terms neither depend on nor use up the page's first use", () => {
    inScope(<><footer><Glossed text="MOH data." standalone /></footer><main><Term id="moh" /> then <Term id="moh" /></main></>);
    expect(screen.getAllByText("Ministry of Health (MOH)")).toHaveLength(2);       // footer, and the page's first use
    expect(screen.getByRole("button", { name: "MOH" })).toBeInTheDocument();      // the page's second use
  });
});

describe("TermView: the server's decision is the only one (no hydration mismatch, React #418)", () => {
  it("renders exactly what it is told, whatever else is on the page", () => {
    render(<p><TermView id="cgh" first={false} /> and <TermView id="cgh" first /></p>);
    // A later use can be the spelled-out one if the server said so: the view never re-decides.
    const uses = document.querySelectorAll('[data-term="cgh"]');
    expect(uses[0]).not.toHaveAttribute("data-first");
    expect(uses[1]).toHaveAttribute("data-first");
    expect(uses[1]).toHaveTextContent("Changi General Hospital (CGH)");
  });

  it("client components' terms never spell out: the page's text has done that", () => {
    render(<p><ClientGlossed text="Nearest GP clinics" /></p>);
    expect(screen.getByRole("button", { name: "GP" })).toHaveAccessibleDescription(/general practitioner/i);
    expect(document.querySelector("[data-first]")).toBeNull();
  });
});

describe("Term tooltip", () => {
  const setup = () => {
    inScope(<p><Term id="ed" /> then <Term id="ed" /></p>);
    const button = screen.getByRole("button", { name: "ED" });
    const tip = screen.getByRole("tooltip", { hidden: true });
    return { button, tip };
  };

  it("opens on keyboard focus and closes with Escape", () => {
    const { button, tip } = setup();
    expect(tip).toHaveAttribute("data-open", "false");
    act(() => button.focus());
    expect(tip).toHaveAttribute("data-open", "true");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(tip).toHaveAttribute("data-open", "false");
  });

  it("opens on mouse hover", () => {
    const { button, tip } = setup();
    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    expect(tip).toHaveAttribute("data-open", "true");
    fireEvent.pointerLeave(button, { pointerType: "mouse" });
    expect(tip).toHaveAttribute("data-open", "false");
  });

  it("toggles on tap", () => {
    const { button, tip } = setup();
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.click(button);
    expect(tip).toHaveAttribute("data-open", "true");
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.click(button);
    expect(tip).toHaveAttribute("data-open", "false");
  });

  it("closes when tapping elsewhere", () => {
    const { button, tip } = setup();
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(tip).toHaveAttribute("data-open", "false");
  });
});

describe("Glossed", () => {
  it("wraps every term in data text, keeping the rest", () => {
    inScope(<p><Glossed text="MOH says ED visits rose at NUH; MOH again." /></p>);
    expect(screen.getByText("Ministry of Health (MOH)")).toBeInTheDocument();
    expect(screen.getByText("Emergency Department (ED)")).toBeInTheDocument();
    expect(screen.getByText("National University Hospital (NUH)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MOH" })).toBeInTheDocument();
    const visible = document.querySelector("p")!.cloneNode(true) as HTMLElement;
    visible.querySelectorAll('[role="tooltip"]').forEach((t) => t.remove());
    expect(visible.textContent).toBe("Ministry of Health (MOH) says Emergency Department (ED) visits rose at National University Hospital (NUH); MOH again.");
  });
});
