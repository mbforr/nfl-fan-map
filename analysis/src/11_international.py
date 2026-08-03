"""11 — International cut: top team + fan diversity per country.

Aggregates a_counts by the `country` property across ALL features (CA/MX/DE/AU/GB
are sub-national in the outputs, so filtering level=="country" would miss them —
that's how we recover e.g. Bills-in-Canada). Reports, for every country with
>=50 responses, the top team, its share, and a normalized-entropy diversity index.
"""
from __future__ import annotations

import math

import geopandas as gpd
import pandas as pd
from shapely import make_valid

import common as c

MIN_RESPONSES = 50
N_TEAMS = 32
# Country polygons for the world choropleth. countries_world.geojson excludes
# US/CA/MX (the pipeline handles those as sub-national tiers), so CA and MX are
# dissolved from their province/state files; the US is intentionally excluded.
WORLD = c.RAW_DATA / "countries_world.geojson"
CA_SRC = c.RAW_DATA / "provinces_ca.geojson"
MX_SRC = c.RAW_DATA / "states_mx.geojson"
CTY_SIMPLIFY = 0.03   # deg — trims the detailed source polygons for the web map


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("11_international")

    regions = c.load_regions()
    by_country = c.rollup_counts_by(regions, lambda row: row["country"])

    rows = []
    for country, counts in by_country.items():
        total = sum(counts.values())
        if total == 0:
            continue
        ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
        top_team, top_n = ranked[0]
        second = ranked[1] if len(ranked) > 1 else (None, 0)
        shares = [n / total for n in counts.values()]
        shannon = -sum(p * math.log(p) for p in shares if p > 0)
        rows.append({
            "country": country,
            "total": total,
            "n_teams": len(counts),
            "top_team": top_team,
            "top_count": top_n,
            "top_share": round(top_n / total, 4),
            "second_team": second[0],
            "second_count": second[1],
            "diversity_norm": round(shannon / math.log(N_TEAMS), 4),  # 0..1, higher=more diverse
            "hhi": round(sum(p * p for p in shares), 4),              # concentration
        })

    df = pd.DataFrame(rows).sort_values("total", ascending=False)
    df.to_csv(c.METRICS / "international_all_countries.csv", index=False)

    big = df[df["total"] >= MIN_RESPONSES].copy()
    big.to_csv(c.METRICS / "international_top_teams.csv", index=False)
    log.info("countries: %d total, %d with >=%d responses", len(df), len(big), MIN_RESPONSES)

    # Narrative spot-checks.
    def row(cc):
        r = df[df["country"] == cc]
        return r.iloc[0] if len(r) else None
    for cc in ("CA", "DE", "AU", "MX", "GB"):
        r = row(cc)
        if r is not None:
            log.info("%s: %d resp, top=%s (%d, %.1f%%)", cc, r["total"],
                     r["top_team"], r["top_count"], 100 * r["top_share"])

    # ----- Country-dominant polygon layer for Mapbox -----
    # Every country with data gets a real country polygon (so CA/MX/GB/AU/DE
    # show up, not just the "simple" countries). US is excluded on purpose.
    world = gpd.read_file(WORLD)[["ISO_A2", "NAME", "geometry"]].rename(
        columns={"ISO_A2": "country", "NAME": "region"})
    # CA and MX aren't in countries_world → dissolve their sub-national files.
    ca = gpd.read_file(CA_SRC).dissolve().assign(country="CA", region="Canada")[
        ["country", "region", "geometry"]]
    mx = gpd.read_file(MX_SRC).dissolve().assign(country="MX", region="Mexico")[
        ["country", "region", "geometry"]]
    polys = pd.concat([world, ca, mx], ignore_index=True)
    polys = gpd.GeoDataFrame(polys, geometry="geometry", crs="EPSG:4326")

    rank = {cc: i + 1 for i, cc in enumerate(df["country"])}
    info = df.set_index("country")
    keep = []
    for _, f in polys.iterrows():
        cc = f["country"]
        if cc == "US" or cc not in by_country:
            continue
        counts = by_country[cc]
        total = sum(counts.values())
        if total == 0:
            continue
        dom = max(counts, key=counts.get)
        geom = make_valid(make_valid(f.geometry).simplify(CTY_SIMPLIFY)).buffer(0)
        keep.append({
            "region": f["region"], "country": cc, "level": "country",
            "total": total, "a_total": total, "a_counts": counts,
            "a_dominant": dom, "a_dominant_pct": round(counts[dom] / total, 4),
            "rank_by_total": rank.get(cc),
            "diversity_norm": float(info.loc[cc, "diversity_norm"]) if cc in info.index else None,
            "geometry": geom,
        })
    country_polys = gpd.GeoDataFrame(keep, geometry="geometry", crs="EPSG:4326")
    c.write_geojson(country_polys, c.GEOJSON / "country_dominant.geojson", log)
    log.info("country choropleth: %d countries (US excluded); CA/MX/GB/AU/DE included",
             len(country_polys))


if __name__ == "__main__":
    main()
