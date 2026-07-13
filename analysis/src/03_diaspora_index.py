"""03 — Diaspora index: share of each team's fans living in its home state.

US regions are county-level, so we roll counties up to state via the FIPS state
prefix (id[:2]) and count each team's fans in its home state. Two denominators
are reported: global (all fans anywhere) and US-only. The video's headline
numbers (Texans ~69%, Raiders ~5%) use the global denominator.
"""
from __future__ import annotations

import pandas as pd

import common as c
import lookups as lk


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("03_diaspora_index")

    regions = c.load_regions()
    us = regions[regions["country"] == "US"].copy()
    us["state"] = us["id"].apply(lambda i: lk.FIPS_TO_STATE.get(c.state_fips(i)))

    # team -> {state: fans}
    by_state = c.rollup_counts_by(us, lambda row: row["state"])

    rows = []
    for team in c.team_names():
        home = lk.TEAM_HOME_STATE[team]
        home_fans = by_state.get(home, {}).get(team, 0)
        us_fans = int(sum(s.get(team, 0) for s in by_state.values()))
        global_fans = int(c.team_counts_per_region(regions, team).sum())
        rows.append({
            "team": team,
            "home_state": home,
            "home_state_fans": home_fans,
            "us_fans": us_fans,
            "global_fans": global_fans,
            "diaspora_pct_global": round(home_fans / global_fans, 4) if global_fans else None,
            "diaspora_pct_us": round(home_fans / us_fans, 4) if us_fans else None,
        })

    df = pd.DataFrame(rows).sort_values("diaspora_pct_global")
    df.to_csv(c.METRICS / "diaspora_index.csv", index=False)
    log.info("wrote metrics/diaspora_index.csv")

    # Gate spot-checks.
    def pct(team):
        return float(df.loc[df["team"] == team, "diaspora_pct_global"].iloc[0])
    log.info("Texans (expect ~0.69): %.3f", pct("Houston Texans"))
    log.info("Raiders (expect ~0.05): %.3f", pct("Las Vegas Raiders"))
    log.info("most diaspora: %s", list(df.head(3)[["team", "diaspora_pct_global"]]
                                       .itertuples(index=False, name=None)))
    log.info("most loyal: %s", list(df.tail(3)[["team", "diaspora_pct_global"]]
                                     .itertuples(index=False, name=None)))


if __name__ == "__main__":
    main()
