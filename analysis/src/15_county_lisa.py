"""15 — County-level Moran's I / LISA for the Fan Density app.

Computes global Moran's I and Local Moran's I (LISA) over US counties for 33
variables: `total` (all responses) plus each of the 32 teams. Emits one compact,
geometry-free JSON that the app joins to `regions_polygons.geojson` by county
FIPS (`properties.id`).

Two decisions worth knowing about, both forced by the data:

1. The county set is PUNCTURED. `regions_polygons.geojson` only contains counties
   that received >=1 response (2,181 of ~3,143). Queen contiguity over that set
   sees holes everywhere -- 37 "islands", 61 components -- and most of those
   "islands" are landlocked (Brownsville TX, Sioux Falls SD). We repair the graph
   with a Queen union KNN(4) hybrid. Neighbours are therefore sometimes
   "nearest responding county", not "shares a border"; that caveat ships in meta.

2. The 32 team variables are EB-adjusted RATES (team count / county total), not
   raw counts. On raw counts the LL class is degenerate -- it swings from 1,443
   counties (Cardinals) to 0 (Seahawks) purely on how many identical zeros sit in
   the permutation distribution -- and raw counts are confounded by response
   volume, so the statistic mostly maps where the survey got answered. The
   Assunção-Reis EB rate removes the volume confound and shrinks unreliable
   small-denominator counties (60% have <=5 responses). `total` has no natural
   denominator, so it uses log1p(count) instead.

This script is independent of tasks 01-14 and does not touch their outputs. In
particular it must NOT be merged into 05_morans_i.py or 13_local_moran.py -- both
feed the published walkthrough.

Writes:
  analysis/output/metrics/county_lisa.json         (gitignored)
  analysis/output/metrics/county_lisa_global.csv   (gitignored, for humans)
  public/data/county_lisa.json                     (tracked, shipped to the app)
"""
from __future__ import annotations

import argparse
import shutil
import sys
from datetime import datetime, timezone

import geopandas as gpd
import numpy as np
import pandas as pd
from esda import fdr
from esda.moran import Moran, Moran_Local, Moran_Local_Rate, Moran_Rate
from libpysal.weights import KNN, Queen, w_union

import common as c

TOTAL_KEY = "total"
TOTAL_LABEL = "All responses"
KNN_K = 4
SEED = 42

# esda quadrants are 1=HH, 2=LH, 3=LL, 4=HL. We ship 1=HH, 2=LL, 3=HL, 4=LH so
# numeric order matches legend order (clusters first, then outliers). Single
# source of truth -- meta.quad_codes below is derived from it.
ESDA_TO_SHIP = {1: 1, 2: 4, 3: 2, 4: 3}
SHIP_CODES = {1: "HH", 2: "LL", 3: "HL", 4: "LH", 0: "ns"}


def get_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--force", action="store_true", help="overwrite existing outputs")
    p.add_argument("--permutations", type=int, default=9999,
                   help="conditional permutations (default 9999; <9999 makes FDR unusable)")
    p.add_argument("--alpha", type=float, default=0.05)
    p.add_argument("--min-n", type=int, default=0,
                   help="restrict the study set to counties with total >= N (robustness check)")
    p.add_argument("--emit-counts", action="store_true",
                   help="also emit a raw-count variant (county_lisa_count.json); see docstring")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Study set + weights
# ---------------------------------------------------------------------------
def load_us(min_n: int, log) -> gpd.GeoDataFrame:
    regions = c.load_regions()
    us = regions[regions["country"] == "US"].copy().reset_index(drop=True)
    if min_n:
        before = len(us)
        us = us[us["total"] >= min_n].copy().reset_index(drop=True)
        log.info("min-n=%d: %d -> %d counties", min_n, before, len(us))

    us["id"] = us["id"].astype(str).str.zfill(5)
    bad = us[~us["id"].str.fullmatch(r"\d{5}")]
    if len(bad):
        log.warning("%d ids are not 5-digit FIPS, e.g. %s", len(bad), bad["id"].head().tolist())
    if us["id"].duplicated().any():
        log.warning("duplicate FIPS ids: %s", us.loc[us["id"].duplicated(), "id"].tolist()[:10])
    log.info("study set: %d US counties, %d responses",
             len(us), int(us["total"].sum()))
    return us


def build_weights(us: gpd.GeoDataFrame, log):
    """Queen contiguity repaired with KNN(4) so the punctured county set connects."""
    queen = Queen.from_dataframe(us, use_index=False, silence_warnings=True)
    q_stats = (queen.n, len(queen.islands), queen.n_components,
               float(np.mean(list(queen.cardinalities.values()))))
    log.info("queen: n=%d islands=%d components=%d mean_neighbors=%.2f", *q_stats)

    # representative_point() stays inside concave counties and avoids the
    # lon/lat centroid warning.
    pts = gpd.GeoDataFrame(geometry=us.geometry.representative_point(), crs=us.crs)
    knn = KNN.from_dataframe(pts, k=KNN_K)

    w = w_union(queen, knn, silence_warnings=True)
    w.transform = "r"
    f_stats = (w.n, len(w.islands), w.n_components,
               float(np.mean(list(w.cardinalities.values()))))
    log.info("queen union knn(%d): n=%d islands=%d components=%d mean_neighbors=%.2f",
             KNN_K, *f_stats)

    if len(w.islands) or w.n_components != 1:
        log.warning("weights graph is still not fully connected "
                    "(islands=%d, components=%d)", len(w.islands), w.n_components)

    meta = {
        "kind": "queen_union_knn", "knn_k": KNN_K, "transform": "r",
        "queen_islands": q_stats[1], "queen_components": q_stats[2],
        "queen_mean_neighbors": round(q_stats[3], 2),
        "final_islands": f_stats[1], "final_components": f_stats[2],
        "final_mean_neighbors": round(f_stats[3], 2),
    }
    return w, meta


# ---------------------------------------------------------------------------
# Per-variable runs
# ---------------------------------------------------------------------------
def _package(key, label, method, ids, mi, lm, n_obs, alpha):
    """Shared assembly: global stats + significant-only {fips: [code, p]}."""
    quads = lm.q
    psim = lm.p_sim
    sig = psim < alpha

    clusters = {}
    counts = {"HH": 0, "LL": 0, "HL": 0, "LH": 0, "ns": 0}
    for i in range(len(ids)):
        if not sig[i]:
            counts["ns"] += 1
            continue
        code = ESDA_TO_SHIP[int(quads[i])]
        counts[SHIP_CODES[code]] += 1
        clusters[ids[i]] = [code, round(float(psim[i]), 4)]

    n = len(ids)
    try:
        fdr_cut = float(fdr(psim, alpha))
    except Exception:  # noqa: BLE001 - esda raises bare on degenerate input
        fdr_cut = alpha / n

    return {
        "key": key,
        "label": label,
        "method": method,
        "moran_i": round(float(mi.I), 4),
        "p_sim": round(float(mi.p_sim), 4),
        "z_sim": round(float(mi.z_sim), 2),
        "sig_bonferroni": bool(mi.p_sim < alpha / 33),
        "n_obs": int(n_obs),
        "fdr_cut": fdr_cut,
        "sidak_cut": 1 - (1 - alpha) ** (1 / n),
        "bonf_cut": alpha / n,
        "counts": counts,
        "clusters": clusters,
    }


def run_total(us, w, ids, args):
    """No natural denominator; log1p tames a 1..694 range with median 4."""
    raw = us["total"].to_numpy(float)
    y = np.log1p(raw)
    mi = Moran(y, w, permutations=args.permutations)
    lm = Moran_Local(y, w, permutations=args.permutations, seed=SEED)
    return _package(TOTAL_KEY, TOTAL_LABEL, "log_count", ids, mi, lm,
                    raw.sum(), args.alpha)


def run_team(team, us, w, ids, b, args):
    """EB-adjusted rate: team count over county total responses."""
    e = c.team_counts_per_region(us, team).to_numpy(float)
    mi = Moran_Rate(e, b, w, adjusted=True, permutations=args.permutations)
    lm = Moran_Local_Rate(e, b, w, adjusted=True,
                          permutations=args.permutations, seed=SEED)
    return _package(team, team, "eb_rate", ids, mi, lm, e.sum(), args.alpha)


def run_team_raw(team, us, w, ids, args):
    """Raw-count variant, only for --emit-counts. Ships a degenerate LL class."""
    y = c.team_counts_per_region(us, team).to_numpy(float)
    mi = Moran(y, w, permutations=args.permutations)
    lm = Moran_Local(y, w, permutations=args.permutations, seed=SEED)
    return _package(team, team, "raw_count", ids, mi, lm, y.sum(), args.alpha)


# ---------------------------------------------------------------------------
# Gates
# ---------------------------------------------------------------------------
def check_gates(payload, log):
    variables = payload["variables"]
    meta = payload["meta"]
    ok = True

    def warn(msg, *a):
        nonlocal ok
        ok = False
        log.warning("GATE: " + msg, *a)

    if meta["weights"]["final_islands"] != 0:
        warn("weights still have %d islands", meta["weights"]["final_islands"])
    if meta["weights"]["final_components"] != 1:
        warn("weights have %d components", meta["weights"]["final_components"])
    if len(variables) != 33:
        warn("expected 33 variables, got %d", len(variables))

    n_lowres = sum(1 for v in variables if v["fdr_cut"] <= 1e-4)
    if n_lowres > 3:
        warn("%d variables have fdr_cut <= 1e-4 — permutation resolution too coarse "
             "for a usable FDR filter (raise --permutations)", n_lowres)

    for v in variables:
        if v["counts"]["LL"] > 800:
            warn("%s has LL=%d (>800) — that only happens on raw counts; "
                 "the EB-rate decision has regressed", v["key"], v["counts"]["LL"])
        if v["counts"]["HH"] < 5:
            log.info("note: %s has only %d HH counties", v["key"], v["counts"]["HH"])
        if not v["sig_bonferroni"]:
            log.info("note: %s global I not significant at Bonferroni", v["key"])

    total_sig = sum(len(v["clusters"]) for v in variables)
    log.info("total significant county-variable pairs: %d", total_sig)
    if not (5000 <= total_sig <= 20000):
        warn("total significant pairs %d outside the expected 5k-20k band", total_sig)

    for v in variables:
        missing = [k for k in v["clusters"] if k not in payload["counties"]]
        if missing:
            warn("%s has %d cluster FIPS absent from counties map", v["key"], len(missing))
            break

    log.info("gates: %s", "PASS" if ok else "see warnings above")
    return ok


# ---------------------------------------------------------------------------
def main() -> int:
    args = get_args()
    log = c.setup_logging("15_county_lisa")
    out_path = c.METRICS / "county_lisa.json"
    if not c.guard_output(out_path, args.force, log):
        return 0

    np.random.seed(SEED)  # Moran/Moran_Rate take no seed arg

    us = load_us(args.min_n, log)
    ids = us["id"].tolist()
    w, w_meta = build_weights(us, log)

    b = us["total"].to_numpy(float)
    teams = c.team_names()
    log.info("running %d variables at %d permutations…", 1 + len(teams), args.permutations)

    variables = [run_total(us, w, ids, args)]
    for team in teams:
        variables.append(run_team(team, us, w, ids, b, args))
        v = variables[-1]
        log.info("  %-24s I=%+.4f z=%6.2f  HH=%3d LL=%3d HL=%3d LH=%3d",
                 v["key"], v["moran_i"], v["z_sim"],
                 v["counts"]["HH"], v["counts"]["LL"],
                 v["counts"]["HL"], v["counts"]["LH"])

    payload = {
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": "public/data/regions_polygons.geojson",
            "n_counties": len(us),
            "join_key": "id",
            "weights": w_meta,
            "permutations": args.permutations,
            "seed": SEED,
            "alpha": args.alpha,
            "min_n": args.min_n,
            "quad_codes": {str(k): v for k, v in SHIP_CODES.items()},
            "caveats": [
                f"Contiguity is built over the {len(us)} counties that received at least "
                "one response, not all ~3,143 US counties; non-responding counties are "
                "absent, so some neighbours are nearest-responding rather than "
                "border-sharing.",
                "Team variables are EB-adjusted shares (team count / county total "
                "responses), not raw counts.",
                "'total' is survey response density, which largely tracks population; "
                "no per-capita normalisation is available.",
            ],
        },
        "counties": dict(zip(us["id"], us["total"].astype(int).tolist())),
        "variables": variables,
    }

    check_gates(payload, log)

    c.write_json(payload, out_path, log, indent=None)
    shutil.copyfile(out_path, c.PUBLIC_DATA / "county_lisa.json")
    log.info("copied county_lisa.json -> public/data/")

    pd.DataFrame([{
        "key": v["key"], "method": v["method"], "moran_i": v["moran_i"],
        "p_sim": v["p_sim"], "z_sim": v["z_sim"], "n_obs": v["n_obs"],
        "HH": v["counts"]["HH"], "LL": v["counts"]["LL"],
        "HL": v["counts"]["HL"], "LH": v["counts"]["LH"], "ns": v["counts"]["ns"],
        "fdr_cut": v["fdr_cut"], "sig_bonferroni": v["sig_bonferroni"],
    } for v in variables]).to_csv(c.METRICS / "county_lisa_global.csv", index=False)
    log.info("wrote analysis/output/metrics/county_lisa_global.csv")

    if args.emit_counts:
        raw_vars = [run_total(us, w, ids, args)]
        for team in teams:
            raw_vars.append(run_team_raw(team, us, w, ids, args))
        raw_payload = dict(payload)
        raw_payload["variables"] = raw_vars
        raw_payload["meta"] = {**payload["meta"],
                               "note": "raw-count variant; LL class is degenerate"}
        c.write_json(raw_payload, c.METRICS / "county_lisa_count.json", log, indent=None)

    return 0


if __name__ == "__main__":
    sys.exit(main())
