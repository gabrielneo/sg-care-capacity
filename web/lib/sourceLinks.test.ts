import { describe, expect, it } from "vitest";

import { linkable } from "./sourceLinks";

describe("linkable", () => {
  it("cites MOH, its file host, NUHS and SingStat pages instead of linking (their terms ask for permission)", () => {
    for (const url of ["https://www.moh.gov.sg/news-highlights/x", "https://isomer-user-content.by.gov.sg/3/a.xlsx",
                       "https://www.nuhs.edu.sg/patient-care/emergency-department-wait-times", "https://www.singstat.gov.sg"]) {
      expect(linkable(url)).toBeNull();
    }
  });

  it("allows OneMap's home page only, and every other site and the site's own pages", () => {
    expect(linkable("https://www.onemap.gov.sg/")).toBe("https://www.onemap.gov.sg/");
    expect(linkable("https://www.onemap.gov.sg/api/common/elastic/search")).toBeNull();
    expect(linkable("https://data.gov.sg/open-data-licence")).toBe("https://data.gov.sg/open-data-licence");
    expect(linkable("https://notmoh.gov.sg.example.com/")).toBe("https://notmoh.gov.sg.example.com/");
    expect(linkable("/methodology#sources")).toBe("/methodology#sources");
    expect(linkable(null)).toBeNull();
  });
});
