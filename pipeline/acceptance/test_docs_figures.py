"""The numbers typed into the docs, checked against the marts they describe.

The site's charts and findings follow the data on every release; a sentence in a Markdown doc does not. So each figure
below is read back from the warehouse and must appear in the doc as written. When a weekly release changes one, this fails and
names the doc and the figure: update the doc (or, better, the sentence that used a figure that moves). A figure that is true
of a past release only says so in its own text ("from release data-2026-11-08") and is not listed here.
"""
import pytest


def fmt(n: float, digits: int = 0) -> str:
    return f"{n:,.{digits}f}"


def _years(sql):
    return {int(r.y): r for r in sql("""
        SELECT year(report_date) y, sum(attendances) a, sum(attendances) FILTER (WHERE hospital_code <> 'WH') ex_wh
        FROM marts.fct_ed_daily GROUP BY 1""").itertuples()}


@pytest.fixture(scope="module")
def figures(sql):
    y = _years(sql)
    area = sql("SELECT * FROM marts.fct_area_access")
    ranked = area[area.residents_65plus >= 1000]
    return {
        "att_2023": fmt(y[2023].a), "att_2024_ex_wh": fmt(y[2024].ex_wh), "att_2025_ex_wh": fmt(y[2025].ex_wh), "att_2025_all": fmt(y[2025].a),
        "seniors": fmt(area.residents_65plus.sum()), "residents": fmt(area.residents_total.sum()),
        "share_65plus": f"{100 * area.residents_65plus.sum() / area.residents_total.sum():.1f}%",
        "clinics": fmt(sql("SELECT count(*) n FROM marts.dim_clinic WHERE is_active").n[0]),
        "areas_without_residents": str(int((area.residents_total.fillna(0) == 0).sum())),
        "ranked_areas": str(len(ranked)),
        "median_rate": f"{ranked.cdmp_clinics_per_1k_seniors.median():.2f}",
        "max_rate": f"{ranked.cdmp_clinics_per_1k_seniors.max():.2f}",
        "polyclinics": str(sql("SELECT count(*) n FROM marts.dim_polyclinic").n[0]),
        "area_km2": fmt(area.area_km2.sum()),
    }


# (doc, key in `figures`, the text as the doc must contain it with the figure filled in)
CLAIMS = [
    ("case_study.md", "att_2023", "recorded {} ED visits in 2023"),
    ("case_study.md", "att_2024_ex_wh", "{} in 2024"),
    ("case_study.md", "att_2025_ex_wh", "{} in 2025"),
    ("case_study.md", "att_2025_all", "all-site total of {} in"),
    ("case_study.md", "seniors", "{} of"),
    ("case_study.md", "residents", "of {}"),
    ("case_study.md", "share_65plus", "**{}**"),
    ("case_study.md", "median_rate", "The median is **{}**"),
    ("case_study.md", "max_rate", "**{}** (Rochor)"),
    ("methodology.md", "att_2025_all", "to {} (2025)"),
    ("methodology.md", "att_2023", "{} (2023)"),
    ("methodology.md", "att_2024_ex_wh", "{} in 2024"),
    ("methodology.md", "att_2025_ex_wh", "{} in 2025"),
    ("methodology.md", "clinics", "All {} clinics fall inside exactly one area"),
    ("methodology.md", "area_km2", "total {} km²"),
    ("methodology.md", "areas_without_residents", "{} planning areas have no residents"),
    ("methodology.md", "polyclinics", "all {} polyclinics"),
    # The README repeats the headline figures; "../README.md" is the repo root's, beside docs/.
    ("../README.md", "att_2023", "recorded {} visits in 2023"),
    ("../README.md", "att_2024_ex_wh", "{} in 2024"),
    ("../README.md", "att_2025_ex_wh", "and {} in 2025"),
    ("../README.md", "ranked_areas", "Across the {} planning areas"),
    ("../README.md", "max_rate", "**{}** (Rochor)"),
    ("../README.md", "median_rate", "with a median of {}."),
    ("../README.md", "share_65plus", "{} of residents were aged 65"),
]


@pytest.mark.parametrize("doc, key, template", CLAIMS, ids=[f"{d}:{k}" for d, k, _ in CLAIMS])
def test_a_figure_in_the_docs_is_still_what_the_data_says(docs, figures, doc, key, template):
    text = " ".join((docs / doc).read_text().split())
    want = template.format(figures[key])
    assert want in text, f"{doc}: the data now says {key} = {figures[key]}, but the doc does not contain {want!r}"


# ------------------------------------------------------------ the monthly marts

def test_monthly_marts_add_up_to_the_daily_figures(sql):
    d = sql("SELECT count(median_wait_hours) w, count(attendances) a, sum(attendances) s FROM marts.fct_ed_daily").iloc[0]
    m = sql("SELECT sum(days_reported_wait) w, sum(days_reported_attendances) a, sum(total_attendances) s FROM marts.fct_ed_monthly").iloc[0]
    assert (d.w, d.a, d.s) == (m.w, m.a, m.s)


def test_system_month_is_the_plain_average_of_the_full_eds_monthly_averages(sql):
    df = sql("""SELECT s.month_start, s.mean_of_hospital_mean_wait_hours w, s.total_attendances a,
                       (SELECT avg(m.mean_of_daily_median_wait_hours) FROM marts.fct_ed_monthly m JOIN marts.dim_hospital h USING (hospital_code)
                        WHERE m.month_start = s.month_start AND h.facility_type = 'ED' AND h.reported_from IS NULL) w2,
                       (SELECT sum(m.total_attendances) FROM marts.fct_ed_monthly m JOIN marts.dim_hospital h USING (hospital_code)
                        WHERE m.month_start = s.month_start AND h.facility_type = 'ED' AND h.reported_from IS NULL) a2
                FROM marts.fct_ed_system_monthly s WHERE s.is_complete_month""")
    assert len(df) > 12
    assert ((df.w - df.w2).abs() < 1e-9).all() and (df.a == df.a2).all()


def test_a_change_exists_only_between_two_complete_months(sql):
    bad = sql("""SELECT c.hospital_code, c.month_start FROM marts.fct_ed_monthly c
                 LEFT JOIN marts.fct_ed_monthly y ON y.hospital_code = c.hospital_code AND y.month_start = CAST(c.month_start - INTERVAL 1 YEAR AS DATE)
                 WHERE c.wait_yoy_pct IS NOT NULL AND NOT (c.is_complete_month AND coalesce(y.is_complete_month, FALSE))""")
    assert bad.empty, bad.to_dict("records")
