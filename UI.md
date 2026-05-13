# UI Components

The app has one top-level orchestrator (`App.jsx`) and five floating panel components, all positioned absolutely over the map. State lives in App; panels are pure (props-only) except for their own collapse state.

---

## Panel layout

| Component | Desktop position | Mobile (`< md`) | Default state |
|---|---|---|---|
| `Controls` | top-left, `min-w-[16rem]` | full-width across the top | collapsed on mobile via `useInitialOpen` |
| `Counter` | top-right of info | **hidden** | desktop-only |
| `ViewportTop` | upper-right, `w-56` | **hidden** | desktop-only |
| `Legend` | bottom-right | bottom-right, collapsed | collapsed on mobile |
| `Faceoff` | inside `Controls` (replaces single team picker) | same | hidden until activated |

All panels use `z-10`, `pointer-events-none` on the wrapper + `pointer-events-auto` on the actual card so clicks pass through to the map in the empty corners.

```jsx
// Wrapper pattern every panel uses
<div className="pointer-events-none absolute top-4 right-4 z-10">
  <div className="pointer-events-auto rounded-lg bg-white/95 shadow-lg backdrop-blur">
    {/* panel content */}
  </div>
</div>
```

---

## App.jsx — state model

```jsx
// Data
const [aCategories, setACategories] = useState([]);
const [bCategories, setBCategories] = useState([]);   // only for two-axis surveys
const [totals, setTotals] = useState({ meta: null, a: [], b: [] });

// UI state
const [group, setGroup]               = useState("a");
const [viewMode, setViewMode]         = useState("polygons");   // polygons | centroids | pois
const [resolution, setResolution]     = useState("county");
const [selectedTeam, setSelectedTeam] = useState(null);
const [basemap, setBasemapKey]        = useState(DEFAULT_BASEMAP);

const [faceoffActive, setFaceoffActive] = useState(false);
const [faceoffA, setFaceoffA]           = useState(null);
const [faceoffB, setFaceoffB]           = useState(null);
const isFaceoff = faceoffActive && !!(faceoffA && faceoffB);

// Derived
const activeCategories = group === "a" ? aCategories : bCategories;
const activeTotals     = group === "a" ? totals.a : totals.b;
const selectedTeamMeta = activeCategories.find(c => c.short_name === selectedTeam) || null;
```

Effects:

1. **Mount** — fetch all `public/data/*` files in parallel, create the map, call `addLayers`, call `applyViewMode(map, "polygons", "county")` for the initial render, then `setReady(true)`
2. **Filter mode effect** — triggers `applyFaceoff` / `applyTeamFilter` / `applyDominant` based on state priority. Depends on: `[ready, isFaceoff, faceoffA, faceoffB, selectedTeam, selectedTeamMeta, group, activeCategories]`
3. **View mode + resolution effect** — calls `applyViewMode(map, viewMode, resolution)`. Depends on `[viewMode, resolution, ready]`
4. **POI data effect** — calls `setPois(map, buildPoisFC(activeCategories, activeTotals))`. Depends on `[ready, activeCategories, activeTotals]`
5. **Basemap swap effect** — calls `setBasemap(map, basemap, rebuildCallback)`. The callback re-applies all current state to the freshly-styled map
6. **Group change side-effect** — clear `selectedTeam`, `faceoffA`, `faceoffB` because category metadata differs
7. **Face-off activation side-effect** — when `faceoffActive` flips to true, clear `selectedTeam` (mutually exclusive modes)

Centroid data is also stashed in a `useRef` so the basemap-rebuild closure has it without depending on rerenders.

`divisionRef.current = group` is kept in a ref so `bindInteractions`'s click handler reads the current group at click-time without re-binding on every toggle.

---

## Controls.jsx

A collapsible card with these sections, in order:

1. **Title bar** (always visible) — project name + chevron toggle
2. **Group toggle** (only if two-axis) — segmented control: "A" / "B" (whatever the user wants to call them)
3. **View toggle** — segmented: Polygons / Centroids / POIs
4. **Resolution toggle** — only renders when `viewMode === "polygons"`. Segmented: Zip / County
5. **Team picker** — `<TeamDropdown>` when face-off is off, `<Faceoff>` when on
6. **Basemap toggle** — segmented over `BASEMAPS` keys
7. **Survey CTA** — external link button at the bottom (`target="_blank" rel="noopener noreferrer"`)

```jsx
// Collapse defaults to expanded on desktop, collapsed on mobile.
// Same pattern used by Legend.
function useInitialOpen() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = (e) => setOpen(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return [open, setOpen];
}
```

Accent: when a team is selected, the title bar gets a 3px top border in the team's `primary_color`:
```jsx
const accentStyle = accentColor ? { borderTopColor: accentColor, borderTopWidth: "3px" } : {};
```

### `SegmentedToggle` sub-component

```jsx
function SegmentedToggle({ label, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
        {options.map(opt => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={
                "px-3 py-1.5 text-sm rounded transition-colors " +
                (active ? "bg-white text-gray-900 shadow-sm font-medium"
                        : "text-gray-600 hover:text-gray-900")
              }
            >{opt.label}</button>
          );
        })}
      </div>
    </div>
  );
}
```

---

## TeamDropdown.jsx

Searchable combobox over a category list. Props: `teams, totals, group, selected, onSelect, label?, placeholder?`.

- Merges in `count` from `totals` and sorts desc by count, asc by name on ties
- Filter input filters by `short_name` substring (case-insensitive)
- Arrow keys move highlight; Enter selects; Esc closes
- Each row: color swatch + `short_name`, count on the right
- Clear button (×) when a value is selected — calls `onSelect(null)`
- Click-outside closes via a `mousedown` document listener

The dropdown menu is `position: absolute; z-20; max-h-72; overflow-y-auto`. 288px of scrollable height.

---

## Faceoff.jsx

Two-team head-to-head, replaces the single TeamDropdown in Controls when activated.

UX flow:
1. Default: a tiny "Start a face-off →" button shown below where the regular picker would be
2. Click → renders two TeamDropdowns (`label="Team A"`, `label="Team B"`) + an "Exit" link
3. Each picker's `teams` prop **excludes** the other side's selection so you can't pick a team against itself
4. When both teams are picked → a scoreboard appears below the pickers

Scoreboard math is computed in `useMemo` from the centroids GeoJSON:

```jsx
function compute(centroids, group, a, b) {
  let aWins=0, bWins=0, tied=0;
  let aExclusive=0, bExclusive=0, overlap=0;
  let aTotal=0, bTotal=0;
  const key = `${group}_counts`;
  for (const f of centroids.features) {
    const c  = f.properties[key];
    if (!c) continue;
    const ac = c[a] || 0;
    const bc = c[b] || 0;
    if (ac === 0 && bc === 0) continue;
    aTotal += ac; bTotal += bc;
    if (ac > 0 && bc === 0) aExclusive++;
    if (bc > 0 && ac === 0) bExclusive++;
    if (ac > 0 && bc > 0)   overlap++;
    if      (ac > bc) aWins++;
    else if (bc > ac) bWins++;
    else tied++;
  }
  return { aWins, bWins, tied, aExclusive, bExclusive, overlap, aTotal, bTotal };
}
```

Each team row reads:
```
[●] Michigan                                              [LEADS]
    287 zips won  ·  145 uncontested  ·  1,234 responses
```

Below: Overlap zips + Tied zips counts. "Uncontested" carries a `title` tooltip explaining the term.

The `LEADS` badge appears in the team's `primary_color` when that team has more `wins`.

---

## ViewportTop.jsx

Right-side panel showing top 5 categories within the current viewport. Subscribes to map `moveend`:

```jsx
useEffect(() => {
  if (!map || !centroids) return;
  const countsKey = `${group}_counts`;

  function recompute() {
    const b = map.getBounds();
    const w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
    const tally = new Map();
    let zips = 0;
    for (const f of centroids.features) {
      const [lng, lat] = f.geometry.coordinates;
      if (lng < w || lng > e || lat < s || lat > n) continue;
      const counts = f.properties[countsKey];
      if (!counts) continue;
      zips += 1;
      for (const team in counts) {
        tally.set(team, (tally.get(team) || 0) + counts[team]);
      }
    }
    const sorted = [...tally.entries()].sort((a,b) => b[1]-a[1]).slice(0, 5);
    setTop5(sorted.map(([name, count]) => ({ name, count })));
    setInView(zips);
  }
  recompute();
  map.on("moveend", recompute);
  return () => { map.off("moveend", recompute); };
}, [map, centroids, group]);
```

Renders top 5 with a horizontal bar where width = `count / max(count)`. The header shows "Top {GROUP} in view" + "N zips in view".

Hidden on `< md` via `hidden md:block`.

---

## Legend.jsx

Bottom-right collapsible card. Two modes based on `selectedTeam`:

- **No selection**: list the top 10 categories from `totals` with color swatch + count
- **Selected team**: show only that team's swatch, name, and "X responses nationally"

Mobile: starts collapsed via the same `useInitialOpen` pattern as Controls.

---

## Counter.jsx

Tiny meta info card at top-right. Reads `totals.meta`:

```jsx
<div className="rounded-lg bg-white/95 px-3 py-2 text-xs shadow backdrop-blur">
  <span className="font-medium">{meta.total_rows.toLocaleString()}</span>
  <span className="text-gray-500"> responses from </span>
  <span className="font-medium">{meta.unique_zips.toLocaleString()}</span>
  <span className="text-gray-500"> zips</span>
</div>
```

Hidden on `< md` via `hidden md:block`.

---

## Color tokens

- `primary_color` — per category, the canonical brand color. Drives map fill, circle, arc, marker. Used directly in Tailwind via `style={{ background: color }}`.
- `secondary_color` — optional, mostly unused in the UI. Available if you want a 2nd accent
- `CONTESTED_COLOR = "#808080"` — choropleth dominant-tie color
- `NO_DATA_COLOR = "#CCCCCC"` — fallback when a category isn't in the lookup
- `TIE_COLOR = "#6b7280"` — face-off tie color

Tailwind palette: stick to `gray-*` for text/borders and team primary colors for everything categorical.

---

## Index.html / styles

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{Project Name}</title>
  </head>
  <body class="m-0 p-0 overflow-hidden">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`overflow-hidden` on body prevents page scroll, so the map is the only scrollable surface (good — Mapbox handles its own gestures).

App root is `relative h-screen w-screen`; map container is `absolute inset-0`.

---

## Survey CTA

Always at the bottom of the expanded Controls. External link, opens in new tab:

```jsx
<a
  href={SURVEY_URL}
  target="_blank"
  rel="noopener noreferrer"
  className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 hover:border-gray-300 hover:bg-white"
>
  Add your response
  <svg ... external-link icon ... />
</a>
```

---

## Page structure (App.jsx render)

```jsx
return (
  <div className="relative h-screen w-screen">
    <div ref={mapContainer} className="absolute inset-0" />
    {ready && !error && (
      <>
        <Controls ... />
        <Counter meta={totals.meta} />
        <ViewportTop map={mapRef.current} centroids={dataRef.current.centroids} group={group} categories={activeCategories} />
        <Legend group={group} totals={activeTotals} categories={activeCategories} selectedTeam={selectedTeam} />
      </>
    )}
    {!ready && !error && <div className="absolute top-4 left-4 ...">Loading map data…</div>}
    {error && <div className="absolute top-4 left-4 ... text-red-800">Error: {error}</div>}
  </div>
);
```

Faceoff is rendered inside Controls; it doesn't get composed at App level.

---

## Things to avoid

- **Don't add a Resolution toggle inside an `overflow-y-auto` parent.** TeamDropdown's menu is `absolute` and gets clipped if a scrolling ancestor exists. The team-pickers must live in a non-scrolling Controls panel; if you need height capping, do it some other way (e.g., paginate the categories list).
- **Don't ignore the `data/` directory pattern in gitignore without anchoring.** Bare `data/` matches `public/data/` too. Use explicit per-file rules (`data/responses.csv`) or a leading slash (`/data/`).
- **Don't try to share the categories list between two-axis groups.** Each group has its own metadata file (`category_a.json`, `category_b.json`) so colors / POIs / groupings can differ.
- **Don't fetch the polygon GeoJSONs as anything other than full files.** Tried PMTiles, rolled back — wasn't worth the complexity at this dataset size. If your dataset is much larger and you really need tiling, the original repo's git history has the working PMTiles wiring; revert that commit.
