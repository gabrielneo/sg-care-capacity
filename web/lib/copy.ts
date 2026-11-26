/**
 * The site's own plain-language text (docs/language_rules.md). API caveats are written for API
 * users and can name database columns, so public pages show these instead; the API's caveats are
 * kept for the Data Quality detail section.
 */
import { parseAsOf } from "./dates";
import { RANGE_WEEKS } from "./windows";

// Rule 4: the bed-wait metric, everywhere.
export const BED_WAIT_LABEL = "Time waiting for a ward bed after the decision to admit";

/**
 * Why a week is an average of daily medians (audit B4): the one line, used wherever the definition is.
 * A median of medians, or a weekly median, can't be rebuilt from MOH's daily figures.
 */
export const BED_WAIT_WEEKLY_WHY =
  "A week's figure averages its daily medians, because MOH publishes only daily medians and a weekly median can't be rebuilt from them.";
/** The monthly series covers the same hospitals every month (pipeline/sql/marts/fct_ed_system_monthly.sql). */
export const SYSTEM_MONTHLY_SCOPE =
  "Woodlands Hospital, reported only from June 2024, and Alexandra's urgent care centre are left out, so every month compares the same hospitals.";
export const BED_WAIT_EXPLAINER =
  "This is not the time to see a doctor. It measures how long admitted patients wait in the ED for a ward bed. "
  + BED_WAIT_WEEKLY_WHY;

/**
 * Why a finding's hours can sit above the "typical" 2025 waits in the case study: those are each hospital's middle day for
 * the year; a finding averages each day's median over recent weeks, and a few very long days pull an average up.
 * (Checked on the warehouse, 12 Nov 2026: both figures reproduce; they measure different things over different periods.)
 */
export const AVERAGE_VS_TYPICAL =
  "These hours are averages of each day's median over recent weeks. A few very long days pull an average up, so they can sit above the case study's typical yearly waits.";

// The Overview's opening lines (comprehension report: testers didn't know "right-siting", or what the
// bed wait measured, from the first screen).
export const SITE_SCOPE = "This site shows two sets of figures side by side: bed waits for admitted patients at public hospitals, and clinics per senior. It does not test whether one affects the other.";
/** What the bed wait leaves out (the ED data has no age split and no time-to-see-a-doctor measure). */
export const BED_WAIT_NOT_MEASURED = "Bed waits cover only patients admitted to a ward. They don't show how long anyone waited to be seen by a doctor, or patients who went home.";
/**
 * What the clinic measure counts, with each source's own date (from the response's meta, never typed in). Shown as the lede of every
 * clinic-access chart, so the two dates and the "not polyclinics" limit are in view, not only under "More about these figures".
 */
export function clinicScope(meta: { sources: readonly { id: string; as_of?: string | null }[] }): string {
  const month = (id: string) => {
    const d = parseAsOf(meta.sources.find((s) => s.id === id)?.as_of);
    return d ? ` ${d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Singapore" })}` : "";
  };
  return `Counts CDMP GP clinics only: polyclinics are not included. The clinic list is from${month("datagov_chas") || " an earlier date"} and the resident counts from${month("singstat_residents") || " a later date"}. `
    + "Clinic counts do not show opening hours, doctors, cost or transport.";
}
/** Under every bed-wait chart (not hidden in "More about these figures"): what an average of daily medians hides. */
export const BED_WAIT_AVERAGE_NOTE =
  "Each figure averages the daily medians MOH publishes. An average of medians understates the days when waits ran longest, and says nothing about the longest waits.";
/** Why "about usual" is not "stable": under the chart that marks a week above or below a hospital's usual. */
export const USUAL_RANGE_NOTE =
  `A hospital is marked above or below usual only when its latest week is far outside the swing of its own complete weeks among the previous ${RANGE_WEEKS}. Some hospitals swing widely from week to week, so a large change can still be ordinary for them; the table shows each one's usual swing.`;
export const BED_WAIT_SHORT = "The bed wait is the time an admitted patient waits in the ED for a ward bed. It is not the time to see a doctor.";
/** Cited on the page (population.gov.sg): the 21% line is crossed by citizens, not yet by all residents. */
export const CITIZENS_SUPER_AGED = "Among citizens alone, Singapore passed that mark in 2026";

// Footer caveats, by measure.
export const CAVEAT = {
  bedWaitUnit: "MOH doesn't state the unit. We read the values as hours, because a typical value is about 4.",
  weeklyAverage: BED_WAIT_WEEKLY_WHY,
  edVisits: "ED visits include non-urgent cases. Alexandra Hospital runs a UCC, not a full ED.",
  clinics: "Clinics are counted where they are, not where their patients live. Areas marked as small, or as having many clinics for their residents, have less reliable rates.",
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

