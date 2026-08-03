"""14 — Local Moran's I (LISA) cluster map data.

Global Moran's I (task 05) is one number per team; the *map* of spatial
autocorrelation is the LISA cluster map — each region classified as a
High-High hotspot, Low-Low coldspot, or spatial outlier (High-Low / Low-High)
for a given team's fan counts. Computed for a curated set of narratively
interesting teams and emitted as centroid points (significant regions only)
for the walkthrough's Moran's I chapter.
"""
from __future__ import annotations

import warnings

import geopandas as gpd

import common as c

# Teams the video talks about, spanning clustered (Bills, Steelers) to
# dispersed (Cowboys, Chiefs). First entry is the app's default.
LISA_TEAMS = [
    "Buffalo Bills", "Green Bay Packers", "Pittsburgh Steelers",
    "Seattle Seahawks", "Dallas Cowboys", "Philadelphia Eagles",
    "Kansas City Chiefs", "San Francisco 49ers",
]
# 1=HH, 2=LH, 3=LL, 4=HL  (esda Moran_Local quadrant codes)
QUAD = {1: "HH", 2: "LH", 3: "LL", 4: "HL"}
P = 0.05


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("14_local_moran")

    from libpysal.weights import Queen
    from esda.moran import Moran_Local

    regions = c.load_regions()
    centroids = c.load_centroids()
    us = regions[regions["country"] == "US"].copy().reset_index(drop=True)
    cent_by_id = {str(r["id"]): r.geometry for _, r in centroids.iterrows()}

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        w = Queen.from_dataframe(us, use_index=False)
    w.transform = "r"

    feats = []
    summary = {}
    for team in LISA_TEAMS:
        counts = c.team_counts_per_region(us, team).to_numpy(dtype=float)
        if counts.sum() < 50:
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            lisa = Moran_Local(counts, w, permutations=999, seed=42)
        n_sig = 0
        for i, row in us.iterrows():
            if lisa.p_sim[i] >= P:
                continue
            cluster = QUAD[lisa.q[i]]
            # Drop Low-Low: with zero-heavy count data, "0 fans surrounded by 0
            # fans" is trivially significant across the whole country and just
            # paints everywhere the team is absent. The fan story is the
            # hotspots (HH) and outliers (HL/LH).
            if cluster == "LL":
                continue
            geom = cent_by_id.get(str(row["id"]))
            if geom is None:
                continue
            n_sig += 1
            feats.append({
                "team": team, "cluster": cluster, "region": row["region"],
                "id": row["id"], "count": int(counts[i]), "geometry": geom,
            })
        summary[team] = n_sig
        log.info("%-22s significant regions: %d", team, n_sig)

    gdf = gpd.GeoDataFrame(feats, geometry="geometry", crs="EPSG:4326")
    c.write_geojson(gdf, c.GEOJSON / "lisa_clusters.geojson", log)
    c.write_json({"teams": LISA_TEAMS, "significant": summary},
                 c.METRICS / "lisa_summary.json", log)


if __name__ == "__main__":
    main()
