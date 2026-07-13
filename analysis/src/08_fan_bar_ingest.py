"""08 — Fan-bar ingest (FILE-GATED).

Offline pass: no live scraping. Reads any user-supplied per-team bar lists from
analysis/data/fan_bars/{team}.csv, validates them, and consolidates to a single
CSV + GeoJSON point layer. If no files are present, logs how to supply them and
exits 0 (the pipeline continues).

Expected columns per input CSV: team, bar_name, city, state, lat, lon
(team should match a category_a.json short_name; lat/lon in EPSG:4326).

To add live scraping later, implement a per-team adapter that writes exactly
that CSV shape into analysis/data/fan_bars/, then re-run this script.
"""
from __future__ import annotations

import geopandas as gpd
import pandas as pd

import common as c

REQUIRED = {"team", "bar_name", "city", "state", "lat", "lon"}


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("08_fan_bar_ingest")

    files = sorted(c.FAN_BARS_DIR.glob("*.csv")) if c.FAN_BARS_DIR.exists() else []
    if not files:
        log.info("no fan-bar files in %s — skipping (task file-gated).",
                 c.FAN_BARS_DIR)
        log.info("supply per-team CSVs with columns: %s", sorted(REQUIRED))
        return

    frames = []
    valid_teams = set(c.team_names())
    for f in files:
        df = pd.read_csv(f)
        missing = REQUIRED - set(df.columns)
        if missing:
            log.warning("%s missing columns %s — skipped", f.name, sorted(missing))
            continue
        bad = set(df["team"].unique()) - valid_teams
        if bad:
            log.warning("%s has non-team values: %s", f.name, sorted(bad))
        frames.append(df[list(REQUIRED)])
        log.info("%s: %d bars", f.name, len(df))

    if not frames:
        log.info("no valid fan-bar files — skipping.")
        return

    bars = pd.concat(frames, ignore_index=True).dropna(subset=["lat", "lon"])
    bars.to_csv(c.METRICS / "fan_bars_all.csv", index=False)
    gdf = gpd.GeoDataFrame(bars,
                           geometry=gpd.points_from_xy(bars["lon"], bars["lat"]),
                           crs="EPSG:4326")
    c.write_geojson(gdf, c.GEOJSON / "fan_bars.geojson", log)
    log.info("consolidated %d bars across %d teams",
             len(bars), bars["team"].nunique())


if __name__ == "__main__":
    main()
