import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Glossed } from "./Glossed";
import { Term } from "./Term";
import { StaticTermScope } from "./TermScope";

const inScope = (ui: React.ReactNode) => render(<StaticTermScope>{ui}</StaticTermScope>);

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
