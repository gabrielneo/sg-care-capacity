import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Meta } from "@/lib/api/types";
import type { WeekChanges } from "@/lib/weekChanges";

import { WhatChanged } from "./WhatChanged";

const meta = { snapshot_id: "data-2026-11-08", as_of: "2026-11-08T08:00:00", sources: [], caveats: [], dq_warnings: [], coverage: null } as unknown as Meta;
const week = { week_start: "2026-10-19", week_end: "2026-10-25" };
const names = { SGH: "Singapore General Hospital", AH: "Alexandra Hospital" };
const base: WeekChanges = { previousWeek: "2026-10-12", moved: [], unchanged: 7, notCompared: 0 };

describe("WhatChanged", () => {
  it("lists each hospital that moved, from badge to badge", () => {
    render(<WhatChanged changes={{ ...base, moved: [{ code: "AH", from: "usual", to: "much_higher", step: 2 }] }} names={names} meta={meta} latestWeek={week} />);
    const item = screen.getByTestId("change-item");
    expect(item).toHaveTextContent("Alexandra Hospital: about usual → much higher than usual");
    expect(item).toHaveAttribute("data-direction", "busier");
    expect(screen.getByTestId("what-changed")).toHaveTextContent("19–25 Oct 2026 compared with 12–18 Oct 2026");
  });

  it("says so when nothing moved, as a result and not an empty box", () => {
    render(<WhatChanged changes={base} names={names} meta={meta} latestWeek={week} />);
    expect(screen.getByTestId("changes-none")).toHaveTextContent("No hospital changed its badge since the week before.");
    expect(screen.getByTestId("changes-counts")).toHaveTextContent("7 kept the same badge.");
  });

  it("counts hospitals it could not compare apart from unchanged ones", () => {
    render(<WhatChanged changes={{ ...base, unchanged: 6, notCompared: 1 }} names={names} meta={meta} latestWeek={week} />);
    expect(screen.getByTestId("changes-counts")).toHaveTextContent("6 kept the same badge; 1 could not be compared");
  });

  it("renders nothing without a previous week", () => {
    const { container } = render(<WhatChanged changes={{ ...base, previousWeek: null }} names={names} meta={meta} latestWeek={week} />);
    expect(container).toBeEmptyDOMElement();
  });
});
