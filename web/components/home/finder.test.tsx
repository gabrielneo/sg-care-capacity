import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Hospital, LiveReading } from "@/lib/api/types";
import { BED_WAIT_LABEL } from "@/lib/copy";
import { resetFinder } from "@/lib/finderStore";
import type { Places } from "@/lib/nearby";
import { type HospitalStatus, levelFor } from "@/lib/status";
import { createScope, setTestScope } from "@/lib/termScope";

import { EdNearby } from "./EdNearby";
import { EdNearbyCard } from "./EdNearbyCard";
import { Finder } from "./Finder";
import { HomeNotice } from "./HomeHero";

const PLACES: Places = {
  gps: [
    { name: "Bravo Clinic", address: "2 Bedok Rd", postal_code: "460002", latitude: 1.3250, longitude: 103.93, planning_area: "BEDOK", has_cdmp: null },
    { name: "Alpha Clinic", address: "1 Bedok Rd", postal_code: "460001", latitude: 1.3240, longitude: 103.93, planning_area: "BEDOK", has_cdmp: null },
  ],
  polyclinics: [{ name: "Bedok Polyclinic", address: "11 Bedok North St 1", postal_code: "469662", latitude: 1.3260, longitude: 103.93 }],
  hospitals: [
    { code: "SGH", name: "Singapore General Hospital", address: null, postal_code: "169608", latitude: 1.28, longitude: 103.83, facility_type: "ED" },
    { code: "CGH", name: "Changi General Hospital", address: null, postal_code: "529889", latitude: 1.3408, longitude: 103.9495, facility_type: "ED" },
    { code: "AH", name: "Alexandra Hospital", address: null, postal_code: "159964", latitude: 1.2866, longitude: 103.8, facility_type: "UCC" },
    { code: "NUH", name: "National University Hospital", address: null, postal_code: "119074", latitude: 1.2946, longitude: 103.7833, facility_type: "ED" },
  ],
};

const status = (code: string, pct: number | null, latest: number | null = 5): HospitalStatus => ({
  code, level: levelFor(pct), latest, usual: pct == null ? null : 4, pct, spark: [] });
const hospital = (code: string, over: Partial<Hospital> = {}): Hospital => ({
  hospital_code: code, hospital_name: code, cluster: "NUHS", facility_type: "ED", reported_from: null, coverage_note: null, exclusions_note: null,
  source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked", ...over } as Hospital);
const live = { hospital_code: "AH", is_adult_ed: true, est_wait_to_see_doctor_hours: 1, est_wait_to_see_doctor_qualifier: "<",
  snapshot_at: "2026-11-06T14:00:00" } as LiveReading;

beforeEach(() => {
  setTestScope(createScope());
  resetFinder();
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => PLACES })));
});
afterEach(() => {
  setTestScope(null);
  vi.unstubAllGlobals();
});

async function searchFor(text: string) {
  fireEvent.change(screen.getByLabelText("Your postcode or area"), { target: { value: text } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Find clinics" })); });
}

describe("Finder", () => {
  it("lists clinics by straight-line distance, with a Nearest badge on the first only", async () => {
    render(<Finder clinicAsOf="2024-06-06" provenance={<p>prov</p>} />);
    await searchFor("460001");
    const cards = screen.getAllByTestId("nearby-place");
    expect(cards.map((c) => within(c).getByRole("heading").textContent)).toEqual(["Alpha Clinic", "Bravo Clinic", "Bedok Polyclinic"]);
    expect(within(cards[0]!).getByTestId("nearest-badge")).toHaveTextContent("Nearest");
    expect(screen.getAllByTestId("nearest-badge")).toHaveLength(1);
    expect(within(cards[0]!).getByTestId("nearby-km")).toHaveTextContent("under 0.1 km");
    expect(within(cards[0]!).getByText("straight-line distance")).toBeInTheDocument();
    expect(within(cards[0]!).getByTestId("place-type")).toHaveTextContent("GP clinic on CHAS");
    expect(within(cards[2]!).getByTestId("place-type")).toHaveTextContent("Polyclinic");
    expect(screen.getByTestId("nearby-basis")).toHaveTextContent("Distances from that postcode, in a straight line.");
    expect(screen.getByTestId("nearby-basis")).toHaveTextContent("last updated on 6 Jun 2024");
    expect(screen.getByTestId("nearby")).toHaveTextContent("prov");
    // No routing: never a travel time, never "fastest".
    expect(document.body.textContent).not.toMatch(/fastest|minutes|ETA|travel time/i);
  });

  it("links to directions with the place's coordinates only, in a new tab", async () => {
    render(<Finder clinicAsOf={null} provenance={null} />);
    await searchFor("460001");
    const link = within(screen.getAllByTestId("nearby-place")[0]!).getByRole("link", { name: /Directions to Alpha Clinic/ });
    const url = new URL(link.getAttribute("href")!);
    expect(url.searchParams.get("destination")).toBe("1.324000,103.930000");
    expect(link.getAttribute("href")).not.toContain("460001");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("filters by kind, and keeps the choice in the fragment", async () => {
    render(<Finder clinicAsOf={null} provenance={null} />);
    await searchFor("460001");
    fireEvent.click(screen.getByRole("radio", { name: "Polyclinics" }));
    expect(screen.getAllByTestId("nearby-place").map((c) => c.getAttribute("data-type"))).toEqual(["polyclinic"]);
    expect(window.location.hash).toBe("#near=460001&type=polyclinic");
    fireEvent.click(screen.getByRole("radio", { name: "GP clinics" }));
    expect(screen.getAllByTestId("nearby-place")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /open now|chas/i })).toBeNull();        // fields we don't have: no filter
  });

  it("announces the results in a polite live region", async () => {
    render(<Finder clinicAsOf={null} provenance={null} />);
    const live = screen.getByTestId("live-region");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("");
    await searchFor("460001");
    expect(live).toHaveTextContent("3 places near 460001. Nearest: Alpha Clinic, under 0.1 km in a straight line.");
    fireEvent.click(screen.getByRole("radio", { name: "GP clinics" }));
    expect(live).toHaveTextContent("2 GP clinics near 460001.");
  });

  it("says how to recover from a postcode it can't place", async () => {
    render(<Finder clinicAsOf={null} provenance={null} />);
    await searchFor("4600");
    expect(screen.getByTestId("nearby-message")).toHaveTextContent("Singapore postcodes have 6 digits. Check the number and try again.");
    expect(screen.getByTestId("live-region")).toHaveTextContent("Singapore postcodes have 6 digits.");
    expect(screen.queryByTestId("nearby-place")).toBeNull();
  });

  it("says so when the lists can't be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    render(<Finder clinicAsOf={null} provenance={null} />);
    await searchFor("460001");
    expect(screen.getByTestId("nearby-message")).toHaveTextContent("can't be loaded right now");
  });

  it("promises only what is true: the search stays in the browser", () => {
    render(<Finder clinicAsOf={null} provenance={null} />);
    expect(screen.getByTestId("search-privacy")).toHaveTextContent("stays in this browser");
    expect(screen.getByTestId("near-form").querySelector("[name=near]")).toBeNull();      // nothing a form could submit to the server
  });
});

describe("EdNearbyCard: the words", () => {
  it("uses the plain badge and the full bed-wait label, and never 'wait time'", () => {
    render(<EdNearbyCard status={status("SGH", 25)} hospital={hospital("SGH")} live={null} />);
    const card = screen.getByTestId("ed-card");
    expect(within(card).getByTestId("status-badge")).toHaveTextContent("▲Busier than usual for this hospital");
    expect(within(card).getByTestId("ed-label")).toHaveTextContent(BED_WAIT_LABEL);
    expect(within(card).getByTestId("ed-hours")).toHaveTextContent("5.0 hours");
    expect(within(card).getByTestId("ed-sentence")).toHaveTextContent("Bed waits were longer than usual last week. Usual: 4.0 hours.");
    expect(within(card).queryByTestId("ed-live")).toBeNull();                              // no NUHS estimate, none shown
    expect(card.textContent).not.toMatch(/wait time/i);
  });

  it("explains in a tooltip that it is not the time to see a doctor", () => {
    render(<EdNearbyCard status={status("SGH", 25)} hospital={hospital("SGH")} live={null} />);
    const help = screen.getByRole("button", { name: "What does this wait mean?" });
    expect(document.getElementById(help.getAttribute("aria-describedby")!)).toHaveTextContent("Not the time to see a doctor.");
  });

  it("shows 'to see a doctor' only with an estimate, labelled, with its own time", () => {
    render(<EdNearbyCard status={status("AH", null, 2)} hospital={hospital("AH", { facility_type: "UCC" })} live={live} />);
    const card = screen.getByTestId("ed-card");
    expect(within(card).getByTestId("ed-live")).toHaveTextContent(/To see a doctor \((National University Health System \()?NUHS\)? estimate\): under 1 hour/);
    expect(within(card).getByTestId("ed-live")).toHaveTextContent(/As of 6 Nov 2026.* An estimate, not live\./);
    expect(within(card).getByTestId("ed-note")).toHaveTextContent("Urgent care centre");
    expect(within(card).getByTestId("status-badge")).toHaveTextContent("No comparison with usual available");
  });

  it("no usual level or no complete week stays missing", () => {
    render(<EdNearbyCard status={status("NUH", null, null)} hospital={hospital("NUH", { coverage_note: "Adult emergency department only; NUH Children's Emergency is excluded by MOH." })} live={null} />);
    expect(screen.getByTestId("ed-hours")).toHaveTextContent("–");
    expect(screen.getByTestId("ed-sentence")).toHaveTextContent("No complete week of figures last week.");
    expect(screen.getByTestId("ed-note")).toHaveTextContent("Adults only");
  });
});

describe("EdNearby", () => {
  const cards = Object.fromEntries(["SGH", "CGH", "AH", "NUH"].map((c) => [c, <p key={c}>card {c}</p>]));

  it("asks for a search before showing any hospital", () => {
    render(<EdNearby cards={cards} notes={null} provenance={null} analystHref="/?view=analyst" />);
    expect(screen.getByTestId("ed-prompt")).toHaveTextContent("Search for a postcode or area above");
    expect(screen.queryByTestId("ed-item")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/^How busy were EDs.* near you last week\?$/);
    expect(screen.getByRole("link", { name: /Analyst detail/ })).toHaveAttribute("href", "/?view=analyst");
  });

  it("shows the three nearest, nearest first, with the straight-line distance", async () => {
    render(<><Finder clinicAsOf={null} provenance={null} /><EdNearby cards={cards} notes={<p>notes</p>} provenance={<p>prov</p>} analystHref="/" /></>);
    await searchFor("460001");
    const items = screen.getAllByTestId("ed-item");
    expect(items.map((i) => i.textContent?.match(/card (\w+)/)?.[1])).toEqual(["CGH", "SGH", "AH"]);   // NUH is the fourth
    expect(within(items[0]!).getByTestId("ed-km")).toHaveTextContent(/km straight-line distance/);
    expect(screen.getByTestId("ed-near")).toHaveTextContent("notes");
  });
});

describe("HomeNotice: the triage band", () => {
  it("is first, says to call 995 and where else to go, and gives no other advice", () => {
    const { container } = render(<HomeNotice density="full" />);
    const first = container.querySelector("section")!.firstElementChild!;
    expect(first).toBe(screen.getByTestId("emergency-note"));                              // before the heading
    expect(screen.getByTestId("triage-emergency")).toHaveTextContent("Life-threatening emergency? Call 995.");
    expect(screen.getByRole("link", { name: "Call 995" })).toHaveAttribute("href", "tel:995");
    expect(screen.getByTestId("triage-next")).toHaveTextContent("A GP clinic or polyclinic can often help instead of an emergency department.");
    expect(screen.getByTestId("not-advice")).toHaveTextContent("isn't medical advice");
    expect(screen.queryByRole("button", { name: /dismiss|close|hide/i })).toBeNull();        // not dismissible
    // The guidance URL is a TODO(me): no link until it is set, and none is guessed.
    expect(screen.queryByTestId("triage-link")).toBeNull();
  });
});
