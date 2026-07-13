"""Shared IO + helpers for the analysis layer.

Every task script imports from here. Read-only against public/data/*; all writes
go to analysis/output/. Nothing here mutates the JS pipeline's files.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

# ---------------------------------------------------------------------------
# Paths.  src/common.py -> parents[0]=src, [1]=analysis, [2]=repo root.
# ---------------------------------------------------------------------------
SRC = Path(__file__).resolve().parent
ANALYSIS = SRC.parent
REPO_ROOT = ANALYSIS.parent

PUBLIC_DATA = REPO_ROOT / "public" / "data"
RAW_DATA = REPO_ROOT / "data"                 # responses.csv (timestamps)
INPUT_DATA = ANALYSIS / "data"                # user-supplied offline files
CENSUS_DIR = INPUT_DATA / "census"
FAN_BARS_DIR = INPUT_DATA / "fan_bars"

OUT = ANALYSIS / "output"
METRICS = OUT / "metrics"
GEOJSON = OUT / "geojson"

RESPONSES_CSV = RAW_DATA / "responses.csv"

# Survey column names (must match the form export; same as scripts/preprocess.js).
COL_TS = "Timestamp"
COL_TEAM = "Which NFL team are you a fan of?"
COL_COUNTRY = "Country"
COL_REGION = "State, province, or region"
COL_CITY = "City or town"
COL_ZIP = "Postal Code"
TS_FORMAT = "%m/%d/%Y %H:%M:%S"

# Sentinels the pipeline uses in a_dominant.
CONTESTED = "__contested__"


# ---------------------------------------------------------------------------
# Logging + CLI (each script writes a .log alongside its output; --force gates
# overwrites of existing outputs).
# ---------------------------------------------------------------------------
def get_args(description: str) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=description)
    p.add_argument("--force", action="store_true",
                   help="overwrite existing outputs")
    p.add_argument("--validate", action="store_true",
                   help="re-check gates without recomputing (task 12)")
    return p.parse_args()


def setup_logging(script_name: str) -> logging.Logger:
    METRICS.mkdir(parents=True, exist_ok=True)
    GEOJSON.mkdir(parents=True, exist_ok=True)
    log_path = OUT / f"{script_name}.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(log_path, mode="w"),
                  logging.StreamHandler(sys.stdout)],
    )
    return logging.getLogger(script_name)


def guard_output(path: Path, force: bool, log: logging.Logger) -> bool:
    """Return True if we should (re)write `path`. Restartable-by-default."""
    if path.exists() and not force:
        log.info("skip (exists, use --force): %s", path.name)
        return False
    return True


# ---------------------------------------------------------------------------
# a_counts is a nested object in the file but geopandas/fiona coerces nested
# JSON props to strings on read -> parse defensively everywhere.
# ---------------------------------------------------------------------------
def parse_counts(x) -> dict:
    if isinstance(x, dict):
        return x
    if isinstance(x, str) and x:
        try:
            return json.loads(x)
        except json.JSONDecodeError:
            return {}
    return {}


# ---------------------------------------------------------------------------
# Loaders (memoised-ish: cheap enough to reload; callers hold the frames).
# ---------------------------------------------------------------------------
def load_regions() -> gpd.GeoDataFrame:
    gdf = gpd.read_file(PUBLIC_DATA / "regions_polygons.geojson")
    gdf["a_counts"] = gdf["a_counts"].apply(parse_counts)
    return gdf


def load_centroids() -> gpd.GeoDataFrame:
    gdf = gpd.read_file(PUBLIC_DATA / "regions_centroids.geojson")
    gdf["a_counts"] = gdf["a_counts"].apply(parse_counts)
    return gdf


def load_teams() -> list[dict]:
    with open(PUBLIC_DATA / "category_a.json") as f:
        return json.load(f)


def load_totals() -> dict:
    with open(PUBLIC_DATA / "totals.json") as f:
        return json.load(f)


def stadiums() -> dict[str, dict]:
    """short_name -> {name, lat, lng}. All 32 teams have a non-null poi."""
    return {t["short_name"]: t["poi"] for t in load_teams() if t.get("poi")}


def team_names() -> list[str]:
    return [t["short_name"] for t in load_teams()]


def load_responses() -> pd.DataFrame:
    """Raw survey rows with parsed timestamps (for the spike/leaderboard basis)."""
    df = pd.read_csv(RESPONSES_CSV)
    df["timestamp"] = pd.to_datetime(df[COL_TS], format=TS_FORMAT, errors="coerce")
    df["date"] = df["timestamp"].dt.date
    df["team"] = df[COL_TEAM]
    return df


# ---------------------------------------------------------------------------
# Aggregation helpers used across tasks.
# ---------------------------------------------------------------------------
def team_counts_per_region(regions: gpd.GeoDataFrame, team: str) -> pd.Series:
    return regions["a_counts"].apply(lambda d: d.get(team, 0))


def state_fips(region_id) -> str | None:
    """First 2 chars of a 5-digit county FIPS id -> state FIPS. US only."""
    if region_id is None:
        return None
    s = str(region_id)
    return s[:2] if len(s) >= 2 and s[:2].isdigit() else None


def rollup_counts_by(regions: gpd.GeoDataFrame, key_fn) -> dict[str, dict]:
    """Group features by key_fn(row) and sum their a_counts dicts.

    Used for county->state (key = state_fips) and any->country (key = country).
    Returns {key: {team: count}}.
    """
    out: dict[str, dict] = {}
    for _, row in regions.iterrows():
        key = key_fn(row)
        if key is None:
            continue
        bucket = out.setdefault(key, {})
        for team, n in row["a_counts"].items():
            bucket[team] = bucket.get(team, 0) + n
    return out


def write_json(obj, path: Path, log: logging.Logger) -> None:
    with open(path, "w") as f:
        json.dump(obj, f, indent=2)
    log.info("wrote %s", path.relative_to(REPO_ROOT))


def write_geojson(gdf: gpd.GeoDataFrame, path: Path, log: logging.Logger) -> None:
    # Serialise dict columns (a_counts) to strings so GeoJSON stays valid.
    out = gdf.copy()
    for col in out.columns:
        if col == out.geometry.name:
            continue
        if out[col].apply(lambda v: isinstance(v, (dict, list))).any():
            out[col] = out[col].apply(
                lambda v: json.dumps(v) if isinstance(v, (dict, list)) else v)
    if path.exists():
        path.unlink()
    out.to_file(path, driver="GeoJSON")
    log.info("wrote %s (%d features)", path.relative_to(REPO_ROOT), len(out))
