"""02 — Packers Instagram spike detection + pre-spike baseline leaderboard.

Reads the raw survey CSV (the only place timestamps survive). Computes daily
team share, flags the Packers spike days, and produces the pre-spike (May 11-18)
corrected leaderboard used in Problem two of the video.

Basis note: this task works on RAW responses (every submitted row), which is a
larger denominator than the joined-region counts used from task 03 onward.
"""
from __future__ import annotations

import datetime as dt

import pandas as pd

import common as c

PACKERS = "Green Bay Packers"
SPIKE_SHARE = 0.15          # flag days where a team exceeds 15% of daily volume
SPIKE_MIN_VOL = 10          # ... and the day has >= 10 responses
BASELINE_START = dt.date(2026, 5, 11)
BASELINE_END = dt.date(2026, 5, 18)   # inclusive; pre-spike window


def main() -> None:
    args = c.get_args(__doc__)
    log = c.setup_logging("02_packers_spike")

    df = c.load_responses()
    n_bad_ts = int(df["timestamp"].isna().sum())
    df = df.dropna(subset=["timestamp", "team"]).copy()
    log.info("responses with usable date+team: %d (dropped %d bad timestamps)",
             len(df), n_bad_ts)

    # Daily volume + per-day team counts -> long-form share table.
    daily_total = df.groupby("date").size().rename("day_total")
    daily_team = (df.groupby(["date", "team"]).size().rename("count").reset_index())
    daily_team = daily_team.join(daily_total, on="date")
    daily_team["share"] = daily_team["count"] / daily_team["day_total"]
    daily_team = daily_team.sort_values(["date", "count"], ascending=[True, False])
    c.METRICS.joinpath("daily_team_share.csv")
    daily_team.to_csv(c.METRICS / "daily_team_share.csv", index=False)
    log.info("wrote metrics/daily_team_share.csv (%d rows)", len(daily_team))

    # Packers daily share series (explicit, for the cold-open chart).
    pack = daily_team[daily_team["team"] == PACKERS][
        ["date", "count", "day_total", "share"]].reset_index(drop=True)
    pack.to_csv(c.METRICS / "packers_daily_share.csv", index=False)

    # Spike days: any team over threshold with enough volume (Packers first).
    spikes = daily_team[(daily_team["share"] > SPIKE_SHARE) &
                        (daily_team["day_total"] >= SPIKE_MIN_VOL)].copy()
    spikes.to_csv(c.METRICS / "spike_days.csv", index=False)
    pack_spikes = spikes[spikes["team"] == PACKERS]["date"].tolist()
    log.info("Packers spike days (>15%%, vol>=10): %d", len(pack_spikes))

    # Gate: May 19-21 must be Packers spike days.
    want = {dt.date(2026, 5, 19), dt.date(2026, 5, 20), dt.date(2026, 5, 21)}
    have = want & set(pack_spikes)
    log.info("May 19-21 present in Packers spikes: %s", sorted(map(str, have)))
    if want - set(pack_spikes):
        log.warning("MISSING expected spike days: %s",
                    sorted(map(str, want - set(pack_spikes))))

    # Pre-spike baseline leaderboard (May 11-18): share of each team.
    base = df[(df["date"] >= BASELINE_START) & (df["date"] <= BASELINE_END)]
    lb = (base["team"].value_counts(normalize=True).rename("share")
          .reset_index().rename(columns={"index": "team"}))
    lb["count"] = base["team"].value_counts().values
    lb = lb.head(15)
    lb.to_csv(c.METRICS / "leaderboard_prespike.csv", index=False)
    log.info("pre-spike (%s..%s) top 3: %s", BASELINE_START, BASELINE_END,
             list(lb[["team", "share"]].head(3).itertuples(index=False, name=None)))

    # Full-data (IG-skewed) leaderboard for the contrast.
    full_lb = (df["team"].value_counts(normalize=True).rename("share")
               .reset_index().rename(columns={"index": "team"}))
    full_lb["count"] = df["team"].value_counts().values
    full_lb.head(15).to_csv(c.METRICS / "leaderboard_full.csv", index=False)

    summary = {
        "raw_responses_used": len(df),
        "bad_timestamps": n_bad_ts,
        "packers_spike_days": sorted(map(str, pack_spikes)),
        "may_19_21_present": sorted(map(str, have)),
        "packers_full_share": float(full_lb.loc[full_lb["team"] == PACKERS, "share"].iloc[0]),
        "packers_prespike_share": float(lb.loc[lb["team"] == PACKERS, "share"].iloc[0])
        if PACKERS in lb["team"].values else None,
        "baseline_window": [str(BASELINE_START), str(BASELINE_END)],
    }
    c.write_json(summary, c.METRICS / "packers_spike_summary.json", log)


if __name__ == "__main__":
    main()
