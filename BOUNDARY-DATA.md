# Boundary Data Reference

Geographic reference for the NFL Fan Map. Documents every boundary dataset the
preprocessing pipeline consumes, the aggregated GeoJSON it emits, and the
country → level → boundary-file resolution policy. Stats below reflect the
`new_data_0630.csv` run (27,990 survey rows → 26,301 valid → 2,336 regions).

> **Scope note.** This is a single-axis build (`group = "a"`). All aggregate
> properties carry the `a_` prefix so the runtime Mapbox expressions stay generic.

---

## 1. Pipeline at a glance

```
data/responses.csv ──┐
                     │   scripts/preprocess.js
data/*.geojson  ─────┼──────────────────────────►  public/data/regions_polygons.geojson
data/zip_county_     │                              public/data/regions_centroids.geojson
  crosswalk.txt  ─────┘                              public/data/totals.json
                                                     (public/data/category_a.json ← seed-categories.py)
```

Each survey row is resolved to a region, bucketed by `${country}:${level}:${id}`,
then the aggregate is joined onto a boundary feature. The runtime sees **one
homogeneous polygon set + one matching centroid set** — it never branches on
country or level.

---

## 2. Resolution policy (country → level → boundary file)

Defined in [scripts/preprocess.js](scripts/preprocess.js) (header comment + the
per-country join blocks). The aggregation level is **intrinsic to each feature**,
carried in its `level` property.

| Country | Level | Boundary file | Join key | Label source |
|---|---|---|---|---|
| **US** | county | `counties_us.geojson` (GADM L2) | ZCTA→county crosswalk → state + `NAME_2` | `NAME_2` (county) |
| **CA** | province / division | `provinces_ca.geojson` (L1) + `divisions_ca.geojson` (L2) | `ISO_1`; QC falls back to `NAME_1` | `NAME_1` / `NAME_2` |
| **MX** | state | `states_mx.geojson` (L1) | `ISO_1`, with `NAME_1`→ISO fallback map | `NAME_1` |
| **DE** | state | `states_de.geojson` (L1) | `HASC_1` (e.g. `DE.BW`) | `NAME_1` |
| **AU** | state | `states_au.geojson` (L1) | `HASC_1` | `NAME_1` |
| **GB** | nation + division | `nations_gb.geojson` (L1) + `divisions_gb.geojson` (L2) | `GID_1` code (ENG/NIR/SCO/WLS); England subdivides to L2 by point-in-polygon | `NAME_1` / `NAME_2` (+ HASC overrides) |
| **everyone else** | country | `countries_world.geojson` (L0) | `ISO_A2` | `NAME` |

US is the only county-level tier. The GADM files ship many `NAME = "NA"`
placeholders (notably England L2 and Québec) — the pipeline works around these
with HASC fallbacks and a hand-built name→ISO map; preserve that logic if you
extend the joins.

---

## 3. Input boundary files — `data/` (PRIVATE, gitignored)

All source polygons are **GADM 4.1** except `countries_world.geojson`. Every file
is `FeatureCollection` of `MultiPolygon`. Coordinates are unprojected lon/lat
(EPSG:4326). Sizes are on-disk raw (unminified).

### GADM Level-2 files (county/division granularity)

`counties_us.geojson`, `divisions_ca.geojson`, `divisions_gb.geojson` — shared schema:

| File | Features | Size | Serves |
|---|---|---|---|
| `counties_us.geojson` | 3,148 | 10.21 MB | US counties |
| `divisions_ca.geojson` | 293 | 14.28 MB | CA census divisions |
| `divisions_gb.geojson` | 183 | 1.84 MB | GB districts (England L2) |

**L2 property schema:**
```
GID_0, GID_1, GID_2     GADM hierarchical IDs ("USA.1.1_1")
COUNTRY                 country name ("UnitedStates")
NAME_1, NAME_2          state/county names (NAME_2 often "NA" in GB)
VARNAME_2, NL_NAME_*    alt / native names ("NA" when absent)
TYPE_2, ENGTYPE_2       feature type ("County")
HASC_2                  hierarchical area code ("US.AL.AU") — join key for DE/AU/GB
CC_2                    census/local code ("NA" for US)
```

### GADM Level-1 files (state/province granularity)

`provinces_ca.geojson`, `states_mx.geojson`, `states_de.geojson`,
`states_au.geojson`, `nations_gb.geojson` — shared schema:

| File | Features | Size | Serves |
|---|---|---|---|
| `provinces_ca.geojson` | 13 | 12.88 MB | CA provinces/territories |
| `states_mx.geojson` | 32 | 1.52 MB | MX states |
| `states_de.geojson` | 16 | 0.55 MB | DE Bundesländer |
| `states_au.geojson` | 11 | 2.41 MB | AU states/territories |
| `nations_gb.geojson` | 5 | 0.97 MB | GB constituent nations |

**L1 property schema:**
```
GID_0, GID_1            GADM IDs
COUNTRY, NAME_1         country + state/province name
ISO_1                   ISO 3166-2 code ("CA-ON") — join key for CA/MX ("NA" for Québec & some MX)
HASC_1                  hierarchical area code ("DE.BW") — join key for DE/AU
TYPE_1, ENGTYPE_1       feature type
VARNAME_1, NL_NAME_1, CC_1
```

### Country file (Level-0)

| File | Features | Size | Schema |
|---|---|---|---|
| `countries_world.geojson` | 104 | 31.72 MB | `ISO_A2`, `ISO_A3`, `NAME` |

Note: only 104 country polygons (not the full ~250) — it ships only the
countries present in the survey. Add features here if new countries appear.

### Crosswalk — `zip_county_crosswalk.txt`

US Census ZCTA→county relationship file. **Pipe-delimited**, BOM-prefixed,
47,864 rows. Bridges survey ZIPs to GADM US counties.

Key columns: `GEOID_ZCTA5_20` (5-digit ZCTA), `GEOID_COUNTY_20` (5-digit county
FIPS), `NAMELSAD_COUNTY_20` (e.g. "Baldwin County"). The pipeline maps
ZIP → county FIPS → (state name, normalized county name) → GADM `NAME_1`+`NAME_2`.

### `data/_raw/` (116 files)

Original GADM `.json.zip` archives per country (`gadm41_AUS_1.json`, …) plus
GeoNames city gazetteers `CA.txt` / `GB.txt` (used for England L2 point-in-polygon
assignment). Provenance only — not read at runtime; the merged `data/*.geojson`
files above are the working inputs. `download:boundaries` (re)builds them.

---

## 4. Output aggregates — `public/data/` (TRACKED in git, served at runtime)

### `regions_polygons.geojson` + `regions_centroids.geojson`

Identical property sets; polygons are `MultiPolygon`, centroids are `Point`
(signed-area centroid of the largest ring; country `LABEL_X/Y` when available).

| File | Features | Size | Geometry |
|---|---|---|---|
| `regions_polygons.geojson` | 2,336 | 15.68 MB | MultiPolygon |
| `regions_centroids.geojson` | 2,336 | 0.89 MB | Point |

**Feature property schema:**
```json
{
  "region": "Russia",          // popup title (county/state/country name)
  "id": "RU",                  // join id within (country, level)
  "country": "RU",             // ISO-2
  "level": "country",          // see enum below
  "total": 29,                 // responses in region
  "a_total": 29,               // == total (single-axis)
  "a_counts": { "New York Giants": 5, "Seattle Seahawks": 2, ... },  // team → count
  "a_dominant": "New York Giants",   // top team; "__contested__" on tie
  "a_dominant_pct": 0.1724           // dominant share of a_total
}
```
- Zero-response regions are omitted. Tie → `a_dominant = "__contested__"`
  (rendered `#808080`).
- `a_counts` may be read as an object or a JSON string — consumers should handle both.

**`level` enum + counts (this run):**

| level | features | country |
|---|---|---|
| `county` | 1,912 | US |
| `division` | 164 | CA (L2) |
| `gb_division` | 100 | GB (England L2) |
| `country` | 92 | non-tiered countries |
| `state` | 30 | MX |
| `de_state` | 16 | DE |
| `province` | 10 | CA (L1, non-divisioned) |
| `au_state` | 8 | AU |
| `gb_nation` | 4 | GB (NIR/SCO/WLS + ENG) |

> A US-only State/County resolution toggle is the planned next tier. Because each
> feature already carries `level`, that toggle is a visibility/source switch, not
> a data-model change.

### `totals.json`

National rollup + run metadata. Drives Legend top-N, dropdown sort, ViewportTop
priority, and the Counter panel.

```json
{
  "meta": {
    "total_rows": 27990, "valid_rows": 26301,
    "skipped_bad_country": 9, "skipped_no_region": <…>,
    "skipped_breakdown": { "badCountry":9, "usNoZip":1410, "usBadZip":202,
                           "caNoLevel":6, "mxNoState":45, "deNoState":9,
                           "auNoState":8, "other":0 },
    "unique_regions": 2336, "a_responses": 26301, "a_categories": 32,
    "by_country": { "US":19671, "CA":1682, "GB":979, ... }
  },
  "a": [ { "short_name": "Green Bay Packers", "count": 3333 }, ... ]  // desc by count
}
```

Top teams this run: Green Bay Packers (3,333), Buffalo Bills (1,969),
Pittsburgh Steelers (1,627), Seattle Seahawks (1,373), Philadelphia Eagles (1,329).

### `category_a.json`

32 NFL teams — `short_name` (must match survey verbatim), `name`, `group`
(division), `primary_color`, `secondary_color`, `poi` (stadium `{name,lat,lng}`).
Hardcoded in [scripts/seed-categories.py](scripts/seed-categories.py); unmatched
survey values are written to `TODO.md` with a placeholder color (none this run).

---

## 5. Drop counts (data lost in aggregation, this run)

1,689 of 27,990 rows dropped:

| reason | count | meaning |
|---|---|---|
| `usNoZip` | 1,410 | US row with no/blank postal code |
| `usBadZip` | 202 | US ZIP not in the crosswalk |
| `mxNoState` | 45 | MX row with unresolvable state |
| `badCountry` | 9 | country string not resolvable to ISO-2 |
| `deNoState` | 9 | DE row with unresolvable Bundesland |
| `auNoState` | 8 | AU row with unresolvable state |
| `caNoLevel` | 6 | CA row with unresolvable province/division |

`unjoined aggregates: 69` — buckets that resolved to a (country, level, id) but
found no matching boundary feature (tiny/unmatched geographies); dropped silently
from the map. Worth auditing if a new country tier is added.

---

## 6. `.gitignore` posture

Input boundaries are **private** (explicit per-file ignores — never bare `data/`,
which would also catch `public/data/`):
`data/responses.csv`, `data/counties_us.geojson`, `data/countries_world.geojson`,
the per-country GADM files, and `data/_raw/`. Outputs in `public/data/*` are
**tracked** and committed.
