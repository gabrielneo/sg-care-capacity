import { describe, expect, it } from "vitest";

import type { Hospital } from "./api/types";
import { pinnedCaveat, shortNote } from "./hospitalNotes";

const h = (code: string, facility_type: "ED" | "UCC", coverage_note: string | null): Hospital => ({
  hospital_code: code, hospital_name: code, cluster: "x", facility_type, reported_from: null, coverage_note,
  exclusions_note: null, source_url: "https://www.moh.gov.sg/", as_of: "2026-11-06", as_of_basis: "reference_checked" });

describe("hospital notes", () => {
  it("labels the UCC and the adults-only ED from the reference data", () => {
    const list = [
      h("AH", "UCC", "Urgent Care Centre at Alexandra Hospital, not a full emergency department."),
      h("NUH", "ED", "Adult emergency department only; NUH Children's Emergency is excluded by MOH."),
      h("WH", "ED", "MOH reports Woodlands Hospital from 2024-06-23; its page text does not list it yet."),
      h("SGH", "ED", null),
    ];
    expect(list.map(shortNote)).toEqual(["Urgent care centre", "Adults only", null, null]);
    expect(list.map(pinnedCaveat)).toEqual([
      "Urgent Care Centre (UCC): not a full ED, so its waits are shorter",
      "Adults only: MOH's figures leave out children's emergency", null, null]);
  });
});
