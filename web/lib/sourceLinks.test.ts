import { describe, expect, it } from "vitest";

import { linkable } from "./sourceLinks";

describe("linkable", () => {
  it("cites Singapore government, university and public-healthcare pages instead of linking", () => {
    for (const url of ["https://www.moh.gov.sg/news-highlights/x", "https://isomer-user-content.by.gov.sg/3/a.xlsx",
                       "https://www.nuhs.edu.sg/patient-care/emergency-department-wait-times", "https://www.singstat.gov.sg",
                       "https://www.population.gov.sg/x", "https://data.gov.sg/datasets/d_1/view", "https://www.ntu.edu.sg/x",
                       "https://www.aic.sg/x", "https://careers.mohh.com.sg/", "https://www.onemap.gov.sg/api/common/elastic/search"]) {
      expect(linkable(url)).toBeNull();
    }
  });

  it("keeps the links the licences ask for, other sites and the site's own pages", () => {
    for (const url of ["https://data.gov.sg/open-data-licence", "https://www.onemap.gov.sg/", "https://www.sla.gov.sg/",
                       "https://github.com/gabrielneo/sg-care-capacity", "https://notmoh.gov.sg.example.com/", "/methodology#sources"]) {
      expect(linkable(url)).toBe(url);
    }
    expect(linkable(null)).toBeNull();
  });
});
