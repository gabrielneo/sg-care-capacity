"""Geospatial steps: SVY21 distances, the area name map, clinic placement, area metrics, geometry validity."""
import math

import geopandas as gpd
import pandas as pd
import pyproj
import pytest
from shapely.geometry import Point

from sg_health import geo
from sg_health.transform import TransformError
from sg_health.warehouse import Warehouse

from test_ingest import full_run, query

GEOD = pyproj.Geod(ellps="WGS84")         # independent reference: geodesic distance on the ellipsoid


def svy21_m(a: tuple, b: tuple) -> float:
    pts = gpd.GeoSeries([Point(a), Point(b)], crs=geo.WGS84).to_crs(geo.SVY21)
    return pts.iloc[0].distance(pts.iloc[1])


# ------------------------------------------------------------- SVY21 distances #

@pytest.mark.parametrize("label, a, b", [
    ("Changi Airport T3 to Tuas Checkpoint", (103.9894, 1.3554), (103.6368, 1.3485)),     # ~39 km east-west
    ("Woodlands Checkpoint to Marina Bay", (103.7690, 1.4455), (103.8590, 1.2840)),        # ~20 km north-south
    ("Orchard MRT to Dhoby Ghaut MRT", (103.8320, 1.3040), (103.8455, 1.2990)),            # ~1.6 km
])
def test_svy21_distance_is_within_1_percent_of_the_geodesic_distance(label, a, b):
    expected = GEOD.inv(a[0], a[1], b[0], b[1])[2]
    assert svy21_m(a, b) == pytest.approx(expected, rel=0.01), label


def test_one_kilometre_north_is_one_kilometre_in_svy21():
    lon, lat, _ = GEOD.fwd(103.8, 1.35, 0, 1000)          # walk exactly 1,000 m due north
    assert svy21_m((103.8, 1.35), (lon, lat)) == pytest.approx(1000, rel=0.01)


def test_latitude_degree_is_about_110_6_km():
    # A textbook value near the equator, as an anchor outside pyproj altogether.
    assert svy21_m((103.8, 1.0), (103.8, 2.0)) / 1000 == pytest.approx(110.6, rel=0.01)


# --------------------------------------------------------------- name map #

def test_every_planning_area_is_mapped_and_has_a_row(monkeypatch, paths):
    full_run(monkeypatch, paths)
    nmap = query(paths, "SELECT * FROM main.ref_area_name_map ORDER BY planning_area_code")
    access = query(paths, "SELECT planning_area_code, planning_area FROM marts.fct_area_access ORDER BY 1")
    boundaries = query(paths, "SELECT planning_area_code FROM main.planning_area_boundaries ORDER BY 1")
    assert list(nmap["planning_area_code"]) == list(access["planning_area_code"]) == list(boundaries["planning_area_code"])
    assert set(nmap["match_method"]) == {"exact_after_case_and_space_normalisation"}
    assert list(access["planning_area"]) == ["Bedok", "Tuas"]                     # SingStat spelling


def test_unmatched_area_names_fail_loudly(monkeypatch, paths):
    from conftest import PLANNING_AREAS_DOWNLOAD, planning_area_geojson, source_routes
    routes = source_routes()
    routes[PLANNING_AREAS_DOWNLOAD] = (planning_area_geojson([
        ("BD", "BEDOK", "EAST", (103.65, 1.30, 103.72, 1.36)),
        ("TS", "TUAS SOUTH", "WEST", (103.60, 1.28, 103.64, 1.32))]), "application/geo+json")   # renamed
    from sg_health import cli
    from conftest import FakeHttp
    fake = FakeHttp(routes)
    monkeypatch.setattr(cli, "PoliteHttp", lambda: fake)
    code = cli.main(["--db", str(paths["db"]), "--raw-dir", str(paths["raw"]), "--report", str(paths["report"]), "run"])
    assert code == 1                                                              # the transform stopped
    wh = Warehouse(paths["db"])
    try:
        with pytest.raises(TransformError, match=r"boundaries only \['TUAS SOUTH'\]; in population only \['Tuas'\]"):
            from sg_health.transform import run_transform
            run_transform(wh)
    finally:
        wh.close()


def test_missing_population_maps_to_null_rather_than_failing(monkeypatch, paths):
    from sg_health import config
    from conftest import source_routes
    routes = source_routes()
    del routes[config.SINGSTAT_RESIDENTS_URL]
    monkeypatch.setattr("sg_health.sources.singstat.SINGSTAT_RESIDENTS_SEED", paths["raw"] / "no-seed.zip")
    full_run(monkeypatch, paths, routes)
    nmap = query(paths, "SELECT * FROM main.ref_area_name_map")
    assert nmap["population_name"].isna().all() and set(nmap["match_method"]) == {"population_missing"}
    assert len(query(paths, "SELECT * FROM marts.fct_area_access")) == 2


# ------------------------------------------------------------ area metrics #

def _square_around(lon, lat, half_m):
    """A square of side 2*half_m metres (in SVY21) centred on lon/lat, as WGS84 bounds."""
    t = pyproj.Transformer.from_crs(geo.WGS84, geo.SVY21, always_xy=True)
    back = pyproj.Transformer.from_crs(geo.SVY21, geo.WGS84, always_xy=True)
    x, y = t.transform(lon, lat)
    x0, y0 = back.transform(x - half_m, y - half_m)
    x1, y1 = back.transform(x + half_m, y + half_m)
    return (x0, y0, x1, y1)


def test_pct_area_within_1km_matches_circle_over_square(monkeypatch, paths):
    """One CDMP clinic in the middle of a 4 km x 4 km area: covered share = pi km2 / 16 km2 = 19.6%."""
    from conftest import PLANNING_AREAS_DOWNLOAD, chas_geojson, planning_area_geojson, source_routes
    routes = source_routes(chas=chas_geojson([("C1", "MIDDLE", "CHAS,CDMP", (103.68, 1.33)),
                                              ("C2", "NOT CDMP", "CHAS", (103.62, 1.30))]))
    routes[PLANNING_AREAS_DOWNLOAD] = (planning_area_geojson([
        ("BD", "BEDOK", "EAST", _square_around(103.68, 1.33, 2000)),
        ("TS", "TUAS", "WEST", (103.60, 1.28, 103.64, 1.32))]), "application/geo+json")
    full_run(monkeypatch, paths, routes)
    a = query(paths, "SELECT * FROM marts.fct_area_access").set_index("planning_area")
    assert a.loc["Bedok", "area_km2"] == pytest.approx(16.0, rel=0.01)
    assert a.loc["Bedok", "pct_area_within_1km_of_cdmp"] == pytest.approx(100 * math.pi / 16, rel=0.01)
    assert a.loc["Tuas", "pct_area_within_1km_of_cdmp"] == pytest.approx(0.0, abs=1e-9)   # 1 km away from no CDMP


def test_nearest_polyclinic_distance_from_the_centroid(monkeypatch, paths):
    from conftest import POLYCLINICS_DOWNLOAD, PLANNING_AREAS_DOWNLOAD, planning_area_geojson, polyclinics_geojson, source_routes
    routes = source_routes()
    square = _square_around(103.68, 1.33, 2000)
    lon_3km, lat_3km, _ = GEOD.fwd(103.68, 1.33, 90, 3000)                      # 3 km due east of the centre
    routes[PLANNING_AREAS_DOWNLOAD] = (planning_area_geojson([("BD", "BEDOK", "EAST", square),
                                                              ("TS", "TUAS", "WEST", (103.60, 1.28, 103.64, 1.32))]),
                                       "application/geo+json")
    routes[POLYCLINICS_DOWNLOAD] = (polyclinics_geojson([("East Polyclinic", lon_3km, lat_3km),
                                                         ("Far Polyclinic", 103.95, 1.40),
                                                         ("A GP Clinic", 103.681, 1.331)]), "application/geo+json")
    full_run(monkeypatch, paths, routes)
    bedok = query(paths, "SELECT * FROM marts.fct_area_access").set_index("planning_area").loc["Bedok"]
    assert bedok.approx_km_centroid_to_nearest_polyclinic == pytest.approx(3.0, rel=0.01)
    assert bedok.nearest_polyclinic == "East Polyclinic"                         # the GP clinic isn't a polyclinic
    assert bool(bedok.centroid_in_area)


# -------------------------------------------------------------- validity #

def test_no_geometry_is_invalid_after_reprojection(monkeypatch, paths):
    full_run(monkeypatch, paths)
    wh = Warehouse(paths["db"])
    try:
        a = geo.areas(wh)
    finally:
        wh.close()
    assert a.geometry.is_valid.all() and not a.geometry.is_empty.any()
    assert a.crs.to_epsg() == 3414
