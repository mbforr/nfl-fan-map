"""01 — Load & validate the pipeline outputs.

Sanity-checks that the analysis layer is reading the data it expects and that
team keys are internally consistent, before any downstream task trusts them.
Writes output/metrics/validation.json.
"""
from __future__ import annotations

import common as c

# 32 is a true domain invariant (NFL teams). Row/region counts vary per data
# run, so they're validated for internal consistency against totals.json — not
# against hardcoded magic numbers that go stale every refresh.
EXPECT_TEAMS = 32


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("01_load_and_validate")

    regions = c.load_regions()
    centroids = c.load_centroids()
    totals = c.load_totals()
    teams = c.load_teams()
    names = {t["short_name"] for t in teams}

    # a_counts keys must all be known teams.
    counts_keys: set[str] = set()
    for d in regions["a_counts"]:
        counts_keys.update(d.keys())
    unknown = sorted(counts_keys - names - {c.CONTESTED})
    missing_poi = [t["short_name"] for t in teams if not t.get("poi")]

    # Internal consistency: sum(a_counts) must equal sum(a_total) exactly.
    recomputed = int(sum(sum(d.values()) for d in regions["a_counts"]))
    a_total_sum = int(regions["a_total"].sum())

    # Reconcile against totals.json a_responses. The gap is the pipeline's
    # documented "unjoined aggregates" — responses that resolved to a region
    # key but matched no boundary feature (dropped from the map). Expected to
    # be small (<1%); reported, not a hard failure.
    a_responses = totals["meta"]["a_responses"]
    unjoined_gap = a_responses - recomputed
    gap_pct = abs(unjoined_gap) / a_responses if a_responses else 1.0

    meta_regions = totals["meta"]["unique_regions"]
    checks = {
        # Structural: polygons and centroids describe the same region set, and
        # both match the region count the pipeline itself reported.
        "polygons_eq_centroids": {"polygons": len(regions), "centroids": len(centroids),
                                  "ok": len(regions) == len(centroids)},
        "features_match_totals": {"features": len(regions), "totals_regions": meta_regions,
                                  "ok": len(regions) == meta_regions},
        "teams_count": {"value": len(teams), "expect": EXPECT_TEAMS,
                       "ok": len(teams) == EXPECT_TEAMS},
        "unknown_team_keys": {"value": unknown, "ok": not unknown},
        "teams_missing_poi": {"value": missing_poi, "ok": not missing_poi},
        # Hard: a_counts and a_total must agree exactly (internal consistency).
        "counts_match_a_total": {"recomputed": recomputed, "a_total_sum": a_total_sum,
                                 "ok": recomputed == a_total_sum},
        # Soft: unjoined-aggregate reconciliation vs totals.json (<1% expected).
        "unjoined_aggregate_gap": {"a_responses": a_responses, "on_map": recomputed,
                                   "gap": unjoined_gap, "gap_pct": round(gap_pct, 5),
                                   "ok": gap_pct < 0.01},
    }
    all_ok = all(chk["ok"] for chk in checks.values())

    out = {"all_ok": all_ok, "checks": checks,
           "counts": {"total_rows": totals["meta"]["total_rows"],
                      "valid_rows": totals["meta"]["valid_rows"],
                      "unique_regions": meta_regions},
           "levels": regions["level"].value_counts().to_dict(),
           "countries": len(regions["country"].unique())}
    c.write_json(out, c.METRICS / "validation.json", log)

    for name, chk in checks.items():
        log.info("%s %s", "PASS" if chk["ok"] else "FAIL", name)
    if not all_ok:
        raise SystemExit("validation FAILED — see validation.json")
    log.info("all validation gates passed")


if __name__ == "__main__":
    main()
