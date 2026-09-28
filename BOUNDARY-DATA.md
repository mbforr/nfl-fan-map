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
| **ES** | autonomous community | `states_es.geojson` (L1) | `HASC_1` (e.g. `ES.MD`) | `ES_LABEL` table (GADM `NAME_1` is concatenated) |
| **GB** | nation | `nations_gb.geojson` (L1) | `GID_1` code (ENG/NIR/SCO/WLS) | `GB_LABEL` table |
| **everyone else** | country | `countries_world.geojson` (L0) | `ISO_A2` | `NAME` |

US is the only county-level tier. The GADM files ship many `NAME = "NA"`
placeholders (notably Québec) — the pipeline works around these with HASC
fallbacks and a hand-built name→ISO map; preserve that logic if you extend the
joins.

### Sub-national response threshold (non-US)

Outside the US, a sub-national boundary is only drawn if it clears
**`SUBNAT_MIN` (>30) responses**; sparser regions **roll up** to the next-coarser
level, cascading to the country:

- CA census division → province → country
- CA province / DE Bundesland / AU state → country

The rolled-up remainder is drawn as the **country polygon** (label = country
name), painted *under* the qualifying sub-national polygons — the same layering
the app already uses for CA provinces beneath census divisions (see
`LEVEL_PAINT_ORDER`). CA is excluded from `countries_world.geojson` (it ships as
an L1 tier), so its country outline is **synthesized** by merging its province
features (`synthCountry`).

**Exceptions — always shown in full, no threshold, no whole-country polygon:**

- **GB** uses its four constituent **nations** (England / Scotland / Wales /
  Northern Ireland); English L2 divisions are no longer used, and there is no
  aggregate United-Kingdom boundary — every nation stands on its own.
- **MX** shows all states (`state` never rolls up).
- **ES** shows all 17 autonomous communities (`es_state` never rolls up).

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
`states_au.geojson`, `states_es.geojson`, `nations_gb.geojson`,
`states_us.geojson` — shared schema:

Manual fetch (same pattern as the other L1 tiers):

```bash
curl -L -o data/_raw/gadm41_USA_1.json.zip \
  https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_USA_1.json.zip
cd data/_raw && unzip -o gadm41_USA_1.json.zip && cd ../..
cp data/_raw/gadm41_USA_1.json data/states_us.geojson
```

Offline fallback, if that URL ever rots: dissolve `counties_us.geojson` by `GID_1`
in Python (geopandas), following the pattern in `analysis/src/04_voronoi.py`.
It needs `make_valid()` per geometry first, and Alaska crosses the antimeridian
so the dissolve breaks there — which is exactly why the download is preferred.

| File | Features | Size | Serves |
|---|---|---|---|
| `provinces_ca.geojson` | 13 | 12.88 MB | CA provinces/territories |
| `states_mx.geojson` | 32 | 1.52 MB | MX states |
| `states_de.geojson` | 16 | 0.55 MB | DE Bundesländer |
| `states_au.geojson` | 11 | 2.41 MB | AU states/territories |
| `states_es.geojson` | 18 | 0.53 MB | ES autonomous communities (17 + Ceuta/Melilla), from `gadm41_ESP_1` |
| `nations_gb.geojson` | 5 | 0.97 MB | GB constituent nations |
| `states_us.geojson` | 51 | 5.31 MB | US states + DC, from `gadm41_USA_1`. Feeds the separate `states_polygons.geojson` output, NOT `regions_polygons` |

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

### `data/_raw/US_postal.txt` — ZIP centroids

GeoNames **postal-code** dump, 41,490 rows, tab-delimited. Note this is a
different file from the `US.txt` gazetteer already in `data/_raw/` — same
filename upstream, different path, and only this one carries ZIPs:

```bash
curl -L -o /tmp/us_postal.zip https://download.geonames.org/export/zip/US.zip
unzip -p /tmp/us_postal.zip US.txt > data/_raw/US_postal.txt
```

Columns used: `[1]` ZIP, `[2]` place name, `[4]` state USPS, `[9]` lat, `[10]` lng.
A ZIP spanning several towns appears once per town; the first row wins.

Read only by `scripts/h3-contest.js`, which needs a POINT per response — the
county aggregates in `public/data/` have already discarded them. City centroids
would have worked without this download, but every respondent in a city would
collapse onto one coordinate, so Chicago would be a single point rather than
~100 ZIPs spread across several hexagons.

### `data/_raw/` (117 files)

Original GADM `.json.zip` archives per country (`gadm41_AUS_1.json`, …) plus
GeoNames city gazetteers `CA.txt` / `GB.txt` (used for England L2 point-in-polygon
assignment) and the postal file above. Provenance only — not read at runtime; the
merged `data/*.geojson` files above are the working inputs. `download:boundaries`
(re)builds the GADM archives.

---

## 4. Output aggregates — `public/data/` (TRACKED in git, served at runtime)

### `regions_polygons.geojson` + `regions_centroids.geojson`

Identical property sets; polygons are `MultiPolygon`, centroids are `Point`
(signed-area centroid of the largest ring; country `LABEL_X/Y` when available).

| File | Features | Size | Geometry |
|---|---|---|---|
| `regions_polygons.geojson` | 2,336 | 15.68 MB | MultiPolygon |
| `regions_centroids.geojson` | 2,336 | 0.89 MB | Point |

### `states_polygons.geojson` — the US state tier

A **separate collection**, not part of `regions_polygons`: 51 state polygons
dropped into that file would paint over the whole county choropleth (and
`LEVEL_PAINT_ORDER` has no entry for them). Built by `scripts/preprocess.js` from
`data/states_us.geojson` joined to county aggregates rolled up on `id.slice(0,2)`.

| File | Features | Size | Geometry |
|---|---|---|---|
| `states_polygons.geojson` | 51 | 0.74 MB (202 KB gz) | MultiPolygon |

Properties are the standard set plus `usps`, `name`, and `cx`/`cy`:

```json
{ "region": "Arizona", "name": "Arizona", "id": "04", "usps": "AZ",
  "country": "US", "level": "us_state",        // NOT "state" — MX already uses that
  "total": 607, "area_km2": 294207,
  "cx": -111.66, "cy": 34.29,                  // label/flyTo point, see below
  "a_total": 607, "a_counts": { "Arizona Cardinals": 103, "…": 0 },
  "a_dominant": "Arizona Cardinals", "a_dominant_pct": 0.1697 }
```

Three things worth knowing:

- **`id` is a zero-padded 2-char string.** It is the prefix of every county `id`,
  which is what lets one Mapbox expression (`["slice", ["get","id"], 0, 2]`) serve
  both the state and county sources.
- **`cx`/`cy` exist because Alaska crosses the antimeridian.** Its bbox is
  `[-180, 51, 180, 71]`, so a naive `fitBounds` on it zooms out to the whole
  planet, and a polygon-placed label lands mid-Pacific. `featureCentroid()` picks
  the largest ring, giving mainland AK (−152.7, 64.6).
- **Totals reconcile to `totals.json` minus territories.** Aggregation runs over
  the *pre-join* aggregates, so it keeps the ~10 counties whose Census names don't
  exist in GADM 4.1 (nine Alaska census-area resplits + Oglala Lakota SD). Puerto
  Rico and Guam have no state to sit in and are reported separately in the run log:
  `33,697 + 64 territory = 33,761 = by_country.US`.

Small parts (bbox diagonal < 2× the simplify tolerance) are pruned — Alaska drops
from 4,151 parts to 870 — while the Florida Keys, Channel Islands and Hawaii's
islands all survive. Area is measured on the raw geometry, before simplification.

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

### `h3_contest.json` — contested-ground hexagons

Built by `scripts/h3-contest.js` (`npm run h3:contest`, and part of `npm run
data`). Drives [contested.html](contested.html). **US only**: everywhere else the
survey resolves no finer than a province, and collapsing a province onto its
centroid would invent hexagons that describe the centroid rather than the fans.

36,445 of 39,115 US responses place at their ZIP centroid (2,439 have no ZIP,
231 have a ZIP GeoNames doesn't know). Each is binned at H3 resolutions 3, 4 and
5; the app ships all three so the size toggle is a repaint.

```json
{
  "meta": { "teams": 32, "resolutions": [3,4,5], "min_n": 25, "keep_n": 5,
            "us_rows": 39115, "placed": 36445,
            "unplaced": { "no_zip": 2439, "unknown_zip": 231, "unknown_team": 0 } },
  "resolutions": {
    "4": { "area_km2": 1770, "edge_km": 26.1, "cells": [
      { "h": "8429a41ffffffff", "n": 180, "label": "San Diego, CA", "places": 15,
        "contest": 0.9293, "effective": 25.04, "distinct": 31,
        "top_team": "Los Angeles Chargers", "top_share": 0.15, "lead": 0.0611,
        "counts": { "Los Angeles Chargers": 27, ... } } ] }
  }
}
```

Cells below `keep_n` (5) are dropped; cells below `min_n` (25) ship with `n` and
`label` only and render as context grey — the app's 25/50/100 threshold control
filters on `n` from there.

`contest` is Shannon entropy over the team mix divided by `ln(32)`, so 0 means
one team owns the hexagon and 1 is a perfectly even 32-way split. `effective` is
`e^H` — the number of teams the hexagon behaves like. Entropy carries a
**Miller–Madow correction** (`+(K−1)/2n`): plug-in entropy is biased *downward*
at small n, since 32 teams can't show up in 30 responses, which would otherwise
hand "most uniform" to whichever hexagon happened to be smallest.

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
