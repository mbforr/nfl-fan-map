"""07 — Rust Belt diaspora cross-tab (Problem six).

Rust-belt teams x Sun-Belt metros, using exact county-FIPS (`id`) joins instead
of fragile county-name substring matching. Emits the matrix CSV plus a metro
point layer (centroid of each metro county) carrying the rust-belt fan counts
for the later Mapbox overlay against fan-bar locations.
"""
from __future__ import annotations

import geopandas as gpd
import pandas as pd

import common as c
import lookups as lk


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("07_rust_belt")

    regions = c.load_regions()
    centroids = c.load_centroids()
    by_id = regions.set_index(regions["id"].astype(str))

    metros = lk.SUN_BELT_METRO_FIPS
    matrix = pd.DataFrame(0, index=lk.RUST_BELT_TEAMS, columns=list(metros))

    point_rows = []
    for metro, fips in metros.items():
        if fips not in by_id.index:
            log.warning("metro %s FIPS %s not found in regions", metro, fips)
            continue
        feat = by_id.loc[fips]
        counts = feat["a_counts"]
        for team in lk.RUST_BELT_TEAMS:
            matrix.loc[team, metro] = counts.get(team, 0)
        rust_total = int(sum(counts.get(t, 0) for t in lk.RUST_BELT_TEAMS))
        cell_total = int(feat["total"])
        cen = centroids[centroids["id"].astype(str) == fips].geometry.iloc[0]
        point_rows.append({
            "metro": metro, "id": fips, "region": feat["region"],
            "total": cell_total, "rust_belt_fans": rust_total,
            "rust_belt_share": round(rust_total / cell_total, 4) if cell_total else None,
            "dominant": feat["a_dominant"],
            **{t: int(counts.get(t, 0)) for t in lk.RUST_BELT_TEAMS},
            "geometry": cen,
        })

    matrix["_row_total"] = matrix.sum(axis=1)
    matrix.loc["_col_total"] = matrix.sum(axis=0)
    matrix.index.name = "team"
    matrix.to_csv(c.METRICS / "rust_belt_in_sun_belt.csv")
    log.info("wrote metrics/rust_belt_in_sun_belt.csv")

    pts = gpd.GeoDataFrame(point_rows, geometry="geometry", crs="EPSG:4326")
    c.write_geojson(pts, c.GEOJSON / "rust_belt_metros.geojson", log)

    # Narrative spot-checks from the plan.
    def cell(team, metro):
        return int(matrix.loc[team, metro]) if metro in matrix.columns else 0
    log.info("Bills in Charlotte (plan ~14): %d", cell("Buffalo Bills", "Charlotte"))
    log.info("Steelers in Orlando (plan ~9): %d", cell("Pittsburgh Steelers", "Orlando"))
    log.info("Phoenix rust-belt share: %s",
             next((r["rust_belt_share"] for r in point_rows if r["metro"] == "Phoenix"), None))
    log.info("Bears in Austin (plan ~7): %d", cell("Chicago Bears", "Austin"))


if __name__ == "__main__":
    main()
