/**
 * The site's own plain-language text (docs/language_rules.md). API caveats are written for API
 * users and can name database columns, so public pages show these instead; the API's caveats are
 * kept for the Data Quality detail section.
 */

// Rule 4: the bed-wait metric, everywhere.
export const BED_WAIT_LABEL = "Time waiting for a ward bed after the decision to admit";
export const BED_WAIT_UNIT_DAILY = "hours, daily median";
export const BED_WAIT_UNIT_WEEKLY = "hours, average of each day's median";
export const BED_WAIT_EXPLAINER =
  "This is not the time to see a doctor. It measures how long admitted patients wait in the ED for a ward bed.";

/**
 * Why a finding's hours can sit above the "typical" 2025 waits in the case study: those are each hospital's middle day for
 * the year; a finding averages each day's median over recent weeks, and a few very long days pull an average up.
 * (Checked on the warehouse, 12 Nov 2026: both figures reproduce; they measure different things over different periods.)
 */
export const AVERAGE_VS_TYPICAL =
  "These hours are averages of each day's median over recent weeks. A few very long days pull an average up, so they can sit above the case study's typical yearly waits.";

// The Overview's opening lines (comprehension report: testers didn't know "right-siting", or what the
// bed wait measured, from the first screen).
export const SITE_SCOPE = "This site tracks both sides for Singapore's seniors: hospital emergency departments and nearby clinics.";
export const BED_WAIT_SHORT = "The bed wait is the time an admitted patient waits in the ED for a ward bed. It is not the time to see a doctor.";
/** Cited on the page (population.gov.sg): the 21% line is crossed by citizens, not yet by all residents. */
export const CITIZENS_SUPER_AGED = "Among citizens alone, Singapore passed that mark in 2026";

// Footer caveats, by measure.
export const CAVEAT = {
  bedWaitUnit: "MOH doesn't state the unit. We read the values as hours, because a typical value is about 4.",
  weeklyAverage: "MOH publishes one median per day. A week's figure is the average of each day's median.",
  edVisits: "ED visits include non-urgent cases. Alexandra Hospital runs a UCC, not a full ED.",
  clinics: "The clinic list dates from June 2024, and the resident count from June 2026. Clinics are counted where they are, not where their patients live.",
  live: "NUHS lists adult and children's emergency separately. These are estimates at one moment, up to 7 days old.",
  childrensEmergency: "Children's emergency is not part of MOH's NUH figures, which cover adults only.",
  quality: "These are the checks behind this week's data release. Failed checks set data aside; they never change it.",
  population: "Residents are citizens and permanent residents. The total adds up SingStat's figures for each area, rounded to the nearest 10.",
} as const;

// "Basis" of each source's date, in plain words (the API gives internal names).
export const BASIS: Record<string, string> = {
  moh_bed_waits: "Latest day reported",
  moh_ed_attendances: "Latest day reported",
  nuhs_live: "NUHS's \"last updated\" time",
  singstat_residents: "End of June (the count date)",
  datagov_chas: "When data.gov.sg last updated it",
  datagov_planning_areas: "When data.gov.sg last updated it",
  datagov_polyclinics: "When data.gov.sg last updated it",
  // The dataset is touched more often than its figures change: its latest year can be much older (audit I-4).
  datagov_annual_ae: "When data.gov.sg last updated it, not the latest year the figures cover",
};

// API errors, in plain words. The code stays visible as a reference.
const ERRORS: Record<string, string> = {
  unreachable: "The data service isn't responding. Please try again later.",
  not_configured: "This page isn't connected to its data yet.",
  range_too_long: "Choose dates no more than 2 years apart.",
  invalid_range: "The start date is after the end date.",
  unknown_hospital: "We don't recognise that hospital code.",
  invalid_parameter: "One of the choices in the address isn't valid.",
  invalid_bbox: "That map area isn't valid.",
  empty_response: "The data service sent back nothing.",
};

export function plainError(err: { code?: string; message: string }): { code?: string; message: string } {
  return { code: err.code, message: (err.code && ERRORS[err.code]) || "Something went wrong while loading this data. Please try again later." };
}

/** "3 Aug 2026" from "2026-08-03". */
export function dayText(iso: string): string {
  return new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${iso}T00:00:00Z`));
}

// The triage band (docs/adr/0011-public-view.md). The line is deliberately short: the site gives no
// medical advice beyond "call 995" and a pointer to the official page.
export const TRIAGE_EMERGENCY = "Life-threatening emergency? Call 995.";
export const TRIAGE_NEXT = "Not life-threatening? A GP clinic or polyclinic can often help instead of an emergency department.";
/**
 * The official MOH or HealthHub page on when to go to an emergency department and when to see a GP
 * or polyclinic. TODO(me): confirm the URL. Until it is set, the band shows no link: no address is guessed.
 */
export const TRIAGE_GUIDANCE_URL: string | null = null;
export const TRIAGE_GUIDANCE_LABEL = "Where to go: official guidance";
