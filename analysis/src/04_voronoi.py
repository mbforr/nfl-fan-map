"""04 — Voronoi tessellation of the 32 stadiums (the "nearest team" counterfactual).

Builds Voronoi cells over stadium points, clips to the continental US outline,
then for each cell sums the fan counts of every US region whose centroid falls
inside it. The "confusion" is: fans inside a team's cell who root for a DIFFERENT
team — i.e. where geography-of-nearest-stadium disagrees with actual fandom.

Uses Shapely's voronoi_diagram (robust, always-valid polygons) rather than a
hand-rolled scipy reconstruction, which produced invalid sliver geometries that
rendered as broken lines. Emits GeoJSON only; a later Mapbox app renders it.
"""
from __future__ import annotations

import geopandas as gpd
import pandas as pd
from shapely import make_valid, set_precision
from shapely.geometry import MultiPoint, MultiPolygon, Point
from shapely.ops import unary_union, voronoi_diagram

import common as c

# GeoJSON is written at 3-decimal precision; snap to that grid first so tiny
# holes/rings that would collapse to degenerate points get cleaned up-front.
WRITE_GRID = 0.001

# Drop coastal-island slivers below this area (deg²; ~12 km² near the US). They
# collapse to degenerate rings on GeoJSON write and add no visual value.
MIN_SLIVER_AREA = 1e-3
SIMPLIFY_TOL = 0.005  # deg (~0.5 km) — lighter geometry, no visible change at story zoom


def polygonal_only(geom):
    """Keep only Polygon/MultiPolygon parts. A polygon∩polygon clip can return a
    GeometryCollection with stray boundary lines/points that render as artifacts."""
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    if geom.geom_type == "GeometryCollection":
        polys = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        return unary_union(polys) if polys else None
    return None


def clean_cell(geom):
    """Valid, sliver-free, lightly-simplified polygon for rendering.

    Simplify first (can collapse small rings), THEN drop any sub-polygon that is
    tiny, degenerate (<4 points), or invalid — otherwise those degenerate rings
    survive in memory but fail validation once written to GeoJSON.
    """
    geom = polygonal_only(make_valid(geom))
    if geom is None or geom.is_empty:
        return None
    geom = geom.simplify(SIMPLIFY_TOL)
    # Snap to the write grid so anything that would round-collapse is resolved
    # now (make_valid drops the degenerate bits), not silently on disk.
    geom = polygonal_only(make_valid(set_precision(geom, WRITE_GRID)))
    if geom is None or geom.is_empty:
        return None
    parts = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
    kept = [p for p in parts
            if p.area >= MIN_SLIVER_AREA and p.is_valid and len(p.exterior.coords) >= 4]
    if not kept:
        kept = [max(parts, key=lambda p: p.area)]  # keep the mainland at least
    g = kept[0] if len(kept) == 1 else MultiPolygon(kept)
    return make_valid(g)

# Alaska + Hawaii excluded from the continental Voronoi (their own beat in the
# plan; AK also crosses the antimeridian and breaks the dissolve).
NONCONTINENTAL_FIPS = {"02", "15"}


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("04_voronoi")

    stad = c.stadiums()
    fan_count = {r["short_name"]: r["count"] for r in c.load_totals()["a"]}

    # Co-located teams share a stadium (Rams+Chargers at SoFi, Giants+Jets at
    # MetLife) → one Voronoi cell owned by BOTH. Group teams by location.
    loc_teams: dict[tuple, list[str]] = {}
    for t in stad:
        key = (round(stad[t]["lng"], 4), round(stad[t]["lat"], 4))
        loc_teams.setdefault(key, []).append(t)
    # Order each location's teams by national fan count (primary first for color).
    for key in loc_teams:
        loc_teams[key].sort(key=lambda t: fan_count.get(t, 0), reverse=True)
    loc_points = {key: Point(*key) for key in loc_teams}

    # Continental US land outline (dissolve of lower-48 counties, made valid).
    regions = c.load_regions()
    us = regions[regions["country"] == "US"].copy()
    cont = us[~us["id"].apply(lambda i: c.state_fips(i) in NONCONTINENTAL_FIPS)].copy()
    cont["geometry"] = cont.geometry.apply(make_valid)
    us_outline = make_valid(cont.dissolve().geometry.iloc[0])

    # Robust Voronoi over the (unique) stadium locations.
    mp = MultiPoint(list(loc_points.values()))
    envelope = us_outline.envelope.buffer(5)
    cells = list(voronoi_diagram(mp, envelope=envelope).geoms)

    rows = []
    for key, teams in loc_teams.items():
        pt = loc_points[key]
        cell = next((cl for cl in cells if cl.contains(pt)), None)
        if cell is None:
            log.warning("no Voronoi cell for %s", teams)
            continue
        clipped = clean_cell(make_valid(cell).intersection(us_outline))
        if clipped is None or clipped.is_empty:
            continue
        rows.append({
            "cell_team": teams[0],                       # primary — drives fill color
            "teams": teams,
            "label": " / ".join(t.split()[-1] for t in teams),  # "Rams / Chargers"
            "geometry": clipped,
        })
    vor_gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    log.info("built %d Voronoi cells (%d shared-stadium) — %d invalid",
             len(vor_gdf), sum(len(t) > 1 for t in loc_teams.values()),
             int((~vor_gdf.geometry.is_valid).sum()))

    # Assign each US region centroid to a cell, tally fan counts per cell.
    centroids = c.load_centroids()
    us_cent = centroids[centroids["country"] == "US"].copy()
    joined = gpd.sjoin(us_cent, vor_gdf[["cell_team", "geometry"]],
                       how="inner", predicate="within")

    teams_by_cell = {r["cell_team"]: r["teams"] for r in rows}
    out_rows = []
    for cell_team, grp in joined.groupby("cell_team"):
        tally: dict[str, int] = {}
        for d in grp["a_counts"]:
            for t, n in d.items():
                tally[t] = tally.get(t, 0) + n
        total = sum(tally.values())
        # A fan is "correct" if they root for ANY team sharing this stadium.
        correct = sum(tally.get(t, 0) for t in teams_by_cell[cell_team])
        out_rows.append({
            "cell_team": cell_team,
            "label": " / ".join(t.split()[-1] for t in teams_by_cell[cell_team]),
            "total_fans_in_cell": total,
            "own_team_fans": correct,
            "accuracy": round(correct / total, 4) if total else None,
            "top_actual_team": max(tally, key=tally.get) if tally else None,
        })
    conf = pd.DataFrame(out_rows).sort_values("accuracy", ascending=False)
    conf.to_csv(c.METRICS / "voronoi_confusion.csv", index=False)

    overall = conf["own_team_fans"].sum() / conf["total_fans_in_cell"].sum()
    log.info("overall Voronoi accuracy (fans in own nearest-stadium cell): %.3f", overall)
    log.info("best cells: %s", list(conf.head(3)[["label", "accuracy"]]
                                    .itertuples(index=False, name=None)))
    log.info("worst cells: %s", list(conf.tail(3)[["label", "accuracy"]]
                                     .itertuples(index=False, name=None)))

    # Attach accuracy back onto the cells for the map layer.
    vor_gdf = vor_gdf.drop(columns=["teams"]).merge(
        conf.drop(columns=["label"]), on="cell_team", how="left")
    c.write_geojson(vor_gdf, c.GEOJSON / "voronoi_stadiums.geojson", log)


if __name__ == "__main__":
    main()
