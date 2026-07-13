"""05 — Moran's I per team over US regions (spatial clustering of each fanbase).

Queen-contiguity weights over the US county/region polygons; Moran's I on each
team's per-region count vector. High I = spatially clustered fanbase (local),
low/near-zero = dispersed (national). Bonferroni note for 32 simultaneous tests.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

import common as c

MIN_FANS = 50          # skip teams with too few US fans to be meaningful
PERMUTATIONS = 999
N_TESTS = 32           # for Bonferroni


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("05_morans_i")

    from libpysal.weights import Queen
    from esda.moran import Moran

    regions = c.load_regions()
    us = regions[regions["country"] == "US"].copy().reset_index(drop=True)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")           # island / disconnected-component warnings
        w = Queen.from_dataframe(us, use_index=False)
    w.transform = "r"
    log.info("weights: %d units, %d islands", w.n, len(w.islands))

    bonf = 0.05 / N_TESTS
    rows = []
    for team in c.team_names():
        counts = c.team_counts_per_region(us, team).to_numpy(dtype=float)
        n_fans = int(counts.sum())
        if n_fans < MIN_FANS:
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            m = Moran(counts, w, permutations=PERMUTATIONS)
        rows.append({
            "team": team,
            "moran_i": round(m.I, 4),
            "p_sim": round(m.p_sim, 4),
            "z_sim": round(m.z_sim, 3),
            "n_fans_us": n_fans,
            "sig_0_05": m.p_sim < 0.05,
            "sig_bonferroni": m.p_sim < bonf,
        })

    df = pd.DataFrame(rows).sort_values("moran_i", ascending=False)
    df.to_csv(c.METRICS / "morans_i_per_team.csv", index=False)
    log.info("wrote metrics/morans_i_per_team.csv (%d teams)", len(df))

    n_sig = int(df["sig_0_05"].sum())
    log.info("teams tested: %d | p<0.05: %d | p<Bonferroni(%.4g): %d",
             len(df), n_sig, bonf, int(df["sig_bonferroni"].sum()))
    log.info("most clustered: %s", list(df.head(3)[["team", "moran_i"]]
                                        .itertuples(index=False, name=None)))
    log.info("most dispersed: %s", list(df.tail(3)[["team", "moran_i"]]
                                        .itertuples(index=False, name=None)))
    if n_sig < 25:
        log.warning("gate: expected >=25 teams significant at p<0.05, got %d", n_sig)


if __name__ == "__main__":
    main()
