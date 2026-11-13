import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { fullName, hospitalLabel, shortName } from "@/lib/hospitals";

import { HospitalName } from "./HospitalName";

const skh = { hospital_code: "SKH", hospital_name: "Sengkang General Hospital", short_name: "Sengkang General" };

describe("one hospital naming convention (audit G4)", () => {
  it("cards and tables use the short name and the code; the full name is kept for the tooltip", () => {
    expect(hospitalLabel(skh)).toBe("Sengkang General (SKH)");
    expect(fullName({ hospital_code: "AH", hospital_name: "Alexandra Hospital (UCC)" })).toBe("Alexandra Hospital");
  });

  it("a release from before short_name gets the same short name from the full name", () => {
    expect(shortName({ ...skh, short_name: null })).toBe("Sengkang General");
    expect(shortName({ hospital_code: "AH", hospital_name: "Alexandra Hospital (UCC)" })).toBe("Alexandra");
  });

  it("shows the full name in a keyboard-reachable tooltip", () => {
    render(<HospitalName hospital={skh} />);
    const name = screen.getByTestId("hospital-name");
    expect(name).toHaveTextContent(/^Sengkang General \(SKH\)/);
    expect(screen.getByRole("button", { name: /Sengkang General \(SKH\)/ })).toBeInTheDocument();
    expect(name).toHaveTextContent("Sengkang General Hospital");
  });

  it("inside a link or button: no nested control; the full name is the title and what a screen reader hears", () => {
    render(<a href="/x"><HospitalName hospital={skh} inControl /></a>);
    const name = screen.getByTestId("hospital-name");
    expect(name).toHaveAttribute("title", "Sengkang General Hospital");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link")).toHaveAccessibleName("Sengkang General Hospital (SKH)");
  });
});
