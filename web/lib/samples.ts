import type { Meta } from "@/lib/api/types";

/** Sample metas for /dev/components and the tests. Shaped like the real /api/v1/ed/summary meta from snapshot data-2026-11-06. */
export const edMeta: Meta = {
  snapshot_id: "data-2026-11-06",
  as_of: "2026-10-31",
  sources: [
    {
      id: "moh_bed_waits",
      name: "MOH, Waiting Time for Admission to Ward",
      url: "https://www.moh.gov.sg/others/resources-and-statistics/healthcare-institution-statistics-waiting-time-for-admission-to-ward/",
      as_of: "2026-10-31",
      as_of_basis: "latest report_date",
      last_fetched_at: "2026-11-06T16:33:44",
    },
    {
      id: "moh_ed_attendances",
      name: "MOH, Attendances at Emergency Medicine Departments",
      url: "https://www.moh.gov.sg/others/resources-and-statistics/healthcare-institution-statistics-attendances-at-emergency-medicine-departments/",
      as_of: "2026-10-31",
      as_of_basis: "latest report_date",
      last_fetched_at: "2026-11-06T16:33:50",
    },
  ],
  coverage: { hospitals_with_a_baseline: 9 },
  caveats: [
    "Average of daily median ward-bed waits (week): Not a weekly median: MOH publishes daily medians only.",
    "AH: Urgent Care Centre, not a full ED.",
  ],
  dq_warnings: [
    {
      check_id: "range.bed_wait_over_24h",
      table: "moh_bed_waits",
      severity: "WARN",
      status: "fail",
      failing_rows: 63,
      scope: "row",
      details: "SGH, 2026-10-20: over 24 hours",
    },
  ],
};

/** Shaped like /api/v1/clinics meta: the CHAS list was last updated 2024-06-06. */
export const clinicMeta: Meta = {
  ...edMeta,
  as_of: "2024-06-06T14:36:42",
  sources: [
    {
      id: "datagov_chas",
      name: "data.gov.sg, CHAS Clinics",
      url: "https://data.gov.sg/datasets/d_548c33ea2d99e29ec63a7cc9edcccedc/view",
      as_of: "2024-06-06T14:36:42",
      as_of_basis: "data.gov.sg lastUpdatedAt",
      last_fetched_at: "2026-11-06T16:34:00",
    },
  ],
  caveats: ["The CHAS clinic list was last updated by data.gov.sg on 2024-06-06."],
  dq_warnings: [],
};
