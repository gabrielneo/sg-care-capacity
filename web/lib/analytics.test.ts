import { describe, expect, it } from "vitest";

import { withoutQuery } from "./analytics";

describe("analytics", () => {
  it("never sends the clinic search, only the path", () => {
    const e = withoutQuery({ type: "pageview", url: "https://sg-care-capacity-web.vercel.app/?near=760122#nearby" });
    expect(e.url).toBe("https://sg-care-capacity-web.vercel.app/");
    expect(e.url).not.toContain("760122");
  });

  it("keeps the page path", () => {
    expect(withoutQuery({ type: "pageview", url: "https://x.app/ed-trends?hospital=SGH" }).url).toBe("https://x.app/ed-trends");
  });
});
