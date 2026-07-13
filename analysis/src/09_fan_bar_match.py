"""09 — Fan-bar match analysis (FILE-GATED, depends on task 08 output).

For each supplied fan bar, find the US region polygon that contains it and look
up how many of that team's fans live in that region. Match = the team has a
meaningful fan presence (>= MATCH_MIN fans) in the bar's region. The reveal:
the survey "found" the bars without being told they exist (Bills/Steelers >70%).

Skips with a notice if task 08 produced no consolidated bars.
"""
from __future__ import annotations

import geopandas as gpd
import pandas as pd

import common as c

MATCH_MIN = 3    # a team "has fans" in a region if count >= this


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("09_fan_bar_match")

    bars_csv = c.METRICS / "fan_bars_all.csv"
    if not bars_csv.exists():
        log.info("no %s — run task 08 with fan-bar inputs first. Skipping.",
                 bars_csv.name)
        return

    bars = pd.read_csv(bars_csv)
    bars_gdf = gpd.GeoDataFrame(bars,
                                geometry=gpd.points_from_xy(bars["lon"], bars["lat"]),
                                crs="EPSG:4326")

    regions = c.load_regions()
    us = regions[regions["country"] == "US"][["region", "id", "a_counts", "geometry"]]
    joined = gpd.sjoin(bars_gdf, us, how="left", predicate="within")

    def team_fans(row):
        counts = row["a_counts"]
        return counts.get(row["team"], 0) if isinstance(counts, dict) else 0

    joined["team_fans_in_region"] = joined.apply(team_fans, axis=1)
    joined["matched"] = joined["team_fans_in_region"] >= MATCH_MIN
    joined.drop(columns=["geometry", "a_counts"], errors="ignore").to_csv(
        c.METRICS / "fan_bar_match_detail.csv", index=False)

    rate = (joined.groupby("team")
            .agg(bars=("bar_name", "count"),
                 matched=("matched", "sum"),
                 fans_total=("team_fans_in_region", "sum"))
            .reset_index())
    rate["match_rate"] = (rate["matched"] / rate["bars"]).round(4)
    rate.sort_values("match_rate", ascending=False).to_csv(
        c.METRICS / "fan_bar_match.csv", index=False)
    log.info("wrote metrics/fan_bar_match.csv")
    for r in rate.itertuples(index=False):
        log.info("  %s: %d/%d bars matched (%.0f%%)",
                 r.team, r.matched, r.bars, 100 * r.match_rate)


if __name__ == "__main__":
    main()
