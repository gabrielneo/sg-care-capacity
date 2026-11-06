// GENERATED from docs/glossary.yml by scripts/gen-glossary.mjs. Do not edit; run npm run gen:glossary.
export type GlossaryCategory = "keep_abbreviation" | "keep_and_explain" | "technical_only";

export interface GlossaryEntry {
  id: string;
  abbreviation: string | null;
  full_name: string;
  plain_definition: string;
  category: GlossaryCategory;
  source_url: string | null;
  aliases: readonly string[];
  public_wording: string | null;
  /** True while the definition is still a TODO(me) for the author. */
  pending: boolean;
}

export const GLOSSARY = [
  {
    "id": "ed",
    "abbreviation": "ED",
    "full_name": "Emergency Department",
    "plain_definition": "The hospital's 24-hour emergency unit.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "moh",
    "abbreviation": "MOH",
    "full_name": "Ministry of Health",
    "plain_definition": "Singapore's health ministry; publishes the bed-wait data.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "chas",
    "abbreviation": "CHAS",
    "full_name": "Community Health Assist Scheme",
    "plain_definition": "Government subsidies at private GP and dental clinics.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "cdmp",
    "abbreviation": "CDMP",
    "full_name": "Chronic Disease Management Programme",
    "plain_definition": "Lets patients with long-term conditions such as diabetes use MediSave at the clinic.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "has",
    "abbreviation": "HAS",
    "full_name": "Health Appointment System",
    "plain_definition": "TODO(me): one-sentence definition from the official source",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": true
  },
  {
    "id": "ucc",
    "abbreviation": "UCC",
    "full_name": "Urgent Care Centre",
    "plain_definition": "Treats urgent but non-life-threatening cases; Alexandra Hospital runs one instead of a full ED.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "nuhs",
    "abbreviation": "NUHS",
    "full_name": "National University Health System",
    "plain_definition": "One of the three public healthcare clusters that run the hospitals.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "nhg_health",
    "abbreviation": "NHG Health",
    "full_name": "NHG Health",
    "plain_definition": "One of the three public healthcare clusters that run the hospitals; called National Healthcare Group until July 2025.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "singhealth",
    "abbreviation": "SingHealth",
    "full_name": "SingHealth",
    "plain_definition": "One of the three public healthcare clusters that run the hospitals.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "healthier_sg",
    "abbreviation": "Healthier SG",
    "full_name": "Healthier SG",
    "plain_definition": "The national programme for residents to enrol with one family doctor.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "polyclinic",
    "abbreviation": "polyclinic",
    "full_name": "polyclinic",
    "plain_definition": "Government primary care clinic.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [
      "polyclinics",
      "Polyclinic",
      "Polyclinics"
    ],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "gp",
    "abbreviation": "GP",
    "full_name": "general practitioner",
    "plain_definition": "A family doctor who treats everyday health problems in the community.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "ura",
    "abbreviation": "URA",
    "full_name": "Urban Redevelopment Authority",
    "plain_definition": "Singapore's land-use planning agency; it draws the planning areas used on the map.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "hpb",
    "abbreviation": "HPB",
    "full_name": "Health Promotion Board",
    "plain_definition": "The government board for health promotion; its screening-centre list is used to find polyclinics.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "sgt",
    "abbreviation": "SGT",
    "full_name": "Singapore Time",
    "plain_definition": "Singapore's time zone, 8 hours ahead of UTC.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "ah",
    "abbreviation": "AH",
    "full_name": "Alexandra Hospital",
    "plain_definition": "Alexandra Hospital's urgent care centre, run by NUHS.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "cgh",
    "abbreviation": "CGH",
    "full_name": "Changi General Hospital",
    "plain_definition": "Public hospital emergency department, run by SingHealth.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "ktph",
    "abbreviation": "KTPH",
    "full_name": "Khoo Teck Puat Hospital",
    "plain_definition": "Public hospital emergency department, run by NHG Health.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "ntfgh",
    "abbreviation": "NTFGH",
    "full_name": "Ng Teng Fong General Hospital",
    "plain_definition": "Public hospital emergency department, run by NUHS.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "nuh",
    "abbreviation": "NUH",
    "full_name": "National University Hospital",
    "plain_definition": "Public hospital emergency department, run by NUHS; MOH's figures cover adults only.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "sgh",
    "abbreviation": "SGH",
    "full_name": "Singapore General Hospital",
    "plain_definition": "Public hospital emergency department, run by SingHealth.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "skh",
    "abbreviation": "SKH",
    "full_name": "Sengkang General Hospital",
    "plain_definition": "Public hospital emergency department, run by SingHealth.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "ttsh",
    "abbreviation": "TTSH",
    "full_name": "Tan Tock Seng Hospital",
    "plain_definition": "Public hospital emergency department, run by NHG Health.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "wh",
    "abbreviation": "WH",
    "full_name": "Woodlands Hospital",
    "plain_definition": "Public hospital emergency department, run by NHG Health; in MOH's figures from June 2024.",
    "category": "keep_abbreviation",
    "source_url": null,
    "aliases": [],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "right_siting",
    "abbreviation": null,
    "full_name": "Right-siting",
    "plain_definition": "Treating people in the most suitable place, such as a GP clinic rather than a hospital, when it is safe to do so.",
    "category": "keep_and_explain",
    "source_url": null,
    "aliases": [
      "right-siting",
      "Right-siting"
    ],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "super_aged",
    "abbreviation": null,
    "full_name": "Super-aged society",
    "plain_definition": "A society where 21% or more of people are aged 65 or over.",
    "category": "keep_and_explain",
    "source_url": "https://www.population.gov.sg/our-population/population-trends/longevity/",
    "aliases": [
      "super-aged",
      "Super-aged"
    ],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "median",
    "abbreviation": null,
    "full_name": "Median",
    "plain_definition": "The middle value: half of patients waited longer, half shorter.",
    "category": "keep_and_explain",
    "source_url": null,
    "aliases": [
      "median",
      "medians",
      "Median"
    ],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "bed_wait",
    "abbreviation": null,
    "full_name": "Bed wait / boarding",
    "plain_definition": "Time a patient spends in the ED after a doctor decides to admit them, waiting for a ward bed.",
    "category": "keep_and_explain",
    "source_url": null,
    "aliases": [
      "bed wait",
      "bed waits",
      "Bed wait",
      "boarding"
    ],
    "public_wording": null,
    "pending": false
  },
  {
    "id": "median_wait_hours",
    "abbreviation": null,
    "full_name": "median_wait_hours, \"ED wait\"",
    "plain_definition": "The database name for MOH's daily median time waiting for a ward bed after the decision to admit.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "Time waiting for a ward bed after the decision to admit (daily median, hours)",
    "pending": false
  },
  {
    "id": "attendances",
    "abbreviation": null,
    "full_name": "attendances",
    "plain_definition": "MOH's word for patients who come to the ED, whatever the urgency.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "ED visits",
    "pending": false
  },
  {
    "id": "mean_of_daily_medians",
    "abbreviation": null,
    "full_name": "mean of daily medians",
    "plain_definition": "The average of a week's daily medians; MOH publishes no weekly median.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "Average of each day's median",
    "pending": false
  },
  {
    "id": "clinics_per_1k_seniors",
    "abbreviation": null,
    "full_name": "clinics_per_1k_seniors",
    "plain_definition": "The database name for CHAS GP clinics in an area for every 1,000 residents aged 65 or over.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "CHAS GP clinics per 1,000 residents aged 65+",
    "pending": false
  },
  {
    "id": "planning_area",
    "abbreviation": null,
    "full_name": "planning area",
    "plain_definition": "One of the 55 areas URA divides Singapore into for land-use planning.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "Area (URA planning area) on first use, then \"area\"",
    "pending": false
  },
  {
    "id": "choropleth",
    "abbreviation": null,
    "full_name": "choropleth, heatmap",
    "plain_definition": "Map types; a choropleth shades each area by its value, a heatmap blurs values across space.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "Never shown; say \"map shaded by...\"",
    "pending": false
  },
  {
    "id": "quantile_breaks",
    "abbreviation": null,
    "full_name": "quantile breaks",
    "plain_definition": "Cut-off values that split areas into groups with equal numbers of areas.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "Five groups with equal numbers of areas",
    "pending": false
  },
  {
    "id": "as_of",
    "abbreviation": null,
    "full_name": "as_of, snapshot",
    "plain_definition": "The date the figures were current, and the weekly published copy of the data.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "Data as of [date]; weekly data release",
    "pending": false
  },
  {
    "id": "statistically_significant",
    "abbreviation": null,
    "full_name": "statistically significant",
    "plain_definition": "A result that is unlikely to be due to chance alone.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "Unlikely to be chance (p < 0.05)",
    "pending": false
  },
  {
    "id": "ecological_fallacy",
    "abbreviation": null,
    "full_name": "ecological fallacy",
    "plain_definition": "The mistake of reading an area's average as true of each person in it.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "Area averages don't describe individual people",
    "pending": false
  },
  {
    "id": "imputed",
    "abbreviation": null,
    "full_name": "imputed / interpolated",
    "plain_definition": "Missing values filled in with estimates; this project never does that.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "We never fill in missing days; gaps stay gaps",
    "pending": false
  },
  {
    "id": "kpi",
    "abbreviation": null,
    "full_name": "KPI",
    "plain_definition": "Key performance indicator, a headline number that is tracked over time.",
    "category": "technical_only",
    "source_url": null,
    "aliases": [],
    "public_wording": "Key number",
    "pending": false
  }
] as const satisfies readonly GlossaryEntry[];

export type GlossaryId = (typeof GLOSSARY)[number]["id"];
