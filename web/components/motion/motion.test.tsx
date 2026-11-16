import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CountUp, formatCount } from "./CountUp";
import { HeroLine } from "./HeroLine";
import { Reveal } from "./Reveal";
import { ScrollProgress } from "./ScrollProgress";

type Callback = (entries: { isIntersecting: boolean }[]) => void;
let observers: { cb: Callback; disconnected: boolean }[] = [];

function setup({ reduced = false, top = 2000 }: { reduced?: boolean; top?: number } = {}) {
  observers = [];
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("IntersectionObserver", class {
    state = { cb: null as unknown as Callback, disconnected: false };
    constructor(cb: Callback) { this.state.cb = cb; observers.push(this.state); }
    observe() {}
    disconnect() { this.state.disconnected = true; }
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top, bottom: top + 100, left: 0, right: 0, width: 0, height: 100, x: 0, y: top, toJSON() {} });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Reveal", () => {
  it("is plain and visible when the server renders it: nothing is hidden before the browser has run", () => {
    setup({ reduced: true });
    render(<Reveal data-testid="r">hello</Reveal>);
    expect(screen.getByTestId("r").dataset.reveal).toBe("");
    expect(screen.getByTestId("r")).toHaveTextContent("hello");
  });

  it("arms a block that starts below the fold, and shows it when it arrives", () => {
    setup({ top: 2000 });
    render(<Reveal data-testid="r">hello</Reveal>);
    expect(screen.getByTestId("r").dataset.reveal).toBe("armed");
    act(() => observers[0]!.cb([{ isIntersecting: true }]));
    expect(screen.getByTestId("r").dataset.reveal).toBe("in");
    expect(observers[0]!.disconnected).toBe(true);
  });

  it("never hides a block that is already on screen", () => {
    setup({ top: 100 });
    render(<Reveal data-testid="r">hello</Reveal>);
    expect(screen.getByTestId("r").dataset.reveal).toBe("");
  });

  it("leaves everything alone with reduced motion", () => {
    setup({ reduced: true, top: 2000 });
    render(<Reveal data-testid="r">hello</Reveal>);
    expect(screen.getByTestId("r").dataset.reveal).toBe("");
    expect(observers).toHaveLength(0);
  });

  it("shows an armed block after the fail-safe even if it never intersects", () => {
    setup({ top: 2000 });
    render(<Reveal data-testid="r">hello</Reveal>);
    expect(screen.getByTestId("r").dataset.reveal).toBe("armed");
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByTestId("r").dataset.reveal).toBe("in");
  });

  it("passes its delay on to the CSS", () => {
    setup({ reduced: true });
    render(<Reveal data-testid="r" delay={240}>x</Reveal>);
    expect(screen.getByTestId("r").style.getPropertyValue("--delay")).toBe("240ms");
  });
});

describe("CountUp", () => {
  it("formats like the site: separators, decimals and a real minus sign", () => {
    expect(formatCount(77841)).toBe("77,841");
    expect(formatCount(5.36, 1)).toBe("5.4");
    expect(formatCount(-6.5, 0, true)).toBe("−7");
    expect(formatCount(33.4, 0, true)).toBe("+33");
    expect(formatCount(0.2, 0, true)).toBe("0");
  });

  it("always gives screen readers the final figure, never a count in progress", () => {
    setup();
    render(<CountUp value={77841} />);
    expect(screen.getByTestId("count-up").querySelector(".sr-only")).toHaveTextContent("77,841");
    expect(screen.getByTestId("count-up").querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("shows the final figure at once with reduced motion", () => {
    setup({ reduced: true });
    render(<CountUp value={5.36} decimals={1} />);
    expect(screen.getByTestId("count-up").querySelector('[aria-hidden="true"]')).toHaveTextContent("5.4");
    expect(observers).toHaveLength(0);
  });

  it("counts up from 0 when it comes into view and lands on the final figure", () => {
    setup();
    let t = 0;
    vi.stubGlobal("requestAnimationFrame", (fn: (n: number) => void) => setTimeout(() => fn((t += 100)), 100));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    render(<CountUp value={100} />);
    const shown = () => screen.getByTestId("count-up").querySelector('[aria-hidden="true"]')!.textContent;
    expect(shown()).toBe("100");                           // what the server shows, until the browser takes over
    act(() => { vi.advanceTimersByTime(100); });
    expect(shown()).toBe("0");
    act(() => observers[0]!.cb([{ isIntersecting: true }]));
    act(() => { vi.advanceTimersByTime(300); });
    const mid = Number(shown());
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(shown()).toBe("100");
  });

  it("holds its width, so counting never shifts the page", () => {
    setup({ reduced: true });
    render(<CountUp value={77841} />);
    expect(screen.getByTestId("count-up").style.minWidth).toBe("6ch");
  });
});

describe("HeroLine", () => {
  const pts = [{ label: "a", value: 4 }, { label: "b", value: 6 }, { label: "c", value: null }, { label: "d", value: 5 }, { label: "e", value: 7 }];

  it("draws the line with its summary for screen readers, and a gap where a month is missing", () => {
    const { container } = render(<HeroLine points={pts} summary="The wait, by month." />);
    expect(screen.getByTestId("hero-line")).toHaveAttribute("aria-label", "The wait, by month.");
    expect(container.querySelectorAll("path.hero-stroke")).toHaveLength(2);
  });

  it("draws nothing when no month has a figure", () => {
    const { container } = render(<HeroLine points={[{ label: "a", value: null }]} summary="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ScrollProgress", () => {
  it("is decorative: hidden from screen readers", () => {
    render(<ScrollProgress />);
    expect(screen.getByTestId("scroll-progress")).toHaveAttribute("aria-hidden", "true");
  });
});
