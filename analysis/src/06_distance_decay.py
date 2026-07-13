"""06 — Distance-decay: how far each team's fans live from its stadium.

Great-circle distance from every region centroid (with fans) to each team's
stadium, weighted by fan count. Produces a long-form region-team table (ready
for weighted histograms/charts later) plus per-team summary stats. US-only
summary matches the video's "sharp vs flat decay" framing; global included too.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import common as c

R_KM = 6371.0


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = np.radians(lat2 - lat1)
    dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R_KM * np.arcsin(np.sqrt(a))


def weighted_percentile(values, weights, q):
    order = np.argsort(values)
    v, wt = np.asarray(values)[order], np.asarray(weights)[order]
    cw = np.cumsum(wt)
    cutoff = q / 100.0 * cw[-1]
    return float(v[np.searchsorted(cw, cutoff)])


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("06_distance_decay")

    stad = c.stadiums()
    centroids = c.load_centroids()
    lat = centroids.geometry.y.to_numpy()
    lon = centroids.geometry.x.to_numpy()

    long_rows = []
    for team, poi in stad.items():
        counts = c.team_counts_per_region(centroids, team).to_numpy()
        mask = counts > 0
        if not mask.any():
            continue
        km = haversine_km(lat[mask], lon[mask], poi["lat"], poi["lng"])
        sub = centroids[mask]
        for kmv, cnt, rid, reg, ctry in zip(
                km, counts[mask], sub["id"], sub["region"], sub["country"]):
            long_rows.append({"team": team, "region_id": rid, "region": reg,
                              "country": ctry, "km": round(float(kmv), 1),
                              "count": int(cnt)})

    long_df = pd.DataFrame(long_rows)
    long_df.to_csv(c.METRICS / "distance_decay.csv", index=False)
    log.info("wrote metrics/distance_decay.csv (%d region-team rows)", len(long_df))

    # Per-team summary (US-only and global).
    def summarise(df, tag):
        out = []
        for team, g in df.groupby("team"):
            km, wt = g["km"].to_numpy(), g["count"].to_numpy()
            n = int(wt.sum())
            out.append({
                "team": team, f"n_fans_{tag}": n,
                f"wmean_km_{tag}": round(float(np.average(km, weights=wt)), 1),
                f"wmedian_km_{tag}": round(weighted_percentile(km, wt, 50), 1),
                f"pct_within_100km_{tag}": round(wt[km <= 100].sum() / n, 4),
                f"pct_within_300km_{tag}": round(wt[km <= 300].sum() / n, 4),
            })
        return pd.DataFrame(out).set_index("team")

    us = summarise(long_df[long_df["country"] == "US"], "us")
    gl = summarise(long_df, "global")
    summary = us.join(gl, how="outer").reset_index().sort_values("wmedian_km_us")
    summary.to_csv(c.METRICS / "distance_decay_summary.csv", index=False)

    log.info("most local (US median km): %s", list(
        summary.head(3)[["team", "wmedian_km_us"]].itertuples(index=False, name=None)))
    log.info("most national (US median km): %s", list(
        summary.tail(3)[["team", "wmedian_km_us"]].itertuples(index=False, name=None)))


if __name__ == "__main__":
    main()
