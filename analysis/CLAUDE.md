# NFL Fan Map. Analysis Layer.

## What this directory does

The repo's existing `scripts/preprocess.js` pipeline already handles geography. It ingests `data/responses.csv`, joins survey rows to GADM 4.1 boundaries via the country→level→boundary-file resolution policy, and emits the runtime aggregates in `public/data/`.

This `analysis/` directory is a Python layer that **reads** those existing outputs and the raw `data/responses.csv` to produce the analytical artifacts a video script needs. It does not touch the existing JavaScript pipeline, the `public/data/` outputs the Mapbox runtime serves, or any boundary files in `data/`. Everything new lands in `analysis/output/`.

The intended consumer of this layer is a video script for the YouTube channel Ground Truth Lab. The deliverable is `analysis/output/SUMMARY.md` plus a set of metrics CSVs, charts, and exploratory maps.

## What the existing pipeline already gives us

Before this layer runs, the existing pipeline has produced four files this analysis depends on:

- **`public/data/regions_polygons.geojson`** (2,336 features). Per-region aggregates with `region`, `country`, `level`, `total`, `a_total`, `a_counts` (team to count map), `a_dominant`, `a_dominant_pct`. The geographic backbone of every spatial statistic in this layer.
- **`public/data/regions_centroids.geojson`** (2,336 features). Point centroids of the polygons. Used for distance-decay and weights-matrix construction.
- **`public/data/totals.json`**. Run metadata, national rollup, top-team list. Used to validate this layer's headline numbers against the pipeline's headline numbers.
- **`public/data/category_a.json`**. 32 NFL teams with `short_name`, `name`, `group` (division), `primary_color`, `secondary_color`, `poi` (stadium `{name, lat, lng}`). Used as the stadium lookup for Voronoi and distance-decay.

Plus the raw input the existing pipeline strips for storage efficiency:

- **`data/responses.csv`**. The full 27,990 survey rows with timestamps. The existing pipeline does not preserve timestamps in `public/data/`, so this layer reads `data/responses.csv` directly for the Packers Instagram spike analysis.

## What this layer does NOT do

- Does not modify `scripts/preprocess.js`, `scripts/seed-categories.py`, or any existing pipeline code.
- Does not write to `public/data/`. Those files are committed to git and consumed by the runtime app.
- Does not modify `data/responses.csv` or any boundary GeoJSON in `data/`.
- Does not re-geocode or re-join geography. The pipeline already did it. We use its outputs.

If a future video needs additional pipeline columns (a new level, a new join key, a new boundary), update `scripts/preprocess.js` directly. Do not work around it here.

## Tech stack (Python only, additive)

- **pandas, numpy** for general data work.
- **geopandas** for reading the existing GeoJSON outputs.
- **scipy.spatial** for Voronoi tessellation against stadium points.
- **PySAL** (`libpysal.weights`, `esda.moran`) for spatial autocorrelation.
- **plotly** for the analytical charts.
- **keplergl** (Python bindings) for the exploratory maps.
- **requests + beautifulsoup4** for the fan-bar list scrape.
- **geopy** for ad-hoc Nominatim geocoding of fan-bar addresses (small batches, not the survey).
- **US Census ACS API** for migration flow data.

## Suggested file layout

```
<repo root>/
├── data/                         (existing, gitignored)
├── public/data/                  (existing, tracked, runtime)
├── scripts/                      (existing, preprocess.js + seed-categories.py)
│
└── analysis/                     <-- NEW DIRECTORY
    ├── CLAUDE.md                 (this file)
    ├── requirements.txt
    ├── src/
    │   ├── 01_load_and_validate.py
    │   ├── 02_packers_spike.py
    │   ├── 03_diaspora_index.py
    │   ├── 04_voronoi.py
    │   ├── 05_morans_i.py
    │   ├── 06_distance_decay.py
    │   ├── 07_rust_belt_diaspora.py
    │   ├── 08_fan_bar_scrape.py
    │   ├── 09_fan_bar_match.py
    │   ├── 10_census_migration.py
    │   ├── 11_international_cuts.py
    │   └── 12_summary.py
    └── output/                   (gitignore this, regenerable)
        ├── metrics/              (CSV/JSON per analysis)
        ├── maps/                 (HTML kepler.gl exports)
        ├── charts/               (Plotly HTML)
        ├── fan_bars/             (per-team scraped bar CSVs)
        └── SUMMARY.md            (final report for scripting)
```

Add `analysis/output/` to the repo's existing `.gitignore`. Every file in it is reproducible from the existing pipeline outputs plus the scripts in `analysis/src/`.

## Conventions

- All coordinates use EPSG:4326. The existing pipeline already standardizes on this.
- Use the existing `category_a.json` `short_name` field as the canonical team identifier. Match exactly to the `a_counts` keys.
- The `region` join key inside `regions_polygons.geojson` is the tuple `(country, level, id)`. This layer never invents new region identifiers.
- Every script writes a `.log` file alongside its output. Restartable by default; never overwrites without `--force`.

## Reading the existing outputs

```python
import geopandas as gpd
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DATA = REPO_ROOT / "public" / "data"
RAW_DATA = REPO_ROOT / "data"
OUT = Path(__file__).resolve().parents[1] / "output"

# Regions with team counts per region
regions = gpd.read_file(PUBLIC_DATA / "regions_polygons.geojson")
# a_counts is sometimes serialized as a string in GeoJSON; normalize to dict
regions["a_counts"] = regions["a_counts"].apply(
    lambda x: json.loads(x) if isinstance(x, str) else x
)

# Centroids (cheap to load, fast for distance and weights work)
centroids = gpd.read_file(PUBLIC_DATA / "regions_centroids.geojson")
centroids["a_counts"] = centroids["a_counts"].apply(
    lambda x: json.loads(x) if isinstance(x, str) else x
)

# Team metadata + stadium coordinates
with open(PUBLIC_DATA / "category_a.json") as f:
    teams = json.load(f)
stadiums = {t["short_name"]: t["poi"] for t in teams if t.get("poi")}

# Run metadata for sanity checks
with open(PUBLIC_DATA / "totals.json") as f:
    totals = json.load(f)
```

The `a_counts` field is the per-region team breakdown. To get a team-specific per-region series:

```python
def team_counts_per_region(regions_gdf, team_short_name):
    return regions_gdf["a_counts"].apply(lambda d: d.get(team_short_name, 0))
```

## Reading the raw responses for the Packers spike

The existing pipeline strips timestamps from `public/data/`. For the spike analysis, read the raw CSV directly:

```python
import pandas as pd
df = pd.read_csv(RAW_DATA / "responses.csv")
# Column names depend on the survey form; the typical column is "Timestamp"
df["timestamp"] = pd.to_datetime(df["Timestamp"], format="mixed", errors="coerce")
df["date"] = df["timestamp"].dt.date
df["team"] = df["Which NFL team are you a fan of?"]
```

Daily Packers share is computed against this raw view, not against the aggregated regions.

## Voronoi pattern (against stadium points, not GADM)

The video's Voronoi beat is a deliberate counterfactual to the existing pipeline. The pipeline draws boundaries via GADM. The Voronoi draws boundaries via "nearest stadium." Comparing the two maps is the Problem-five reveal.

```python
from scipy.spatial import Voronoi
from shapely.geometry import Polygon
import geopandas as gpd

points = [(s["lng"], s["lat"]) for s in stadiums.values()]
team_names = list(stadiums.keys())

vor = Voronoi(points)

voronoi_polys = []
for region_idx in vor.point_region:
    region = vor.regions[region_idx]
    if -1 in region or len(region) == 0:
        voronoi_polys.append(None)
        continue
    voronoi_polys.append(Polygon([vor.vertices[i] for i in region]))

voronoi_gdf = gpd.GeoDataFrame(
    {"team": team_names, "geometry": voronoi_polys},
    crs="EPSG:4326",
)

# Clip to continental US polygon. Build it once from regions_polygons:
us_outline = regions[regions["country"] == "US"].dissolve().geometry.iloc[0]
voronoi_gdf["geometry"] = voronoi_gdf.geometry.intersection(us_outline)

voronoi_gdf.to_file(OUT / "voronoi_stadiums.geojson", driver="GeoJSON")
```

Then for each Voronoi cell, count the actual fans of each team inside it. The diagonal of this matrix is "fans that Voronoi predicts correctly" and the off-diagonal is "fans whose nearest stadium is not their team." That contrast is the analytical reveal.

## Moran's I pattern (using existing regions as the spatial unit)

The existing pipeline already produced the spatial backbone. Build a queen-contiguity weights matrix over the regions and compute Moran's I for each team's count vector.

```python
from libpysal.weights import Queen
from esda.moran import Moran
import pandas as pd

# Restrict to US regions for the within-US clustering analysis
us_regions = regions[regions["country"] == "US"].copy().reset_index(drop=True)
w = Queen.from_dataframe(us_regions)
w.transform = "r"  # row-standardize

results = []
for team in stadiums.keys():
    counts = us_regions["a_counts"].apply(lambda d: d.get(team, 0)).values
    if counts.sum() < 50:
        continue
    moran = Moran(counts, w, permutations=999)
    results.append({
        "team": team,
        "moran_i": moran.I,
        "p_sim": moran.p_sim,
        "z_sim": moran.z_sim,
        "n_fans": int(counts.sum()),
    })

pd.DataFrame(results).sort_values("moran_i", ascending=False).to_csv(
    OUT / "metrics" / "morans_i_per_team.csv", index=False
)
```

Expected: Houston Texans score highest (most clustered), Pittsburgh Steelers near the bottom (most dispersed). Apply a Bonferroni correction for 32 simultaneous tests if reporting strict significance.

## Distance-decay pattern (from region centroids)

```python
import numpy as np
import pandas as pd
from math import radians

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = np.sin(dp/2)**2 + np.cos(p1)*np.cos(p2)*np.sin(dl/2)**2
    return 2 * R * np.arcsin(np.sqrt(a))

decay_rows = []
for team, stadium in stadiums.items():
    for _, row in centroids.iterrows():
        count = row["a_counts"].get(team, 0) if isinstance(row["a_counts"], dict) else 0
        if count == 0:
            continue
        c = row.geometry
        d = haversine_km(c.y, c.x, stadium["lat"], stadium["lng"])
        for _ in range(count):
            decay_rows.append({"team": team, "km": d})

decay_df = pd.DataFrame(decay_rows)
decay_df.to_csv(OUT / "metrics" / "distance_decay.csv", index=False)
```

Use this for the per-team distance-distribution plot. Steelers, Packers, and Patriots will have flat tails (national fanbases). Texans, Browns, and Lions will have sharp drop-offs (local fanbases).

## Rust Belt cross-tab

The Rust Belt diaspora story uses the existing region-level counts. No new geocoding needed.

```python
rust_belt_teams = [
    "Pittsburgh Steelers", "Cleveland Browns", "Detroit Lions",
    "Chicago Bears", "Buffalo Bills", "Cincinnati Bengals",
    "Green Bay Packers", "Minnesota Vikings",
]

# Sun Belt metros mapped to (state, county) GADM tuples that the pipeline produced
sun_belt_metro_regions = {
    "Charlotte": ("US", "county", "North Carolina:Mecklenburg"),
    "Raleigh": ("US", "county", "North Carolina:Wake"),
    "Tampa": ("US", "county", "Florida:Hillsborough"),
    "Orlando": ("US", "county", "Florida:Orange"),
    "Phoenix": ("US", "county", "Arizona:Maricopa"),
    "Austin": ("US", "county", "Texas:Travis"),
    "Nashville": ("US", "county", "Tennessee:Davidson"),
    "Atlanta": ("US", "county", "Georgia:Fulton"),
    "Dallas": ("US", "county", "Texas:Dallas"),
    "Houston": ("US", "county", "Texas:Harris"),
    "Las Vegas": ("US", "county", "Nevada:Clark"),
    "San Antonio": ("US", "county", "Texas:Bexar"),
    "Jacksonville": ("US", "county", "Florida:Duval"),
    "Miami": ("US", "county", "Florida:Miami-Dade"),
}

# Build the matrix
import pandas as pd
matrix = pd.DataFrame(0, index=rust_belt_teams, columns=list(sun_belt_metro_regions.keys()))
for metro, (country, level, region_id) in sun_belt_metro_regions.items():
    row = regions[
        (regions["country"] == country) &
        (regions["level"] == level) &
        (regions["region"].str.contains(region_id.split(":")[1], na=False))
    ]
    if len(row) == 0:
        continue
    counts = row.iloc[0]["a_counts"]
    for team in rust_belt_teams:
        matrix.loc[team, metro] = counts.get(team, 0)

matrix.to_csv(OUT / "metrics" / "rust_belt_in_sun_belt.csv")
```

The region-id-to-metro mapping above is approximate. Validate against the actual `region` strings in `regions_polygons.geojson` before trusting the counts. The pipeline's `NAME_2` may include suffixes ("County", "Census Area") that need string normalization.

## Fan-bar match (uses regions, not raw point matching)

For each team with a documented bar program (Bills, Steelers, Bears, Packers, Lions), scrape the official chapter directory, geocode each bar to lat/lon, then ask which region polygon contains each bar. Cross-reference against the team's count for that region.

```python
import geopandas as gpd
from shapely.geometry import Point

# bars_df: columns = team, bar_name, city, state, lat, lon
bars_gdf = gpd.GeoDataFrame(
    bars_df,
    geometry=gpd.points_from_xy(bars_df["lon"], bars_df["lat"]),
    crs="EPSG:4326",
)

us_regions = regions[regions["country"] == "US"]
bars_with_region = gpd.sjoin(bars_gdf, us_regions, how="left", predicate="within")

# For each bar, look up the team's count in that region
def fans_in_region(row):
    counts = row.get("a_counts_right") or row.get("a_counts")
    if not isinstance(counts, dict):
        return 0
    return counts.get(row["team"], 0)

bars_with_region["team_fans_in_region"] = bars_with_region.apply(fans_in_region, axis=1)

# Match rate: percent of bars where the team has >= 3 fans in the bar's containing region
match_rate = (bars_with_region["team_fans_in_region"] >= 3).mean()
print(f"Bills bar match rate: {match_rate:.1%}")
```

Expected: Bills and Steelers should both score above 70 percent. This is the signature reveal of Problem six in the script. The fan map "found" the bars without being told they exist.

## Tasks (in order)

Each task reads from existing pipeline outputs and writes only to `analysis/output/`. Do not run task N+1 until task N succeeds.

1. **Load and validate.** Sanity-check `regions_polygons.geojson` (2,336 features expected), `totals.json` (27,990 raw rows, 26,301 valid), and `category_a.json` (32 teams). Confirm `a_counts` keys match `category_a.json` `short_name` values exactly. Write `output/metrics/validation.json`.

2. **Packers spike detection.** Read `data/responses.csv` directly. Compute daily Packers share. Flag days where share > 15% and total volume >= 10. Output `output/metrics/daily_packers_share.csv` plus the spike-day list. Verify the May 19 to 21 window appears.

3. **Diaspora index.** For each team, compute `home_state_fans / total_fans` using region-level counts. Texans land near 69 percent. Raiders land near 5 percent. Output `output/metrics/diaspora_index.csv`.

4. **Voronoi tessellation.** Compute Voronoi over the 32 stadium points, clip to the US dissolve of `regions_polygons.geojson`. For each cell, sum the contained regions' team counts. Output `output/voronoi_stadiums.geojson` and `output/maps/voronoi_vs_real.html`.

5. **Moran's I per team.** Build a queen-contiguity weights matrix over US regions. Run Moran's I on each team's count vector. Output `output/metrics/morans_i_per_team.csv`.

6. **Distance-decay curves.** Compute haversine distance from each region centroid to each team's stadium. Build per-team distance distributions weighted by fan counts. Output `output/metrics/distance_decay.csv` and `output/charts/distance_decay.html`.

7. **Rust Belt cross-tab.** Build the Rust Belt teams x Sun Belt metros matrix using region-level counts. Output `output/metrics/rust_belt_in_sun_belt.csv` and `output/charts/rust_belt_heatmap.html`.

8. **Fan-bar scrape.** Per-team adapters for Bills Backers, Steelers Nation, Bears Backers International, Pack Backers, Lions Pride. Geocode each bar via Nominatim. Validate counts against documented totals. Output `output/fan_bars/{team}.csv`.

9. **Fan-bar match analysis.** For each team with a bar list, spatial-join bars to regions and check if the team has fans in the bar's region. Compute the match rate per team. Output `output/metrics/fan_bar_match.csv` and `output/maps/bills_bars_vs_fans.html` (plus Steelers, Bears variants).

10. **Census ACS migration.** Pull state-to-state migration flows from the ACS 5-year API. Identify Rust Belt origin to Sun Belt destination flows. Output `output/metrics/migration_flows.csv` and `output/charts/migration_sankey.html`.

11. **International cuts.** Read country-level features from `regions_polygons.geojson` (where `level == "country"`). For each country with at least 50 responses, report the top team and the diversity index. Output `output/metrics/international_top_teams.csv`.

12. **Summary report.** Compile `output/SUMMARY.md` from all metrics. Include the Packers spike narrative, pre-spike top teams, diaspora leaderboard, Moran's I leaderboard, Rust Belt fan-bar match rates, international standouts, and methodology caveats.

## Validation gates

Before declaring the analysis layer done:

- `totals.json` and the analysis's recomputed counts agree within 0.5 percent.
- Packers spike days include May 19, 20, and 21.
- Houston Texans diaspora is approximately 69 percent.
- Las Vegas Raiders diaspora is approximately 5 percent.
- Moran's I produces a p-value below 0.05 for at least 25 of 32 teams.
- Bills bar match rate is above 70 percent.
- `output/SUMMARY.md` regenerates cleanly on rerun.

## Common commands

```bash
cd analysis
pip install -r requirements.txt

# Run the full layer
for i in $(seq -w 1 12); do
    python src/${i}_*.py || break
done

# Single step
python src/05_morans_i.py --force

# Validate
python src/12_summary.py --validate
```

## Notes for Claude Code

- The existing pipeline is the source of truth for geography. Never re-implement the GADM joins or the ZCTA crosswalk in this layer. Always read from `public/data/`.
- The `a_counts` field in `regions_polygons.geojson` may be a JSON string instead of a dict, depending on how the runtime serialized it. Use `json.loads` defensively when reading.
- The Voronoi tessellation is a deliberate counterfactual to the GADM regions. Do not try to make them agree. The video's point is that they do not.
- The Rust Belt cross-tab county-name strings need normalization. The pipeline's `NAME_2` includes "County", "Parish", "Borough", or "Census Area" suffixes depending on state. Strip the suffix before matching against the metro lookup, or use FIPS codes via `HASC_2` for a more robust join.
- The fan-bar scrape URLs change periodically. Verify each team's official chapter directory URL before writing the scraper. The current canonical sources are billsbackers.com (or the team's official Bills Backers page on buffalobills.com), steelers.com Steelers Nation, bearsbackers.com, packers.com community pages, and detroitlionsroar.com for Lions Pride.
- The 25 km buffer in the fan-bar match is not used in this analysis because we already have region-level aggregates. Match is via point-in-polygon containment, then count lookup. Both approaches work; this one is cheaper because it reuses the existing region join.
- The Census ACS migration API endpoint moved in 2024. Verify the current URL at api.census.gov before running task 10. The data is still public, just under a different path.
- After the layer runs, the analyst reads `output/SUMMARY.md` and pulls the numbers for the video script. The script itself is generated by the `entertainment-video-script-writer` skill on top of the `youtube-longform-script-writer` skill, not by this pipeline.

## Reference

The narrative plan this analysis supports lives at `Video8_NFL_Fan_Map_PLAN.md` in the parent project's outputs folder. Reference it for the six-problem video structure, the Packers spike framing, the Rust Belt diaspora beat, and the hidden science segments.