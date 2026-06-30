# NBA Fan Map — Compact Build Spec

One-file spec to recreate the choropleth-survey app (same design + UI as the NFL build) for an
**NBA** fan survey. Single-axis. Sparse data → aggregate by **country worldwide** and by **US state**
for now, with **US county** as a drop-in future tier. Read this whole file before writing code; the
NFL template's `MAP.md` / `UI.md` remain the long-form reference for any code detail not spelled out here.

---

## 1. What the app does (unchanged from template)

Static **Vite + React 18** SPA, **Mapbox GL JS 3.8** Standard style + globe projection, **Tailwind**,
`@turf/great-circle` for arcs, Node + `csv-parse` preprocessing, Python `seed-categories.py`.

Interactions, in priority order (`faceoff > single-team > dominant`):

1. **Dominant choropleth** — each region filled with the color of its top team.
2. **Single-team filter** — pick one team → its territory + great-circle arcs from each region centroid to the team's **arena**.
3. **POI view** — ~55° tilt, colored circle + label per arena.
4. **Top-5 in viewport** — sidebar recomputed on `moveend`.
5. **View toggle** — Polygons / Centroids / POIs.
6. **Face-off** — OPTIONAL for this single-axis build; recommend **omitting** initially (drop the component + entry button, keep the map expressions in `map.js` in case you re-enable). Full behavior in §6a.

**Dropped vs. the original two-axis template:** no Group (A/B) toggle, no Zip/County resolution toggle (level is intrinsic per feature — see §3), no Face-off by default.

---

## 2. NBA domain decisions

- **Project name / title:** "NBA Fan Map" (drives `<title>`, Controls title bar, survey CTA).
- **Categories:** the **30 NBA teams**. Stable brand colors + arena coordinates. `short_name` must match the survey's verbatim answer string exactly.
- **`group` field on each category:** the conference+division label (e.g. `"Atlantic"`, `"Pacific"`) — metadata only, not a UI toggle.
- **POI = arena.** UI keyword "Arenas" everywhere the template said "Stadiums". Arcs ON (each team has one arena).
- **Single-axis** → `group = "a"` hardcoded throughout; all `${group}_*` keys resolve to `a_*`.

---

## 3. Geographic resolution policy (the NBA-specific part)

Applied **at preprocess time**; the runtime sees one homogeneous `regions_polygons.geojson` + `regions_centroids.geojson`. The app code never branches on country.

| Country | Level now | ID property | Label |
|---|---|---|---|
| US | **state** | `STUSPS` (2-letter postal) or `GEOID` (2-digit FIPS) | state `NAME` |
| All others | **country** | `ISO_A2` | country `NAME` |

**County-later path (design for it now, don't build it):**
- Keep the per-feature `level` property (`"state" | "country" | "county"`).
- Adding counties = (a) supply `data/counties_us.geojson`, (b) add one more `joinTier(...)` call for US counties, (c) expose a **US-only Resolution toggle** (State / County) in Controls that swaps which US polygon set is visible. Because each feature already carries `level`, the toggle is a visibility/source switch, not a data-model change.
- Until then: **no resolution toggle rendered.** US rows resolve to state.

**Region resolution per row:**
```js
function resolveRegion(country, row) {
  if (country === "US") return { level: "state", id: normalizeUSState(row["State"]) }; // "CA"/"California"/"Calif." → "CA"
  return { level: "country", id: country };                                            // everyone else → country
}
```
`normalizeUSState` = hand-coded 50-state + DC map (name / postal / common abbrev → 2-letter). US rows with an unresolvable state are skipped and counted. (No zip handling needed yet — add it with the county tier.)

---

## 4. Data contract

### Inputs — `data/` (PRIVATE, gitignored)
```
data/responses.csv          survey export (PII-bearing)
data/states_us.geojson      50 states + DC          (id: STUSPS, label: NAME)
data/countries_world.geojson ~250 features          (id: ISO_A2, label: NAME; prefer Natural Earth file with LABEL_X/LABEL_Y)
# later: data/counties_us.geojson  (id: GEOID, label: `${NAME} County, ${STUSPS}`)
```

### `data/responses.csv` columns (read by configured names)
| Column | Required | Notes |
|---|---|---|
| Country | yes | free text; normalized to ISO-2 (`iso-3166-1` pkg + manual typo map) |
| State | US-meaningful | drives US aggregation; ignored for non-US |
| City | optional | popup detail only |
| NBA Team | yes | the categorical answer (e.g. "Lakers", "Celtics") |

Rows that can't resolve (bad country, US w/ unresolvable state) are skipped + counted in the summary.

### Outputs — `public/data/` (TRACKED in git, served at runtime)
```
regions_polygons.geojson    combined FC, mixed levels
regions_centroids.geojson   matching point FC
category_a.json             30 NBA teams + colors + arenas
totals.json                 national rollup + meta
```

**`regions_polygons.geojson` feature** (centroids = same props, Point geometry):
```json
{ "type":"Feature","geometry":<Polygon|MultiPolygon>,
  "properties":{
    "region":"California", "id":"CA", "country":"US", "level":"state",
    "total":42, "a_total":42,
    "a_counts":{"Lakers":20,"Warriors":18,"Kings":4},
    "a_dominant":"Lakers", "a_dominant_pct":0.4762 } }
```
- `region` = popup title (state name, or country name for non-US).
- `a_*` prefix kept so template Mapbox expressions work unchanged.
- Zero-response regions omitted. Tie → `a_dominant = "__contested__"` (→ `#808080`).
- Centroid: signed-area centroid (largest ring for MultiPolygon); for countries prefer source `LABEL_X/LABEL_Y`.

**`category_a.json`** (hardcoded in `seed-categories.py`; unmatched survey values → `TODO.md` w/ `#808080`):
```json
[{ "short_name":"Lakers","name":"Los Angeles Lakers","group":"Pacific",
   "primary_color":"#552583","secondary_color":"#FDB927",
   "poi":{"name":"Crypto.com Arena","lat":34.043,"lng":-118.267} }]
```

**`totals.json`:**
```json
{ "meta":{ "total_rows":0,"valid_rows":0,"skipped_bad_country":0,"skipped_no_region":0,
           "unique_regions":0,"a_responses":0,"a_categories":30,
           "by_country":{"US":0,"CA":0} },
  "a":[ {"short_name":"Lakers","count":0} ] }
```
`a` sorted desc by count → drives Legend top-N, dropdown sort, ViewportTop collision priority, POI rank.

### `scripts/preprocess.js` outline
Loop rows → `normalizeCountry` → `resolveRegion` → bucket by `${country}:${level}:${id}` into `{total, a_counts}` → compute `a_dominant`/`a_total`/`a_dominant_pct` → join to boundary files via `joinTier`, then write outputs + print summary.
```js
joinTier(aggregates, polygons, centroids, { file:"states_us.geojson",      country:"US", level:"state",   idProp:"STUSPS", label:f=>f.NAME });
joinTier(aggregates, polygons, centroids, { file:"countries_world.geojson", country:"*",  level:"country", idProp:"ISO_A2", label:f=>f.NAME, preferLabelPoint:true });
// later: joinTier(..., { file:"counties_us.geojson", country:"US", level:"county", idProp:"GEOID", label:f=>`${f.NAME} County, ${f.STUSPS}` });
```
`joinTier` config is the single place to fix property-name mismatches. Note in the summary which tiers ran (so county-vs-state is auditable later).

### `.gitignore` (explicit per-file — never bare `data/`, it would catch `public/data/`)
```
node_modules/
dist/
.env*
data/responses.csv
data/states_us.geojson
data/countries_world.geojson
data/counties_us.geojson
**/_tmp_*/
.DS_Store
.vscode/
.idea/
.claude
```
`public/data/*` is intentionally tracked.

---

## 5. Map (`src/map.js`) — condensed; full code in template `MAP.md`

**Create:** Standard style, `projection:"globe"`, `center:[-98,39]`, `zoom:3.4`, `minZoom:1.5`, `maxZoom:10`. Lower `minZoom` than the NFL build so the globe reads at world scale (data is global). NavigationControl top-right, no compass.

**Sources (4 — dropped the county/zip pair):**
```
SOURCE_POLYGONS  = "regions-polygons"   → regions_polygons.geojson
SOURCE_CENTROIDS = "regions-centroids"  → regions_centroids.geojson
SOURCE_ARCS      = "arcs"               → empty FC
SOURCE_POIS      = "pois"               → empty FC
```
Centroids stay GeoJSON (arc gen + ViewportTop iterate it in memory).

**Layers (all `slot:"middle"`):** `LAYER_FILL`, `LAYER_OUTLINE`, `LAYER_CIRCLE`, `LAYER_ARCS`, `LAYER_POIS_CIRCLE`, `LAYER_POIS_LABEL`. `setFillsAndOutlines` collapses to a 1-element loop (one polygon source); keep the helper shape so the county tier slots in later. Paint values (fill-opacity 0.7, white outlines, sqrt-scaled circle radius, POI circle/label, arc opacity-by-count) are identical to `MAP.md` §Layers.

**Expressions** (`group` always `"a"`):
- `countExpr = (g,t) => ["coalesce", ["get", t, ["get", `${g}_counts`]], 0]`
- Dominant color = `["match", ["get","a_dominant"], ...team→color..., "__contested__","#808080", "#CCCCCC"]`; filter `["!=",["get","a_dominant"],null]`.
- Single-team: filter `[">=", countExpr("a",team), 1]`, fill = team `primary_color`, build arcs to arena.
- Face-off expressions present but unused (no entry point).

**Arcs:** `buildTeamArcs(centroidsFC,"a",team,arena,color)` — great circle (64 npoints) from each region centroid with a nonzero count to the arena; stamp `maxCount` for opacity normalization.

**POI tilt:** `applyViewMode(map, viewMode)` toggles layer visibility and eases pitch to `55` for `"pois"`, else `0`. (No `resolution` arg until the county tier exists.)

**Popup:** title = `props.region`, then total + top-3 teams (count + %). Reads `a_counts` defensively (object or JSON-string).

**Basemap swap:** `setBasemap` → `setStyle` → on `style.load` rebuild: `addLayers → setPois → applyViewMode → bindInteractions → re-apply current filter mode`. `BASEMAPS = { standard, light }`.

**config.js:** `CENTROID_RADIUS_SCALE=2.5, _MIN=3, _MAX=22, NO_DATA_COLOR="#CCCCCC", CONTESTED_COLOR="#808080"`.

---

## 6. UI — condensed; full code in template `UI.md`

`App.jsx` orchestrator + 4 floating panels (all `z-10`, wrapper `pointer-events-none`, card `pointer-events-auto`, `bg-white/95 rounded-lg shadow-lg backdrop-blur`).

| Panel | Position | Mobile `<md` |
|---|---|---|
| `Controls` | top-left `min-w-[16rem]` | full-width top, collapsed |
| `Counter` | top-right | hidden |
| `ViewportTop` | upper-right `w-56` | hidden |
| `Legend` | bottom-right | collapsed |

**App state (trimmed to single-axis):**
```js
const [aCategories,setACategories]=useState([]);
const [totals,setTotals]=useState({meta:null,a:[]});
const [viewMode,setViewMode]=useState("polygons");      // polygons | centroids | pois
const [selectedTeam,setSelectedTeam]=useState(null);
const [basemap,setBasemapKey]=useState(DEFAULT_BASEMAP);
// no group, no resolution, no faceoff state (until those tiers/modes return)
```
Effects: mount-fetch + create map + `applyViewMode(map,"polygons")`; filter-mode effect (`selectedTeam ? applyTeamFilter : applyDominant`); view-mode effect; POI-data effect; basemap-swap effect. Centroids stashed in a `useRef` for the rebuild closure.

**Controls.jsx** sections: title bar (project name + chevron, top-border accent in selected team color) → **View toggle** (Polygons/Centroids/POIs) → **TeamDropdown** → **Basemap toggle** → **Survey CTA** (external link, new tab). No Group toggle, no Resolution toggle, no Face-off button. `useInitialOpen` = expanded ≥768px, collapsed below. Reuse the `SegmentedToggle` sub-component verbatim.

**TeamDropdown.jsx:** searchable combobox; merges `count` from totals, sorts desc by count; color swatch + `short_name` + count; arrow/enter/esc; clear (×); click-outside closes. Menu `absolute z-20 max-h-72 overflow-y-auto` — keep Controls non-scrolling so it isn't clipped.

**ViewportTop.jsx:** `moveend` → tally `a_counts` for centroids inside bounds → top-5 horizontal bars + "N regions in view". Header "Top teams in view". `hidden md:block`.

**Legend.jsx:** no selection → top-10 from `totals` (swatch + count); team selected → that team's swatch + "X responses worldwide". Collapsed on mobile.

**Counter.jsx:** `meta.total_rows` responses from `meta.unique_regions` regions; optionally append top `meta.by_country` entries ("5,832 🇺🇸 · 311 🇨🇦"). `hidden md:block`.

**Color tokens:** `primary_color` drives fill/circle/arc/marker; `CONTESTED_COLOR=#808080`, `NO_DATA_COLOR=#CCCCCC`, `TIE_COLOR=#6b7280`. Text/borders = `gray-*`.

**index.html:** `<body class="m-0 p-0 overflow-hidden">`, root `relative h-screen w-screen`, map container `absolute inset-0`.

---

## 6a. Face-off (optional — off by default)

Two-team head-to-head: pick Team A + Team B, the map recolors every contested region by which team
leads there, and a scoreboard panel tallies the matchup. It's the highest-priority map mode
(`faceoff > single-team > dominant`). **Disabled by default** for this build (see §1) — wired but with no
UI entry point. Turn it on by restoring the state below + the "Start a face-off →" button in Controls.

### Map coloring (`map.js` — expressions already present)

`applyFaceoff(map, "a", teamA, teamB, colorA, colorB)`:
- **Filter** — show only regions where either team has ≥1 response: `[">=", ["+", countExpr("a",A), countExpr("a",B)], 1]`.
- **Fill / circle color** — `case`: A's count > B's → `colorA`; B's > A's → `colorB`; equal → `TIE_COLOR (#6b7280)`.
- **Circle radius** — `sqrt(countA + countB)`, same clamp as the other modes (combined volume, not the winner's alone).
- **Arcs cleared** — two teams' worth of arcs would be visual clutter, so face-off shows none.

### Scoreboard (`Faceoff.jsx`)

Lives **inside Controls**, replacing the single `TeamDropdown` when active. UX flow:
1. Default state shows a small **"Start a face-off →"** button where the picker would be.
2. Click → two `TeamDropdown`s (`label="Team A"` / `label="Team B"`) + an **"Exit"** link. Each picker's `teams` prop **excludes the other side's pick** so a team can't face itself.
3. Once both are chosen → a scoreboard appears below.

Scoreboard math runs in a `useMemo` over the centroids FeatureCollection (`a_counts` per region):
```jsx
function compute(centroids, group, a, b) {
  let aWins=0,bWins=0,tied=0, aExclusive=0,bExclusive=0,overlap=0, aTotal=0,bTotal=0;
  const key = `${group}_counts`;                 // "a_counts"
  for (const f of centroids.features) {
    const c = f.properties[key]; if (!c) continue;
    const ac = c[a]||0, bc = c[b]||0;
    if (ac===0 && bc===0) continue;
    aTotal+=ac; bTotal+=bc;
    if (ac>0 && bc===0) aExclusive++;            // regions only A appears in
    if (bc>0 && ac===0) bExclusive++;            // regions only B appears in
    if (ac>0 && bc>0)   overlap++;               // both appear (contested)
    if      (ac>bc) aWins++;                     // A leads this region
    else if (bc>ac) bWins++;                     // B leads
    else            tied++;                      // equal counts
  }
  return { aWins,bWins,tied, aExclusive,bExclusive,overlap, aTotal,bTotal };
}
```

Each team row reads (NBA wording — "regions" not "zips"):
```
[●] Lakers                                               [LEADS]
    287 regions won  ·  145 uncontested  ·  1,234 responses
```
- `regions won` = that team's `aWins`/`bWins`; `uncontested` = its `aExclusive`/`bExclusive`; `responses` = `aTotal`/`bTotal`.
- Below the two rows: **Overlap** (`overlap`) and **Tied** (`tied`) region counts. "uncontested" carries a `title` tooltip explaining the term.
- The **`LEADS`** badge renders in the leading team's `primary_color` (whichever has more `wins`).

### State + wiring (App.jsx, when re-enabled)
```js
const [faceoffActive,setFaceoffActive]=useState(false);
const [faceoffA,setFaceoffA]=useState(null);
const [faceoffB,setFaceoffB]=useState(null);
const isFaceoff = faceoffActive && !!(faceoffA && faceoffB);
```
- Filter-mode effect priority: `isFaceoff → applyFaceoff` ; else `selectedTeam → applyTeamFilter` ; else `applyDominant`.
- Activating face-off clears `selectedTeam` (mutually exclusive modes), and vice-versa.

---

## 7. Implementation order

1. Confirm CSV columns + arena coordinate source; confirm Face-off stays off and county tier is deferred.
2. Scaffold (fork NFL repo is fastest) — Vite + React + Tailwind, install `mapbox-gl @turf/great-circle csv-parse iso-3166-1`.
3. Drop `responses.csv`, `states_us.geojson`, `countries_world.geojson` into `data/`.
4. Write `seed-categories.py` (30 teams + colors + arenas → `category_a.json`).
5. Write `preprocess.js` (§4) → emit `public/data/*`.
6. Build `map.js`, `App.jsx`, UI components per §5–6.
7. Manual test: dominant choropleth → single-team filter + arcs → POI tilt → mobile layout.
8. Deploy to Vercel; set `VITE_MAPBOX_TOKEN` in env; commit `public/data/*` aggregates.

---

## 8. Naming map (vs. original two-axis template)

| Template term | This build |
|---|---|
| `team` / category | NBA team (`short_name`) |
| `fbs`/`fcs`, group A/B | single axis, `group="a"` only |
| `stadium` / `poi` | **arena** |
| `zip` (popup field) | `region` |
| Zip/County resolution toggle | **none now**; State/County (US-only) when county tier lands |
| "Top FBS nationally" | "Top teams in view" / "responses worldwide" |
