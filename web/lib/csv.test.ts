import { describe, expect, it } from "vitest";

import { cell, csvResponse, toCsv } from "./csv";

const meta = {
  as_of: "2026-11-01",
  sources: [
    { name: "MOH", url: "https://www.moh.gov.sg", licence: "x" },
    { name: "SingStat", url: "https://www.singstat.gov.sg", licence: "x" },
  ],
} as unknown as Parameters<typeof toCsv>[2];

describe("cell", () => {
  it("leaves plain values alone", () => {
    expect(cell("Bedok")).toBe("Bedok");
    expect(cell(3.5)).toBe("3.5");
    expect(cell(0)).toBe("0");
    expect(cell(true)).toBe("true");
  });

  it("writes missing values as empty cells, never 0", () => {
    expect(cell(null)).toBe("");
    expect(cell(undefined)).toBe("");
    expect(cell(Number.NaN)).toBe("");
    expect(cell(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("quotes commas, quotes and line breaks (RFC 4180)", () => {
    expect(cell("a, b")).toBe('"a, b"');
    expect(cell('the "bed wait"')).toBe('"the ""bed wait"""');
    expect(cell("line\nbreak")).toBe('"line\nbreak"');
    expect(cell("cr\rhere")).toBe('"cr\rhere"');
  });
});

describe("toCsv", () => {
  const csv = toCsv(["area", "clinics"], [["Bedok", 12], ["Tampines, East", null]], meta);
  const lines = csv.split("\r\n");

  it("appends data_as_of and source to the header and every row", () => {
    expect(lines[0]).toBe("area,clinics,data_as_of,source");
    expect(lines[1]).toBe("Bedok,12,2026-11-01,MOH; SingStat");
    expect(lines[2]).toBe('"Tampines, East",,2026-11-01,MOH; SingStat');
  });

  it("uses CRLF line endings and ends with one", () => {
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("");
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("writes only the header when there are no rows", () => {
    expect(toCsv(["a"], [], meta)).toBe("a,data_as_of,source\r\n");
  });
});

describe("toCsv with rows from different sources", () => {
  it("gives each row its own date and sources (audit M-2)", () => {
    const chas = { as_of: "2024-06-06T14:36:42", sources: [{ name: "data.gov.sg, CHAS Clinics" }] } as Parameters<typeof toCsv>[2];
    const csv = toCsv(["finding"], [["ED"], ["access"]], meta, (i) => (i === 1 ? chas : meta));
    expect(csv.split("\r\n").slice(1, 3)).toEqual([
      "ED,2026-11-01,MOH; SingStat",
      'access,2024-06-06T14:36:42,"data.gov.sg, CHAS Clinics"']);
  });
});

describe("csvResponse", () => {
  it("is a CSV attachment named after its data and release", async () => {
    const res = csvResponse("a\r\n", "areas", "data-2026-11-08");
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="areas-data-2026-11-08.csv"');
    expect(await res.text()).toBe("a\r\n");
  });
});
