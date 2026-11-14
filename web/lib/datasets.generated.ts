// GENERATED from docs/datasets.yml by scripts/gen-datasets.mjs. Do not edit; run npm run gen:datasets.
export type DatasetCadence = "weekly" | "yearly" | "irregular" | "moment";

export interface Span {
  days?: number;
  months?: number;
}

export interface DatasetRule {
  label: string;
  publisher: string;
  cadence: DatasetCadence;
  due_after?: Span;
  overdue_after?: Span;
  inherits?: true;
}

export const DATASETS: Record<string, DatasetRule> = {
  "moh_bed_waits": {
    "label": "Bed waits",
    "publisher": "MOH",
    "cadence": "weekly",
    "due_after": {
      "days": 10
    },
    "overdue_after": {
      "days": 21
    }
  },
  "moh_ed_attendances": {
    "label": "ED visits",
    "publisher": "MOH",
    "cadence": "weekly",
    "due_after": {
      "days": 10
    },
    "overdue_after": {
      "days": 21
    }
  },
  "nuhs_live": {
    "label": "Time-to-see-a-doctor estimates",
    "publisher": "NUHS",
    "cadence": "moment",
    "due_after": {
      "days": 1
    },
    "overdue_after": {
      "days": 7
    }
  },
  "datagov_chas": {
    "label": "CHAS clinics",
    "publisher": "data.gov.sg",
    "cadence": "irregular",
    "due_after": {
      "months": 12
    },
    "overdue_after": {
      "months": 24
    }
  },
  "datagov_polyclinics": {
    "label": "Polyclinics",
    "publisher": "data.gov.sg",
    "cadence": "irregular",
    "due_after": {
      "months": 12
    },
    "overdue_after": {
      "months": 24
    }
  },
  "datagov_planning_areas": {
    "label": "URA planning-area boundaries",
    "publisher": "data.gov.sg",
    "cadence": "irregular",
    "due_after": {
      "months": 12
    },
    "overdue_after": {
      "months": 24
    }
  },
  "singstat_residents": {
    "label": "Resident population",
    "publisher": "SingStat",
    "cadence": "yearly",
    "due_after": {
      "months": 15
    },
    "overdue_after": {
      "months": 18
    }
  },
  "datagov_annual_ae": {
    "label": "Yearly ED visits",
    "publisher": "data.gov.sg",
    "cadence": "yearly",
    "due_after": {
      "months": 15
    },
    "overdue_after": {
      "months": 18
    }
  },
  "insight_findings": {
    "label": "Findings",
    "publisher": "this site's insight engine",
    "cadence": "weekly",
    "inherits": true
  }
};
