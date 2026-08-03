"""13 — Export data for the walkthrough app.

Copies the analysis GeoJSON layers into public/data/ (served by the Vite app at
/data/*) and writes a compact public/data/story.json with the headline numbers,
leaderboards, and series each walkthrough chapter needs. Re-runnable; depends on
tasks 02-07 + 11 having produced their metrics, and the geojson layers existing.
"""
from __future__ import annotations

import json
import shutil

import pandas as pd

import common as c

GEO_LAYERS = ["voronoi_stadiums.geojson", "country_dominant.geojson",
              "rust_belt_metros.geojson", "lisa_clusters.geojson"]


def _csv(name):
    p = c.METRICS / name
    return pd.read_csv(p) if p.exists() else None


def _read_json(path):
    return json.load(open(path)) if path.exists() else None


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("13_story_export")

    # 1) Copy geojson layers into public/data/ so the app can fetch them.
    for name in GEO_LAYERS:
        src = c.GEOJSON / name
        if src.exists():
            shutil.copyfile(src, c.PUBLIC_DATA / name)
            log.info("copied %s -> public/data/", name)
        else:
            log.warning("missing %s (run its task first)", name)

    totals = c.load_totals()
    meta = totals["meta"]
    val = json.load(open(c.METRICS / "validation.json"))
    spike = json.load(open(c.METRICS / "packers_spike_summary.json"))

    pk = _csv("packers_daily_share.csv")
    prespike = _csv("leaderboard_prespike.csv")
    full = _csv("leaderboard_full.csv")
    diaspora = _csv("diaspora_index.csv")
    moran = _csv("morans_i_per_team.csv")
    dist = _csv("distance_decay_summary.csv")
    intl = _csv("international_top_teams.csv")
    vor = _csv("voronoi_confusion.csv")
    rust = _csv("rust_belt_in_sun_belt.csv")

    def recs(df, cols, n=None):
        d = df[cols]
        if n:
            d = d.head(n)
        return d.to_dict(orient="records")

    story = {
        "headline": {
            "total_rows": meta["total_rows"],
            "valid_rows": meta["valid_rows"],
            "on_map": val["checks"]["unjoined_aggregate_gap"]["on_map"],
            "regions": meta["unique_regions"],
            "countries_50": int((intl["total"] >= 50).sum()) if intl is not None else None,
            "recovered_us": meta.get("recovered_us"),
            "packers_full_share": spike["packers_full_share"],
            "packers_prespike_share": spike["packers_prespike_share"],
        },
        "spike": {
            "series": [{"date": r["date"][5:], "share": round(r["share"], 4)}
                       for _, r in pk.iterrows()] if pk is not None else [],
            "spike_days": [d[5:] for d in spike["packers_spike_days"]],
        },
        "prespike_leaderboard": recs(prespike, ["team", "share", "count"], 10)
        if prespike is not None else [],
        "full_leaderboard": recs(full, ["team", "share", "count"], 10)
        if full is not None else [],
        "diaspora": recs(diaspora.assign(
            pct=diaspora["diaspora_pct_global"]),
            ["team", "home_state", "pct", "diaspora_pct_us", "global_fans"])
        if diaspora is not None else [],
        "moran": recs(moran, ["team", "moran_i", "p_sim", "n_fans_us"])
        if moran is not None else [],
        "distance": recs(dist.sort_values("wmedian_km_us"),
                         ["team", "wmedian_km_us", "pct_within_100km_us"])
        if dist is not None else [],
        "international": recs(intl, ["country", "total", "top_team", "top_count",
                                    "top_share", "second_team"], 20)
        if intl is not None else [],
        "voronoi": {
            "overall": round(vor["own_team_fans"].sum() / vor["total_fans_in_cell"].sum(), 4)
            if vor is not None else None,
            "cells": recs(vor.sort_values("accuracy", ascending=False),
                          ["cell_team", "label", "accuracy", "total_fans_in_cell", "top_actual_team"])
            if vor is not None else [],
        },
        "rust": _rust_highlights(rust),
        "lisa": _read_json(c.METRICS / "lisa_summary.json"),
    }

    out = c.PUBLIC_DATA / "story.json"
    with open(out, "w") as f:
        json.dump(story, f, indent=2)
    log.info("wrote %s", out.relative_to(c.REPO_ROOT))


def _rust_highlights(rust):
    if rust is None:
        return {}
    df = rust[rust.iloc[:, 0] != "_col_total"].copy()
    df = df.rename(columns={df.columns[0]: "team"})
    metros = [c0 for c0 in df.columns if c0 not in ("team", "_row_total")]
    col_totals = {m: int(df[m].sum()) for m in metros}
    team_totals = df.set_index("team")["_row_total"].astype(int).to_dict()
    return {
        "metros": metros,
        "metro_totals": col_totals,
        "team_totals": team_totals,
        "matrix": df.set_index("team")[metros].astype(int).to_dict(orient="index"),
    }


if __name__ == "__main__":
    main()
