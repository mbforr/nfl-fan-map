# Data Contract & Pipeline (NFL Multi-Country Variant)

This build maps NFL fan responses across the whole world, with the aggregation level varying by country. Single-axis (each response picks one team). All aggregate outputs are flat files under `public/data/` produced from raw inputs under `data/`. Raw inputs (including the PII-bearing survey CSV) are gitignored; outputs are not.

---

## Domain

- **Survey**: each response is a single NFL team pick from a respondent who provided their country and as much sub-national location as they have (state/province + city, plus zip if applicable)
- **Categories**: the 32 NFL teams. Stable, well-known colors and stadium locations
- **Single-axis** — no parallel A/B group. (Other docs in this template mention two-axis; see "Implications for other docs" at the bottom)

---

## Geographic resolution policy

| Country | Aggregation level | Why |
|---|---|---|
| US | County | Most fans give a zip; counties are the readable unit at national zoom |
| Canada | Province | 13 provinces/territories; zip-equivalent (postal codes) is sparse in survey data |
| Mexico | State | 32 states; same reasoning |
| All others | Country | Long tail outside NA, too sparse for sub-national resolution |

This policy is **applied at preprocess time** — the runtime sees one homogeneous "region" polygon source, not a per-country switch. The app code doesn't need to know about the policy.

---

## Directory layout

```
data/                                    # PRIVATE — gitignored
  responses.csv                          (survey export — PII-bearing)

  # Boundary GeoJSONs (user supplies — assumed available)
  counties_us.geojson                    (US counties, ~3,200 features)
  provinces_ca.geojson                   (13 Canadian provinces / territories)
  states_mx.geojson                      (32 Mexican states)
  countries_world.geojson                (~250 features; Natural Earth or similar)

  # ZIP → county resolution for US (user supplies one of these)
  zip_county_crosswalk.csv               (HUD ZIP-to-County, preferred)
  # OR fall back to spatial join with:
  zcta_centroids.geojson                 (Census ZCTA centroid points)

public/data/                             # PUBLIC — tracked in git, served at runtime
  regions_polygons.geojson               (single combined polygon FC, mixed levels)
  regions_centroids.geojson              (matching point FC)
  category_a.json                        (32 NFL teams + colors + stadiums)
  totals.json                            (national rollup + meta totals)
```

The boundary files are domain-agnostic enough to be checked into the source dataset of a separate "reference geography" repo if you want — but for this build, drop them in `data/` and gitignore.

---

## Raw input — `data/responses.csv`

Required columns (header names can vary; the script reads by configured names):

| Column | Required | Notes |
|---|---|---|
| Country | yes | Free-text or dropdown ("United States", "USA", "US" all → US) |
| State/Province | when relevant | Free-text. For CA and MX, drives aggregation. For US, optional |
| City | optional | Captured for popup detail; not used for aggregation |
| Zip Code | optional, US-meaningful | Drives US county resolution |
| NFL Team | yes | The categorical answer (e.g. "Patriots", "Cowboys") |

Example:
```
Timestamp,Country,State/Province,City,Zip Code,NFL Team
4/20/2026,United States,CA,Los Angeles,90210,Rams
4/20/2026,Canada,ON,Toronto,,Bills
4/20/2026,Mexico,Jalisco,Guadalajara,,Cowboys
4/20/2026,Germany,,Berlin,,Patriots
```

Preprocessing normalizes every country to its ISO-3166-1 alpha-2 code. Rows that can't be resolved (unrecognized country, US with missing zip and no fallback, etc.) are skipped and counted in the phase-1 summary.

---

## Boundary file requirements

The user is supplying these. Each must have a stable identifier property used to join to aggregates:

| File | Stable ID property | Label property |
|---|---|---|
| `counties_us.geojson` | `GEOID` (5-digit FIPS) | `NAME`, `STUSPS` (state postal) |
| `provinces_ca.geojson` | `PRUID` or 2-letter postal code (`ON`, `BC`, …) | `PRNAME` or `NAME` |
| `states_mx.geojson` | state code or canonical name | `NAME` |
| `countries_world.geojson` | `ISO_A2` (preferred) | `NAME` / `ADMIN` |

If the user's files use different property names, the preprocess script's `joinTier` config holds the property-name mapping — keep that as the single place to adjust.

For `countries_world.geojson` from Natural Earth, prefer the file that ships `LABEL_X` / `LABEL_Y` cartographic label points — geometric centroids of large/fragmented countries (Russia, Indonesia, Norway) sit in unhelpful places.

---

## Aggregate output — `public/data/regions_polygons.geojson`

One combined FeatureCollection. Each feature carries a `level` property so the app could conditionally style by level if needed, but the default choropleth doesn't care.

```json
{
  "type": "Feature",
  "geometry": <Polygon | MultiPolygon>,
  "properties": {
    "region": "Wayne County, MI",
    "id": "26163",
    "country": "US",
    "level": "county",
    "total": 12,
    "a_total": 12,
    "a_counts": { "Lions": 8, "Bears": 2, "Packers": 2 },
    "a_dominant": "Lions",
    "a_dominant_pct": 0.6667
  }
}
```

Field notes:
- **`region`** is the popup label (renamed from the template's `zip`). Holds a county name (`"Wayne County, MI"`), province name (`"Ontario"`), state name (`"Jalisco"`), or country name (`"Germany"`) depending on level
- **`id`** is the stable join key — FIPS for US counties, postal code for CA provinces, ISO-2 for countries, etc. Useful for debugging and stable React keys
- **`country`** is always ISO-2 (`"US"`, `"CA"`, `"MX"`, `"DE"`, …)
- **`level`** is one of `"county"`, `"province"`, `"state"`, `"country"`
- **`a_*` prefix preserved** so the same Mapbox expressions in MAP.md work unchanged (group is hardcoded to `"a"` for single-axis surveys)
- **Features with zero responses are omitted** — no empty polygons

Tie handling for `a_dominant`: use the sentinel string `"__contested__"` when ≥2 teams share the top count in a region. Map it to `#808080` in the color expression.

---

## Aggregate output — `public/data/regions_centroids.geojson`

Same property shape with `Point` geometry. Used for:
- **Centroids view mode** — sized circles, radius scales with `sqrt(total)`
- **Arc origins** in single-team filter mode — arcs go from each region's centroid to the team's stadium
- **ViewportTop top-5 calculation** — JS iterates this in-memory dataset

Centroid algorithm:
- For Polygon: signed-area centroid
- For MultiPolygon: centroid of the largest ring by area
- For countries with `LABEL_X` / `LABEL_Y` in source data: prefer those (cartographic label points)

---

## Aggregate output — `public/data/category_a.json`

32 NFL teams, hardcoded in `seed-categories.py`. Shape:

```json
[
  {
    "short_name": "Patriots",
    "name": "New England Patriots",
    "group": "AFC East",
    "primary_color": "#002244",
    "secondary_color": "#C60C30",
    "poi": { "name": "Gillette Stadium", "lat": 42.0909, "lng": -71.2643 }
  }
]
```

`group` carries the AFC/NFC division. `short_name` must match exactly whatever value the survey uses (e.g., if the form says "New England Patriots" verbatim, use the full name as `short_name`). The seeding script reports any survey value with no metadata match to a `TODO.md` (placeholder color `#808080`).

POI coordinates are the team's primary home stadium. International series venues (Tottenham Stadium, Estadio Azteca, Allianz Arena) are not modeled — fans of a team based in Boston still arc to Gillette.

---

## Aggregate output — `public/data/totals.json`

```json
{
  "meta": {
    "total_rows": 6319,
    "valid_rows": 6275,
    "skipped_bad_country": 12,
    "skipped_no_region": 32,
    "unique_regions": 1842,
    "a_responses": 6275,
    "a_categories": 32,
    "by_country": { "US": 5832, "CA": 311, "MX": 87, "DE": 14, "GB": 21 }
  },
  "a": [ { "short_name": "Cowboys", "count": 612 }, ... ]
}
```

`by_country` is useful in the Counter / UI to show response distribution at a glance. The `a` array is sorted by `count` descending and drives the Legend top-N, TeamDropdown default sort, and ViewportTop label-collision priority.

---

## Preprocessing pipeline — `scripts/preprocess.js` (outline)

```js
function main() {
  const responses = loadResponses();             // data/responses.csv
  const zipToCounty = loadZipCountyCrosswalk();  // Map<zip, FIPS>

  const aggregates = new Map(); // key: `${country}:${level}:${id}` → bucket
  const skipped = { badCountry: 0, badZip: 0, noRegion: 0 };

  for (const row of responses) {
    const country = normalizeCountry(row.Country);
    if (!country) { skipped.badCountry++; continue; }

    const { level, id } = resolveRegion(country, row, zipToCounty);
    if (!id) { skipped.noRegion++; continue; }

    const key = `${country}:${level}:${id}`;
    const agg = aggregates.get(key) || { country, level, id, total: 0, a_counts: {} };
    agg.total += 1;
    const team = (row["NFL Team"] || "").trim();
    if (team) agg.a_counts[team] = (agg.a_counts[team] || 0) + 1;
    aggregates.set(key, agg);
  }

  // Compute dominants
  for (const [, agg] of aggregates) {
    const dom = dominantTeam(agg.a_counts);   // tie → "__contested__"
    agg.a_total = Object.values(agg.a_counts).reduce((s, n) => s + n, 0);
    agg.a_dominant = dom.team;
    agg.a_dominant_pct = Number(dom.pct.toFixed(4));
  }

  // Join to boundary files
  const polygons = [], centroids = [];
  joinTier(aggregates, polygons, centroids, {
    file: "counties_us.geojson", country: "US", level: "county",
    idProp: "GEOID", label: f => `${f.NAME} County, ${f.STUSPS}`,
  });
  joinTier(aggregates, polygons, centroids, {
    file: "provinces_ca.geojson", country: "CA", level: "province",
    idProp: "PRUID", label: f => f.PRNAME,
  });
  joinTier(aggregates, polygons, centroids, {
    file: "states_mx.geojson", country: "MX", level: "state",
    idProp: "STATE_CODE", label: f => f.NAME,
  });
  joinTier(aggregates, polygons, centroids, {
    file: "countries_world.geojson", country: "*", level: "country",
    idProp: "ISO_A2", label: f => f.NAME,
    preferLabelPoint: true,  // use LABEL_X/LABEL_Y instead of geometric centroid
  });

  writeGeoJSON("public/data/regions_polygons.geojson",  { features: polygons });
  writeGeoJSON("public/data/regions_centroids.geojson", { features: centroids });
  writeTotals(aggregates, skipped);
  printSummary(...);
}
```

### Country normalization

Recommended: `iso-3166-1` npm package, falling back to a hand-maintained Map for the common typos.

```js
import iso from "iso-3166-1";
const MANUAL = new Map([
  ["usa", "US"], ["u.s.", "US"], ["america", "US"], ["the united states", "US"],
  ["uk", "GB"], ["england", "GB"],
  // …
]);

function normalizeCountry(s) {
  if (!s) return null;
  const v = s.trim();
  const manual = MANUAL.get(v.toLowerCase());
  if (manual) return manual;
  return iso.whereAlpha2(v)?.alpha2
      || iso.whereAlpha3(v)?.alpha2
      || iso.whereCountry(v)?.alpha2
      || null;
}
```

### Region resolution per country

```js
function resolveRegion(country, row, zipToCounty) {
  if (country === "US") {
    const zip = padZip(row["Zip Code"]);
    if (zip) return { level: "county", id: zipToCounty.get(zip) || null };
    return { level: null, id: null };  // skip US-without-zip, OR add a state-tier fallback
  }
  if (country === "CA") {
    return { level: "province", id: normalizeCanadianProvince(row["State/Province"]) };
  }
  if (country === "MX") {
    return { level: "state", id: normalizeMexicanState(row["State/Province"]) };
  }
  return { level: "country", id: country };
}
```

`normalizeCanadianProvince` maps "Ontario" / "ON" / "Ont." → `"ON"` (13 entries, hand-coded). `normalizeMexicanState` similarly (32 states; INEGI canonical names).

### US fallback decision

US rows without a zip are the only meaningful edge case. Two options:
1. **Skip them** (default; counts go to `skipped.badZip` in the summary)
2. **Add a US-state tier** — write a `states_us.geojson` boundary file and resolve US-no-zip rows to state. Adds a fifth level but a clean fallback. Recommend this if >5% of US rows lack zip.

Document whichever choice you make in the summary output so it's auditable.

### ZIP → county resolution

**Preferred: HUD ZIP-to-County crosswalk** (`zip_county_crosswalk.csv`). Format includes `RES_RATIO` for zips that span counties — pick the row with the highest residential ratio.

**Fallback: spatial join** if you'd rather not maintain a crosswalk file:
```js
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
// for each zip centroid, find containing county polygon (bbox-prefilter then PIP)
```

The original template's `data/zcta_centroids.geojson` works as the zip-centroid source. Slower (~30s for 4k zips × 3.2k counties with bbox prefiltering) but no extra crosswalk file dependency.

---

## .gitignore

Use **explicit per-file paths** (not the bare `data/` directory pattern, which silently ignores `public/data/` too):

```
node_modules/
dist/
.env
.env.local
.env.*.local

# Raw inputs — PRIVATE
data/responses.csv
data/counties_us.geojson
data/provinces_ca.geojson
data/states_mx.geojson
data/countries_world.geojson
data/zip_county_crosswalk.csv
# (only if using fallback approach)
data/zcta_centroids.geojson

# Tooling temp dirs
**/_tmp_*/

# OS / editor
.DS_Store
.vscode/
.idea/
.claude
```

The aggregate outputs under `public/data/*` are intentionally NOT ignored — they're served by the deployed app and need to be in the repo for Vercel to find them.

---

## Implications for other template files

This is a **single-axis, multi-country** variant. When you read CLAUDE.md, MAP.md, and UI.md, apply these adjustments:

1. **No Group toggle.** Other docs describe an A/B group toggle for two-axis surveys. Here use `group = "a"` everywhere and don't render the Group toggle in Controls. All `${group}_*` references in MAP.md still work — they always resolve to `a_*`
2. **No Resolution toggle.** Other docs describe a Zip / County toggle. Here the aggregation level is intrinsic to each feature (varies by country), not toggleable. Remove the Resolution segmented control from Controls. The View toggle remains: Polygons / Centroids / POIs
3. **No Face-off.** Single-axis = no head-to-head. Drop the Faceoff component and the "Start a face-off →" button from Controls. (Or leave the code in but never expose the entry point — your call)
4. **Rename `zip` → `region`** in popup HTML. MAP.md shows the popup reading `props.zip` as the title; in this build the field is `props.region`. Same role, more accurate name
5. **One polygon source + one centroid source** instead of zip/county pairs. Update `addLayers` to register `SOURCE_POLYGONS` against `regions_polygons.geojson` and `SOURCE_CENTROIDS` against `regions_centroids.geojson`. Drop the county-paired layers (`LAYER_COUNTY_FILL`, `LAYER_COUNTY_OUTLINE`). The `setFillsAndOutlines` array helper becomes a 1-element loop, but you can keep it for parity
6. **POI view works as-is.** 32 NFL stadiums all in the US — same circle + label pattern from MAP.md. Tilt + camera unchanged
7. **Counter copy** — show `total_rows`, `unique_regions` (renamed from `unique_zips`), and optionally the top entry of `meta.by_country` (e.g., "5,832 from 🇺🇸, 311 from 🇨🇦, 87 from 🇲🇽")
