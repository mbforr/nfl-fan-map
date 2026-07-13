"""11 — International cut: top team + fan diversity per country.

Aggregates a_counts by the `country` property across ALL features (CA/MX/DE/AU/GB
are sub-national in the outputs, so filtering level=="country" would miss them —
that's how we recover e.g. Bills-in-Canada). Reports, for every country with
>=50 responses, the top team, its share, and a normalized-entropy diversity index.
"""
from __future__ import annotations

import math

import pandas as pd

import common as c

MIN_RESPONSES = 50
N_TEAMS = 32


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

    # Country-dominant polygon layer for Mapbox: the 92 simple country polygons
    # (they already carry a_dominant). CA/MX/DE/AU/GB are sub-national only, so
    # they're covered by the CSV rollup, not this polygon layer.
    country_polys = regions[regions["level"] == "country"].copy()
    rank = {cc: i + 1 for i, cc in enumerate(df["country"])}
    country_polys["rank_by_total"] = country_polys["country"].map(rank)
    div = df.set_index("country")["diversity_norm"].to_dict()
    country_polys["diversity_norm"] = country_polys["country"].map(div)
    c.write_geojson(country_polys, c.GEOJSON / "country_dominant.geojson", log)
    log.info("note: CA/MX/DE/AU/GB are sub-national in outputs; see CSV for their rollups")


if __name__ == "__main__":
    main()
