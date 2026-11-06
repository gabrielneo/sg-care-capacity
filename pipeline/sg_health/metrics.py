"""Published metrics: label, definition, unit, whether the unit is stated or inferred, caveat.

Seeded into main.ref_metric on every transform and exposed as marts.dim_metric, so the site
shows the same caveat text everywhere a metric appears. Definitions quote the publisher where it
gives one. Keep in step with docs/data_dictionary.md (a test checks the marts and columns exist).
"""
from __future__ import annotations

from datetime import date

METRICS_CHECKED = date(2026, 11, 6)

# metric_id: mart.column. unit_basis: 'stated' (the publisher names the unit) or 'inferred'.
METRICS: list[dict] = [
    {
        "metric_id": "fct_ed_daily.median_wait_hours",
        "label": "Median wait for a ward bed (daily)",
        "definition": "Daily median waiting time for admission to ward: from \"Decision by doctor to admit "
                      "patient\" to \"Time patient exits EMD\" (MOH).",
        "unit": "hours", "unit_basis": "inferred",
        "caveat": "Unit inferred, not stated by MOH: neither the workbook nor the page names it. Values are "
                  "read as hours because the median is about 4 (minutes would mean 4-minute waits). Covers "
                  "patients admitted that day only.",
        "source_name": "MOH, Waiting Time for Admission to Ward",
    },
    {
        "metric_id": "fct_ed_weekly.mean_of_daily_median_wait_hours",
        "label": "Average of daily median ward-bed waits (week)",
        "definition": "Mean of the daily median waiting times reported in the ISO week.",
        "unit": "hours", "unit_basis": "inferred",
        "caveat": "Not a weekly median: MOH publishes daily medians only. Unit inferred, as for the daily "
                  "median. Uses only the days reported (see days_reported_wait).",
        "source_name": "MOH, Waiting Time for Admission to Ward",
    },
    {
        "metric_id": "fct_ed_daily.attendances",
        "label": "Emergency department attendances (daily)",
        "definition": "Patients who presented at the EMD, regardless of urgency of medical conditions (MOH).",
        "unit": "patients", "unit_basis": "stated",
        "caveat": "Includes non-urgent cases. Alexandra Hospital is an Urgent Care Centre, not a full ED.",
        "source_name": "MOH, Attendances at Emergency Medicine Departments",
    },
    {
        "metric_id": "fct_live_ed_snapshot.est_bed_wait_hours",
        "label": "Estimated bed wait now (NUHS)",
        "definition": "NUHS's live estimate of the wait for a ward bed, at the time shown.",
        "unit": "hours", "unit_basis": "stated",
        "caveat": "An estimate at one moment, not MOH's daily median of admitted patients; compare only "
                  "side by side with both labels.",
        "source_name": "NUHS, Emergency Department wait times",
    },
    {
        "metric_id": "fct_clinic_access.cdmp_clinics_per_1000_65plus",
        "label": "CDMP clinics per 1,000 residents aged 65+",
        "definition": "Active CHAS clinics in the Chronic Disease Management Programme in the planning "
                      "area, per 1,000 residents aged 65 and over living there.",
        "unit": "clinics per 1,000 residents aged 65+", "unit_basis": "stated",
        "caveat": "Mixes vintages: the clinic list was last updated in June 2024, residents are counted "
                  "at June 2026. Counts where a clinic is, not where its patients live; residents of one "
                  "area use clinics in others. Resident counts are rounded to the nearest 10.",
        "source_name": "data.gov.sg CHAS Clinics; SingStat; URA Master Plan 2025",
    },
    {
        "metric_id": "fct_clinic_access.chas_clinics_per_1000_65plus",
        "label": "CHAS clinics per 1,000 residents aged 65+",
        "definition": "Active CHAS clinics in the planning area per 1,000 residents aged 65 and over.",
        "unit": "clinics per 1,000 residents aged 65+", "unit_basis": "stated",
        "caveat": "Same caveats as the CDMP measure.",
        "source_name": "data.gov.sg CHAS Clinics; SingStat; URA Master Plan 2025",
    },
    {
        "metric_id": "fct_planning_area_population.share_65plus",
        "label": "Share of residents aged 65+",
        "definition": "Residents aged 65 and over divided by all residents in the planning area.",
        "unit": "fraction (0-1)", "unit_basis": "stated",
        "caveat": "Resident counts are rounded to the nearest 10 per published cell; small areas are "
                  "sensitive to that rounding. No value where nobody lives.",
        "source_name": "SingStat, Residents by Planning Area, Age Group, Sex and Type of Dwelling",
    },
]
