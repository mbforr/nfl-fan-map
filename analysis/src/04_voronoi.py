"""04 — Voronoi tessellation of the 32 stadiums (the "nearest team" counterfactual).

Builds Voronoi cells over stadium points, clips to the US outline, then for each
cell sums the fan counts of every US region whose centroid falls inside it. The
"confusion" is: fans inside a team's cell who root for a DIFFERENT team — i.e.
where geography-of-nearest-stadium disagrees with actual fandom.

Emits GeoJSON only (no HTML); a later Mapbox app renders it.
"""
from __future__ import annotations

import numpy as np
import geopandas as gpd
import pandas as pd
from scipy.spatial import Voronoi
from shapely import make_valid
from shapely.geometry import Polygon

import common as c

# Alaska + Hawaii excluded from the continental Voronoi (their own beat in the
# plan; AK also crosses the antimeridian and breaks the dissolve).
NONCONTINENTAL_FIPS = {"02", "15"}


def voronoi_finite_polygons(points, radius=60.0):
    """Voronoi cells, clipping unbounded regions to a large bounding box.

    Standard recipe: reflect far vertices along their ridge so open cells close.
    radius (degrees) just needs to exceed the US extent; we clip to US after.
    """
    vor = Voronoi(points)
    new_regions, new_vertices = [], vor.vertices.tolist()
    center = vor.points.mean(axis=0)

    ridges = {}
    for (p1, p2), (v1, v2) in zip(vor.ridge_points, vor.ridge_vertices):
        ridges.setdefault(p1, []).append((p2, v1, v2))
        ridges.setdefault(p2, []).append((p1, v1, v2))

    for p1, region_idx in enumerate(vor.point_region):
        vertices = vor.regions[region_idx]
        if all(v >= 0 for v in vertices) and vertices:
            new_regions.append(vertices)
            continue
        ridge_list = ridges.get(p1, [])
        new_region = [v for v in vertices if v >= 0]
        for p2, v1, v2 in ridge_list:
            if v2 < 0:
                v1, v2 = v2, v1
            if v1 >= 0:
                continue
            t = vor.points[p2] - vor.points[p1]
            t /= np.linalg.norm(t)
            n = np.array([-t[1], t[0]])
            midpoint = vor.points[[p1, p2]].mean(axis=0)
            direction = np.sign(np.dot(midpoint - center, n)) * n
            far_point = vor.vertices[v2] + direction * radius
            new_region.append(len(new_vertices))
            new_vertices.append(far_point.tolist())
        # order vertices counter-clockwise
        vs = np.array([new_vertices[v] for v in new_region])
        angles = np.arctan2(vs[:, 1] - center[1], vs[:, 0] - center[0])
        new_region = [v for _, v in sorted(zip(angles, new_region))]
        new_regions.append(new_region)
    return new_regions, np.array(new_vertices)


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("04_voronoi")

    stad = c.stadiums()
    teams = list(stad.keys())
    pts = np.array([[stad[t]["lng"], stad[t]["lat"]] for t in teams])

    regions_v, vertices = voronoi_finite_polygons(pts)
    cells = [Polygon(vertices[r]) for r in regions_v]
    vor_gdf = gpd.GeoDataFrame({"team": teams, "geometry": cells}, crs="EPSG:4326")

    # Clip to the continental US land outline (dissolve of lower-48 counties).
    regions = c.load_regions()
    us = regions[regions["country"] == "US"].copy()
    cont = us[~us["id"].apply(lambda i: c.state_fips(i) in NONCONTINENTAL_FIPS)].copy()
    cont["geometry"] = cont.geometry.apply(make_valid)
    us_outline = make_valid(cont.dissolve().geometry.iloc[0])
    vor_gdf["geometry"] = vor_gdf.geometry.apply(make_valid).intersection(us_outline)
    vor_gdf = vor_gdf[~vor_gdf.geometry.is_empty]

    # Assign each US region centroid to a cell, tally fan counts per cell.
    centroids = c.load_centroids()
    us_cent = centroids[centroids["country"] == "US"].copy()
    joined = gpd.sjoin(us_cent, vor_gdf.rename(columns={"team": "cell_team"}),
                       how="inner", predicate="within")

    rows = []
    for cell_team, grp in joined.groupby("cell_team"):
        tally: dict[str, int] = {}
        for d in grp["a_counts"]:
            for t, n in d.items():
                tally[t] = tally.get(t, 0) + n
        total = sum(tally.values())
        correct = tally.get(cell_team, 0)
        rows.append({
            "cell_team": cell_team,
            "total_fans_in_cell": total,
            "own_team_fans": correct,
            "accuracy": round(correct / total, 4) if total else None,
            "top_actual_team": max(tally, key=tally.get) if tally else None,
        })
    conf = pd.DataFrame(rows).sort_values("accuracy", ascending=False)
    conf.to_csv(c.METRICS / "voronoi_confusion.csv", index=False)

    overall = conf["own_team_fans"].sum() / conf["total_fans_in_cell"].sum()
    log.info("overall Voronoi accuracy (fans in own nearest-stadium cell): %.3f", overall)
    log.info("best cells: %s", list(conf.head(3)[["cell_team", "accuracy"]]
                                    .itertuples(index=False, name=None)))
    log.info("worst cells: %s", list(conf.tail(3)[["cell_team", "accuracy"]]
                                     .itertuples(index=False, name=None)))

    # Attach accuracy back onto the cells for the map layer.
    vor_gdf = vor_gdf.merge(conf, left_on="team", right_on="cell_team", how="left")
    c.write_geojson(vor_gdf, c.GEOJSON / "voronoi_stadiums.geojson", log)


if __name__ == "__main__":
    main()
