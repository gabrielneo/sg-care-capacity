"""Geospatial steps of the transform: area name map, clinic placement, area metrics, web GeoJSON.

Every distance and area is computed in SVY21 (EPSG:3414), Singapore's projected metric grid,
where one unit is one metre with negligible distortion across the island. Results go to the
web in WGS84 (EPSG:4326). Geometries come from the staged URA Master Plan 2025 boundaries.
See docs/methodology.md.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely

from .warehouse import Warehouse

LOG = logging.getLogger(__name__)

SVY21 = "EPSG:3414"
WGS84 = "EPSG:4326"
CDMP_RADIUS_M = 1000             # pct_area_within_1km_of_cdmp


class AreaNameMismatch(RuntimeError):
    """Boundary and population planning-area names don't line up one to one."""


def normalise(name: str) -> str:
    return re.sub(r"\s+", " ", str(name)).strip().upper()


def _write(wh: Warehouse, table: str, df: pd.DataFrame, order: str) -> None:
    wh.con.register("_geo_out", df)
    try:
        wh.con.execute(f"CREATE OR REPLACE TABLE main.{table} AS SELECT * FROM _geo_out ORDER BY {order}")
    finally:
        wh.con.unregister("_geo_out")


def areas(wh: Warehouse, crs: str = SVY21) -> gpd.GeoDataFrame:
    df = wh.query("SELECT planning_area_code, planning_area_name, region_name, geometry_wkt, source_sha256 "
                  "FROM staging.stg_planning_area_boundaries ORDER BY planning_area_code")
    gdf = gpd.GeoDataFrame(df.drop(columns="geometry_wkt"),
                           geometry=gpd.GeoSeries.from_wkt(df["geometry_wkt"], crs=WGS84), crs=WGS84)
    return gdf.to_crs(crs)


def _points(df: pd.DataFrame, crs: str = SVY21) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df["longitude"], df["latitude"]), crs=WGS84).to_crs(crs)


# --------------------------------------------------------------------------- #
# 1. Explicit planning-area name map: boundary file <-> SingStat
# --------------------------------------------------------------------------- #

def build_area_name_map(wh: Warehouse) -> pd.DataFrame:
    """main.ref_area_name_map: one row per boundary area with its population name, or a loud failure.

    Matched by name after normalising case and whitespace only. Any boundary area without a
    population name, or population area without a boundary, raises AreaNameMismatch listing them:
    never dropped, never guessed. If no population is loaded at all, every area maps to NULL with
    match_method 'population_missing', and the blocking check completeness.population_present
    stops publishing instead.
    """
    b = wh.query("SELECT planning_area_code, planning_area_name FROM staging.stg_planning_area_boundaries")
    p = wh.query("SELECT DISTINCT planning_area FROM staging.stg_singstat_residents "
                 "WHERE year = (SELECT max(year) FROM staging.stg_singstat_residents)")
    by_norm = {normalise(n): n for n in p["planning_area"]}
    if p.empty:
        out = b.assign(population_name=None, match_method="population_missing")
    else:
        b["population_name"] = b["planning_area_name"].map(lambda n: by_norm.get(normalise(n)))
        unmatched_b = sorted(b.loc[b["population_name"].isna(), "planning_area_name"])
        unmatched_p = sorted(set(p["planning_area"]) - set(b["population_name"].dropna()))
        if unmatched_b or unmatched_p:
            raise AreaNameMismatch(
                f"planning-area names do not match: in boundaries only {unmatched_b}; in population only "
                f"{unmatched_p}. Add explicit pairs to the name map; nothing is dropped or guessed.")
        out = b.assign(match_method="exact_after_case_and_space_normalisation")
    out = out.rename(columns={"planning_area_name": "boundary_name"})[
        ["planning_area_code", "boundary_name", "population_name", "match_method"]]
    _write(wh, "ref_area_name_map", out, "planning_area_code")
    return out


def display_names(wh: Warehouse) -> dict[str, str]:
    """planning_area_code -> SingStat's spelling where mapped, else the URA name."""
    m = wh.query("SELECT planning_area_code, coalesce(population_name, boundary_name) AS name FROM main.ref_area_name_map")
    return dict(zip(m["planning_area_code"], m["name"]))


# --------------------------------------------------------------------------- #
# 2. Clinic -> planning area (point in polygon, SVY21)
# --------------------------------------------------------------------------- #

def assign_clinics(wh: Warehouse) -> pd.DataFrame:
    """main.clinic_planning_area: 'inside' exactly one area, else NULL with 'outside_all' / 'ambiguous'.

    Never snapped to the nearest area.
    """
    clinics = wh.query("SELECT clinic_key, latitude, longitude FROM staging.stg_chas_clinics ORDER BY clinic_key")
    names = display_names(wh)
    rows = []
    placeable = clinics.dropna(subset=["latitude", "longitude"])
    hits: dict[str, list[str]] = {}
    if len(placeable):
        a = areas(wh)
        joined = gpd.sjoin(_points(placeable), a[["planning_area_code", "geometry"]], how="left", predicate="covered_by")
        for key, code in zip(joined["clinic_key"], joined["planning_area_code"]):
            if pd.notna(code):
                hits.setdefault(key, []).append(code)
    for key in clinics["clinic_key"]:
        codes = sorted(set(hits.get(key, [])))
        if len(codes) == 1:
            rows.append((key, codes[0], names.get(codes[0]), "inside"))
        else:
            rows.append((key, None, None, "ambiguous" if codes else "outside_all"))
    out = pd.DataFrame(rows, columns=["clinic_key", "planning_area_code", "planning_area_name", "assignment"])
    _write(wh, "clinic_planning_area", out, "clinic_key")
    return out


# --------------------------------------------------------------------------- #
# 3. Area metrics (SVY21)
# --------------------------------------------------------------------------- #

def area_geo_metrics(wh: Warehouse) -> pd.DataFrame:
    """main.area_geo_metrics: land area, % of land within 1 km of an active CDMP clinic, and the
    straight-line distance from the area's centroid to the nearest polyclinic (approximate)."""
    a = areas(wh)
    out = pd.DataFrame({"planning_area_code": a["planning_area_code"],
                        "area_km2": a.geometry.area / 1e6})

    cdmp = wh.query("SELECT latitude, longitude FROM marts.dim_clinic "
                    "WHERE is_active AND has_cdmp AND latitude IS NOT NULL AND longitude IS NOT NULL")
    if wh.con.execute("SELECT count(*) FROM marts.dim_clinic").fetchall()[0][0] == 0:
        out["pct_area_within_1km_of_cdmp"] = None                 # no clinic data: missing, not 0
    else:
        # Buffers around EVERY active CDMP clinic in Singapore: a clinic just across an area
        # border still covers this area's land.
        cover = _points(cdmp).buffer(CDMP_RADIUS_M).union_all() if len(cdmp) else None
        covered = a.geometry.intersection(cover).area if cover is not None else 0.0
        out["pct_area_within_1km_of_cdmp"] = 100.0 * covered / a.geometry.area

    centroids = a.geometry.centroid
    out["centroid_in_area"] = a.geometry.contains(centroids).to_numpy()
    poly = wh.query("SELECT facility_name, latitude, longitude, source_sha256 FROM staging.stg_polyclinics "
                    "WHERE is_polyclinic AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY facility_name")
    if poly.empty:
        out["approx_km_centroid_to_nearest_polyclinic"] = None
        out["nearest_polyclinic"] = None
        out["polyclinic_source_sha256"] = None
    else:
        pts = _points(poly)
        dist = pd.DataFrame({name: centroids.distance(p) for name, p in zip(pts["facility_name"], pts.geometry)})
        out["approx_km_centroid_to_nearest_polyclinic"] = (dist.min(axis=1) / 1000.0).to_numpy()
        out["nearest_polyclinic"] = dist.idxmin(axis=1).to_numpy()
        out["polyclinic_source_sha256"] = ",".join(sorted(poly["source_sha256"].unique()))
    _write(wh, "area_geo_metrics", out, "planning_area_code")
    return out


# --------------------------------------------------------------------------- #
# 4. Simplified GeoJSON for the web map
# --------------------------------------------------------------------------- #

WEB_GEOJSON_NAME = "planning_area_access.geojson"
WEB_MAX_BYTES = 1_000_000
SIMPLIFY_TOLERANCES_M = (5, 10, 20, 30, 50, 80, 120)   # tried in order; the first that fits is used
COORD_DECIMALS = 5                                      # ~1.1 m at Singapore's latitude
WEB_PROPERTIES = ["planning_area_code", "planning_area", "region_name", "population_year", "residents_total",
                  "residents_65plus", "chas_clinics", "cdmp_clinics", "clinics_per_1k_seniors",
                  "cdmp_clinics_per_1k_seniors", "pct_area_within_1km_of_cdmp",
                  "approx_km_centroid_to_nearest_polyclinic", "nearest_polyclinic", "dq_note", "as_of", "as_of_basis"]


class WebGeometryError(RuntimeError):
    """The simplified web geometry is invalid or too large."""


def _json_value(v):
    if v is None or (pd.api.types.is_scalar(v) and pd.isna(v)):  # None, NaN, NaT, pd.NA -> null
        return None
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if hasattr(v, "item"):                                       # numpy scalars
        v = v.item()
    return round(v, 4) if isinstance(v, float) else v


def _round_coords(geom):
    return shapely.transform(geom, lambda xy: xy.round(COORD_DECIMALS))


def web_geojson(wh: Warehouse, max_bytes: int = WEB_MAX_BYTES) -> tuple[dict, int]:
    """Build the web GeoJSON dict. Returns (geojson, simplification tolerance in metres)."""
    a = areas(wh)
    metrics = wh.query("SELECT * FROM marts.fct_area_access")
    a = a[["planning_area_code", "geometry"]].merge(metrics, on="planning_area_code", how="left", validate="1:1")
    if len(a) != len(metrics):
        raise WebGeometryError(f"{len(a)} boundaries vs {len(metrics)} access rows")
    original_union = a.geometry.union_all()
    for tol in SIMPLIFY_TOLERANCES_M:
        # coverage_simplify moves each shared border once, so neighbours keep sharing it exactly:
        # no gaps or slivers open between areas (per-polygon simplify would create them).
        simple = gpd.GeoSeries(shapely.coverage_simplify(a.geometry.values, tol), crs=SVY21)
        web = gpd.GeoSeries(simple.to_crs(WGS84).map(_round_coords), crs=WGS84)
        features = []
        for geom, (_, row) in zip(web, a.iterrows()):
            features.append({"type": "Feature",
                             "properties": {k: _json_value(row[k]) for k in WEB_PROPERTIES},
                             "geometry": shapely.geometry.mapping(geom)})
        doc = {"type": "FeatureCollection",
               "metadata": {"title": "Clinic access for residents aged 65+, by planning area",
                            "boundaries": "URA Master Plan 2025 Planning Area (No Sea)",
                            "computed_in": "SVY21 (EPSG:3414); output WGS84 (EPSG:4326)",
                            "simplification_tolerance_m": tol, "coordinate_decimals": COORD_DECIMALS,
                            "boundary_source_sha256": a["boundary_source_sha256"].dropna().iloc[0]
                            if a["boundary_source_sha256"].notna().any() else None,
                            "methodology": "docs/methodology.md"},
               "features": features}
        if len(json.dumps(doc, separators=(",", ":")).encode()) <= max_bytes:
            break
    else:
        raise WebGeometryError(f"web GeoJSON exceeds {max_bytes} bytes even at {SIMPLIFY_TOLERANCES_M[-1]} m")
    invalid = [f["properties"]["planning_area"] for f, g in zip(features, web) if not g.is_valid or g.is_empty]
    if invalid:
        raise WebGeometryError(f"simplified geometry invalid or empty for {invalid}")
    lost = abs(simple.union_all().area - original_union.area) / original_union.area
    if lost > 0.01:
        raise WebGeometryError(f"simplification changed the total area by {lost:.2%}")
    return doc, tol


def write_web_geojson(wh: Warehouse, out_dir: Path | None = None) -> Path:
    """Write the web GeoJSON next to the warehouse (data/build/web/), compact and deterministic."""
    out_dir = Path(out_dir) if out_dir else wh.path.parent / "web"
    out_dir.mkdir(parents=True, exist_ok=True)
    doc, tol = web_geojson(wh)
    path = out_dir / WEB_GEOJSON_NAME
    path.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    LOG.info("web GeoJSON written: %s (%d bytes, simplified at %d m)", path, path.stat().st_size, tol,
             extra={"fields": {"event": "web_geojson", "bytes": path.stat().st_size, "tolerance_m": tol}})
    return path
