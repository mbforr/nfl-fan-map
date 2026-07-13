"""10 — Demographics join (FILE-GATED; file-based, NOT the Census API).

Joins user-supplied demographic files dropped in analysis/data/census/ onto the
fan aggregates, by state. Two optional inputs (either/both):

  population_state.csv   state key (`state` 2-letter OR `state_fips`) + `population`
                         -> fans-per-capita by state (corrects raw counts).
  migration_flows.csv    `origin_state`, `dest_state`, `flow` (2-letter states)
                         -> Rust-Belt->Sun-Belt corridors + origin->dest line layer.

Column names are auto-detected where possible. If no files are present, logs the
expected schema and exits 0.
"""
from __future__ import annotations

import geopandas as gpd
import pandas as pd
from shapely.geometry import LineString

import common as c
import lookups as lk

# Rust-Belt origin states = home states of the rust-belt teams.
RUST_BELT_STATES = sorted({lk.TEAM_HOME_STATE[t] for t in lk.RUST_BELT_TEAMS})
# Sun-Belt destination states = states of the sun-belt metros.
SUN_BELT_STATES = sorted({lk.FIPS_TO_STATE[f[:2]] for f in lk.SUN_BELT_METRO_FIPS.values()})


def _norm_state_col(df: pd.DataFrame) -> pd.Series:
    """Return a 2-letter state series from whatever key the file provides."""
    if "state" in df.columns and df["state"].astype(str).str.len().le(2).all():
        return df["state"].astype(str).str.upper()
    for col in ("state_fips", "fips", "STATEFP"):
        if col in df.columns:
            return df[col].astype(str).str.zfill(2).map(lk.FIPS_TO_STATE)
    if "state" in df.columns:  # full names not supported; pass through upper
        return df["state"].astype(str).str.upper()
    raise ValueError("no recognizable state column (state / state_fips)")


def state_fan_totals(regions) -> dict[str, int]:
    us = regions[regions["country"] == "US"]
    by_state = c.rollup_counts_by(
        us, lambda row: lk.FIPS_TO_STATE.get(c.state_fips(row["id"])))
    return {s: int(sum(d.values())) for s, d in by_state.items() if s}


def state_centroids(centroids) -> dict[str, tuple[float, float]]:
    us = centroids[centroids["country"] == "US"].copy()
    us["state"] = us["id"].apply(lambda i: lk.FIPS_TO_STATE.get(c.state_fips(i)))
    out = {}
    for st, g in us.dropna(subset=["state"]).groupby("state"):
        out[st] = (float(g.geometry.x.mean()), float(g.geometry.y.mean()))
    return out


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("10_demographics_join")

    pop_path = c.CENSUS_DIR / "population_state.csv"
    mig_path = c.CENSUS_DIR / "migration_flows.csv"
    if not pop_path.exists() and not mig_path.exists():
        log.info("no files in %s — skipping (task file-gated).", c.CENSUS_DIR)
        log.info("expected: population_state.csv (state|state_fips + population), "
                 "migration_flows.csv (origin_state,dest_state,flow)")
        return

    regions = c.load_regions()
    fans = state_fan_totals(regions)

    # --- Fans per capita ---
    if pop_path.exists():
        pop = pd.read_csv(pop_path)
        pop["state"] = _norm_state_col(pop)
        pop = pop.dropna(subset=["state"])
        pop["fans"] = pop["state"].map(fans).fillna(0).astype(int)
        pop["fans_per_100k"] = (pop["fans"] / pop["population"] * 1e5).round(2)
        pop.sort_values("fans_per_100k", ascending=False).to_csv(
            c.METRICS / "fans_per_capita.csv", index=False)
        log.info("wrote metrics/fans_per_capita.csv (%d states)", len(pop))
    else:
        log.info("no population_state.csv — skipping fans-per-capita.")

    # --- Migration corridors ---
    if mig_path.exists():
        mig = pd.read_csv(mig_path)
        need = {"origin_state", "dest_state", "flow"}
        if need - set(mig.columns):
            log.warning("migration_flows.csv needs %s — skipping corridors.", sorted(need))
        else:
            mig["origin_state"] = mig["origin_state"].astype(str).str.upper()
            mig["dest_state"] = mig["dest_state"].astype(str).str.upper()
            corr = mig[mig["origin_state"].isin(RUST_BELT_STATES) &
                       mig["dest_state"].isin(SUN_BELT_STATES)].copy()
            corr.sort_values("flow", ascending=False).to_csv(
                c.METRICS / "migration_flows.csv", index=False)
            log.info("wrote metrics/migration_flows.csv (%d rust->sun corridors)", len(corr))

            cent = state_centroids(c.load_centroids())
            rows = []
            for r in corr.itertuples(index=False):
                o, d = cent.get(r.origin_state), cent.get(r.dest_state)
                if o and d:
                    rows.append({"origin_state": r.origin_state,
                                 "dest_state": r.dest_state, "flow": r.flow,
                                 "geometry": LineString([o, d])})
            if rows:
                gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
                c.write_geojson(gdf, c.GEOJSON / "migration_flows.geojson", log)
    else:
        log.info("no migration_flows.csv — skipping corridors.")


if __name__ == "__main__":
    main()
