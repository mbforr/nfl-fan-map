# Plan: Build the `analysis/` layer for the NFL Fan Map video

> On approval, **step 0 is to write this plan to `analysis/PLAN.md`** so it lives alongside `analysis/CLAUDE.md` and `analysis/Video8_NFL_Fan_Map_PLAN.md` (the user asked for the plan to live in `analysis/`). Plan-mode only lets me edit this scratch file for now.

## Context

`analysis/CLAUDE.md` specs a **read-only Python layer** that consumes the existing pipeline outputs in `public/data/` (produced by `scripts/preprocess.js`, just refreshed to the 27,990-row `new_data_0630.csv` run) and turns them into metrics + spatial artifacts for a YouTube video. `analysis/Video8_NFL_Fan_Map_PLAN.md` is the narrative source (six "problems": Packers IG spike, corrected leaderboard, diaspora index, international cut, no-NFL-team states / Voronoi, Rust Belt fan-bar diaspora).

The spec is already a strong design. This plan reconciles it against the **real data shapes** (which differ from the spec's assumptions in a few important ways) and applies the user's three build decisions. It does **not** modify `scripts/preprocess.js`, `public/data/*`, or any boundary file.

## Decisions applied (from the user)

1. **Offline first.** Build the self-contained analyses (tasks 1–7, 11, 12) end-to-end now. Anything needing live network (fan-bar scrape, geocoding, Census API) is **file-gated**: it runs only when the user drops input files into a new `analysis/data/` tier.
2. **Demographics via files, not the Census API.** Task 10 becomes a **file-based join** of user-supplied demographic/migration/population files (joined by FIPS / state), replacing the ACS API call.
3. **GeoJSON out, no viz HTML.** No kepler.gl / folium / Plotly HTML. Every spatial deliverable is a **GeoJSON layer** the user will render in a later Mapbox app. Non-spatial results are tidy **CSV/JSON**. (`keplergl` is not installed and is skipped entirely.)

## Key data facts that shape the code (verified against the live files)

- **US is county-level, not state-level.** US features have `level=="county"`, `region` like `"Allen County, IN"`, and `id` = **5-digit FIPS** (`"18003"`). → **State rollups are derived from `id[:2]` (state FIPS prefix)**, not from a re-normalization of the raw survey's 673 messy state strings. This sidesteps the spec's state-cleaning risk: the pipeline already produced clean geography.
- **Join on FIPS `id`, not county-name substrings.** The spec's Rust Belt lookup used fragile `"State:County"` `str.contains` matching. Replace with a **`metro → FIPS id`** map (e.g. Mecklenburg `37119`, Maricopa `04013`) → exact `id` equality joins. Same for fan-bar point-in-polygon (task 9).
- **Country rollup spans all levels.** CA/MX/DE/AU/GB are sub-national in the outputs (`province`/`state`/`gb_nation`/etc.), so "Bills in Canada = 293" and the international cut must **aggregate `a_counts` by the `country` property across every feature**, not filter `level=="country"`. (Only 92 features are literally `level=="country"`; 14 of those have `total≥50`.)
- **`a_counts` needs defensive parsing.** It is a real nested object in the file, but geopandas/fiona coerces nested props to **strings** on read → keep the `json.loads if isinstance(x,str)` guard (spec §"Reading the existing outputs").
- **Raw vs joined counts differ.** Packers ≈ 3,506 raw (spec) vs 3,333 in joined regions (rows that couldn't resolve to a region are dropped). → **Spike/leaderboard (task 2) uses the raw CSV; diaspora/spatial (task 3+) uses joined regions.** SUMMARY.md must label which basis each number uses.
- **All 32 teams have a non-null `poi {name,lat,lng}`** → Voronoi over 32 points is clean.
- **Environment**: Python 3.12.6; pandas/numpy/geopandas/scipy/libpysal/esda/plotly/requests/bs4/geopy already importable. Only a `requirements.txt` and a `.gitignore` entry for `analysis/output/` are missing.
- Timestamps live only in `data/responses.csv`, format `%m/%d/%Y %H:%M:%S`.

## Directory & output layout (revised)

```
analysis/
├── CLAUDE.md, Video8_NFL_Fan_Map_PLAN.md, PLAN.md   (PLAN.md = step 0)
├── requirements.txt
├── data/                    <-- NEW input tier for user-supplied offline files (gitignored)
│   ├── census/              migration flows + state/county population (task 10)
│   └── fan_bars/{team}.csv  optional hand/supplied bar lists (tasks 8/9)
├── src/
│   ├── common.py            paths, load_regions/centroids/teams/totals, a_counts parse
│   ├── lookups.py           team→home_state (2-letter), FIPS→state, rust-belt teams, metro→FIPS
│   ├── 01_load_and_validate.py … 07_rust_belt.py, 11_international.py, 12_summary.py  (build now)
│   └── 08_fan_bar_scrape.py, 09_fan_bar_match.py, 10_demographics_join.py             (file-gated)
└── output/                  (gitignored, regenerable)
    ├── metrics/  *.csv / *.json
    ├── geojson/  voronoi_stadiums.geojson, per-team + metro layers for Mapbox
    └── SUMMARY.md
```

`common.py` and `lookups.py` are the shared reuse layer — every task imports them; no duplicated load/parse logic.

## Build now (offline, tasks 1–7, 11, 12)

- **00 scaffold** — `requirements.txt`; add `analysis/output/` and `analysis/data/` to repo `.gitignore`; write `common.py` + `lookups.py`. `lookups.py` hand-codes team→home-state per the plan's stadium-location rule with its documented exceptions (Giants/Jets→NJ-but-NY question, Commanders MD/DC, Cowboys Arlington TX) — decide each explicitly and comment it.
- **01 load & validate** — assert 2,336 regions, totals 27,990/26,301, 32 teams; confirm every `a_counts` key ∈ `category_a.json` `short_name`. → `metrics/validation.json`.
- **02 Packers spike** — raw `data/responses.csv`; daily team share; flag Packers days >15% & vol≥10; confirm **May 19–21** window; also emit **pre-spike baseline (May 11–18)** corrected leaderboard (Packers≈Seahawks≈6.5%). → `metrics/daily_team_share.csv`, `metrics/spike_days.csv`, `metrics/leaderboard_prespike.csv`.
- **03 diaspora index** — roll counties→state via `id[:2]`; per team `home_state_fans/total_fans`; verify Texans≈69%, Raiders≈5%. → `metrics/diaspora_index.csv`.
- **04 Voronoi** — `scipy.spatial.Voronoi` over 32 stadiums, clip to US dissolve of `regions_polygons`; sum contained-region fan counts per cell (confusion vs actual team). → `geojson/voronoi_stadiums.geojson`, `metrics/voronoi_confusion.csv`. (No HTML.)
- **05 Moran's I** — Queen contiguity over US regions; per-team `Moran` (999 perms); Bonferroni note. Expect Texans high / Steelers low. → `metrics/morans_i_per_team.csv`.
- **06 distance-decay** — haversine from each centroid to each team stadium, weighted by counts. → `metrics/distance_decay.csv` (long form, ready for later charting).
- **07 Rust Belt cross-tab** — rust-belt teams × Sun-Belt metros using **metro→FIPS `id`** joins; also emit a metro-point GeoJSON with rust-belt fan counts. → `metrics/rust_belt_in_sun_belt.csv`, `geojson/rust_belt_metros.geojson`.
- **11 international cut** — aggregate `a_counts` **by `country` across all features**; per country top team + diversity index (e.g. normalized entropy / HHI) for countries with ≥50; surface Canada-Bills (293), Germany, Australia, Mexico beats. → `metrics/international_top_teams.csv`, `geojson/country_dominant.geojson`.
- **12 SUMMARY.md** — compile headline numbers (labeling raw vs joined basis), spike narrative, corrected leaderboard, diaspora + Moran's I leaderboards, international standouts, Rust Belt table, methodology caveats. Regenerates cleanly on rerun.

## File-gated (build the code now, runs when inputs appear)

- **08 fan-bar ingest** — no live scraping this pass. Reads `analysis/data/fan_bars/{team}.csv` (cols: team,bar_name,city,state,lat,lon) if present; scraper adapters are stubbed with a clear "supply file or implement adapter" message.
- **09 fan-bar match** — `gpd.sjoin` bars→US regions by containment, look up team count in that region, per-team match rate (Bills/Steelers expected >70%). → `metrics/fan_bar_match.csv`, `geojson/fan_bars.geojson`. Skips with a logged notice if no bar files.
- **10 demographics join** — reads user-supplied files in `analysis/data/census/` (migration flows, state/county population). Joins by **FIPS/state**; computes Rust-Belt→Sun-Belt corridors and fans-per-capita. → `metrics/migration_flows.csv`, `metrics/fans_per_capita.csv`, `geojson/migration_flows.geojson` (origin→dest lines for Mapbox). Skips with a logged notice if no files.

## Conventions (from spec, kept)

EPSG:4326 everywhere; `short_name` is the canonical team key; each script writes a `.log`, is restartable, never overwrites without `--force`; scripts run in numeric order and stop on first failure.

## Validation gates (sanity targets — now live against the 0630 data)

2,336 regions; recomputed counts within 0.5% of `totals.json`; Packers spike incl. May 19–21; Texans diaspora ≈69%; Raiders ≈5%; Moran's I p<0.05 for ≥25/32 teams; Bills bar match >70% **(only checkable once bar files are provided)**; `SUMMARY.md` regenerates on rerun.

## Verification

```bash
cd analysis && pip install -r requirements.txt
for f in src/0[1-7]_*.py src/11_*.py; do python "$f" || break; done   # offline build
python src/12_summary.py
```
Then read `output/SUMMARY.md` and spot-check the gate numbers above; open the `output/geojson/*` in a GeoJSON viewer to confirm geometry validity before wiring the Mapbox app.

## Open items to confirm during/after build

- **team→home-state edge cases** (Giants/Jets, Commanders, Cowboys, Rams/Chargers/Raiders relocations) — I'll encode stadium-state per the plan and list the choices in `lookups.py`; flag any that move the diaspora leaderboard.
- Exact **schema of the demographic files** for task 10 (once the user drops them in) — I'll adapt the join keys to whatever columns they contain.
