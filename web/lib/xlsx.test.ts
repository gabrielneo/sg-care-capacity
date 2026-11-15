import { describe, expect, it } from "vitest";

import { crc32, workbook, xml, zip } from "./xlsx";

const dec = new TextDecoder();
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

/** Read back every entry of a stored zip through its central directory, checking each CRC. */
function unzip(b: Uint8Array): Record<string, string> {
  const end = b.length - 22;
  expect(u32(b, end)).toBe(0x06054b50);
  const n = u16(b, end + 10);
  let at = u32(b, end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    expect(u32(b, at)).toBe(0x02014b50);
    const [crc, size, nameLen, extra, comment, local] = [u32(b, at + 16), u32(b, at + 24), u16(b, at + 28), u16(b, at + 30), u16(b, at + 32), u32(b, at + 42)];
    const name = dec.decode(b.slice(at + 46, at + 46 + nameLen));
    expect(u32(b, local)).toBe(0x04034b50);
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const data = b.slice(start, start + size);
    expect(crc32(data), name).toBe(crc);
    out[name] = dec.decode(data);
    at += 46 + nameLen + extra + comment;
  }
  return out;
}

describe("xlsx", () => {
  it("crc32 is the standard one", () => expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926));

  it("zips and reads back stored entries, in order, deterministically", () => {
    const a = zip([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "dir/b.txt", data: new Uint8Array() }]);
    expect(Object.keys(unzip(a))).toEqual(["a.txt", "dir/b.txt"]);
    expect(unzip(a)["a.txt"]).toBe("hello");
    expect(zip([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "dir/b.txt", data: new Uint8Array() }])).toEqual(a);
  });

  const book = unzip(workbook([["Title", "Bed wait & more"], ["data_as_of", "2026-10-31"]], ["hospital", "hours", "complete", "note"],
    [["SGH", 4.5, true, null], ["<AH>", Number.NaN, false, "a\u0001b\"c"]]));

  it("has the parts a spreadsheet program needs", () => {
    expect(Object.keys(book)).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml",
      "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]);
    expect(book["xl/workbook.xml"]).toContain('<sheet name="About" sheetId="1"');
    expect(book["xl/workbook.xml"]).toContain('<sheet name="Data" sheetId="2"');
  });

  it("About carries the context rows, escaped", () => {
    expect(book["xl/worksheets/sheet1.xml"]).toContain("Bed wait &amp; more");
    expect(book["xl/worksheets/sheet1.xml"]).toContain("2026-10-31");
  });

  it("Data has a bold header, numbers as numbers, booleans as booleans, and a missing value as an empty cell, never 0", () => {
    const d = book["xl/worksheets/sheet2.xml"]!;
    expect(d).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">hospital</t></is></c>');
    expect(d).toContain('<c r="B2"><v>4.5</v></c>');
    expect(d).toContain('<c r="C2" t="b"><v>1</v></c>');
    expect(d).not.toContain('r="D2"');                      // null: no cell
    expect(d).not.toContain('r="B3"');                      // NaN: no cell
    expect(d).toContain("&lt;AH&gt;");
    expect(d).toContain("ab&quot;c");                        // the control character is dropped, the quote escaped
  });

  it("xml escapes", () => expect(xml("a<b>&\"")).toBe("a&lt;b&gt;&amp;&quot;"));
});
