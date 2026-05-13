# Mapbox Patterns

All map logic lives in `src/map.js`. It exports map-mutation functions that `App.jsx` calls in response to state changes. App.jsx never reaches into Mapbox internals directly.

The patterns assume Mapbox **Standard** style + globe projection. Standard's `slot: "middle"` API places custom layers under labels/POIs but over the basemap fill.

---

## Map creation

```js
import mapboxgl from "mapbox-gl";

export function createMap(container) {
  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const map = new mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/standard",
    center: [-96.5, 39.0],
    zoom: 3.6,
    minZoom: 2.5,
    maxZoom: 12,
    projection: "globe",
  });
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
  return map;
}
```

Globe projection makes great-circle arcs render as curves naturally. The viewport defaults frame the CONUS at zoom 3.6.

---

## Sources (5 total)

```js
export const SOURCE_POLYGONS   = "zcta-polygons";
export const SOURCE_CENTROIDS  = "zcta-centroids";
export const SOURCE_COUNTIES   = "county-polygons";
export const SOURCE_ARCS       = "team-arcs";
export const SOURCE_POIS       = "pois";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

map.addSource(SOURCE_POLYGONS,  { type: "geojson", data: polygonsGeoJSON });
map.addSource(SOURCE_CENTROIDS, { type: "geojson", data: centroidsGeoJSON });
map.addSource(SOURCE_COUNTIES,  { type: "geojson", data: countiesGeoJSON || EMPTY_FC });
map.addSource(SOURCE_ARCS,      { type: "geojson", data: EMPTY_FC });
map.addSource(SOURCE_POIS,      { type: "geojson", data: EMPTY_FC });
```

Centroids stay GeoJSON (not tiles) because three consumers iterate the in-memory dataset directly: arc generation, the ViewportTop top-5 calculation, and the Faceoff scoreboard math. The polygon files were tried as PMTiles and rolled back — adds significant complexity for marginal savings at this dataset size.

---

## Layers (7 total)

```js
export const LAYER_FILL              = "zip-fill";
export const LAYER_OUTLINE           = "zip-outline";
export const LAYER_CIRCLE            = "zip-centroid-circle";
export const LAYER_COUNTY_FILL       = "county-fill";
export const LAYER_COUNTY_OUTLINE    = "county-outline";
export const LAYER_ARCS              = "team-arcs";
export const LAYER_POIS_CIRCLE       = "pois-circle";
export const LAYER_POIS_LABEL        = "pois-label";

// Fill + outline layers come in zip + county pairs — every paint/filter
// update hits both, then visibility is toggled by Resolution toggle.
const POLYGON_FILL_LAYERS    = [LAYER_FILL,    LAYER_COUNTY_FILL];
const POLYGON_OUTLINE_LAYERS = [LAYER_OUTLINE, LAYER_COUNTY_OUTLINE];

// Helper: every applyXxx function calls this with whatever expression they
// want applied across all polygon layers.
function setFillsAndOutlines(map, color, filter) {
  for (const id of POLYGON_FILL_LAYERS) {
    map.setPaintProperty(id, "fill-color", color);
    map.setFilter(id, filter);
  }
  for (const id of POLYGON_OUTLINE_LAYERS) {
    map.setFilter(id, filter);
  }
}
```

All layers use `slot: "middle"`. The zip-* layers are visible by default; county-* and pois-* start with `layout: { visibility: "none" }` and are toggled by `applyViewMode` based on the current viewMode + resolution state.

Fill layer paint:
```js
{ "fill-color": colorExpr, "fill-opacity": 0.7 }
```

County outline is slightly bolder than zip outline (county boundaries deserve more weight):
```js
// zip
{ "line-color": "#ffffff", "line-width": 0.3, "line-opacity": 0.6 }
// county
{ "line-color": "#ffffff", "line-width": 0.5, "line-opacity": 0.65 }
```

Centroid circle (zip only) paint, with `circle-radius` driven by an expression that scales with the relevant count:
```js
{
  "circle-color": colorExpr,
  "circle-opacity": 0.85,
  "circle-stroke-color": "#ffffff",
  "circle-stroke-width": 0.8,
  "circle-radius": dominantRadiusExpr,
}
```

POI circle + label (visible only in POI view):
```js
// circle
{
  "circle-color": ["coalesce", ["get", "color"], "#000000"],
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 6, 7, 10, 11],
  "circle-stroke-color": "#ffffff",
  "circle-stroke-width": 1.5,
  "circle-opacity": 0.95,
  "circle-pitch-alignment": "map",
}

// label (symbol layer)
{
  "text-field": ["get", "short_name"],
  "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
  "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 13, 12, 16],
  "text-offset": [0, -1.4],
  "text-anchor": "bottom",
  "text-optional": true,
  // higher national rank wins the collision contest
  "symbol-sort-key": ["-", 0, ["coalesce", ["get", "rank"], 0]],
}
{
  "text-color": "#111827",
  "text-halo-color": "#ffffff",
  "text-halo-width": 1.5,
}
```

Arcs (line layer):
```js
{
  "line-cap": "round",
  "line-join": "round",
}
{
  "line-color": ["coalesce", ["get", "color"], "#000000"],
  // Opacity scales 0.15–0.9 by per-feature count / dataset max
  "line-opacity": [
    "max", 0.15,
    ["min", 0.9, ["*", 0.9, ["/", ["get", "count"], ["get", "maxCount"]]]]
  ],
  "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 6, 1.0, 10, 1.6],
}
```

---

## Expressions

### `countExpr` helper

The single place that reads a category's count from a feature. All other expressions compose this.

```js
const countExpr = (group, team) =>
  ["coalesce", ["get", team, ["get", `${group}_counts`]], 0];
```

`["get", key, object]` is the 3-arg form that reads a key out of a property object — works for GeoJSON sources. For vector-tile sources, nested objects don't survive tippecanoe's encoding, so if you ever need to switch to tiles you'd flatten counts into per-team scalar props (`f_Michigan: 2`, `c_Yale: 1`) and change `countExpr` to `["coalesce", ["get", \`f_${team}\`], 0]`. See the project history for the rationale.

### Dominant (default choropleth)

```js
function buildDominantColorExpression(categories, group) {
  const expr = ["match", ["get", `${group}_dominant`]];
  for (const c of categories) {
    if (!c.short_name || !c.primary_color) continue;
    expr.push(c.short_name, c.primary_color);
  }
  expr.push("__contested__", "#808080"); // tie sentinel → gray
  expr.push("#CCCCCC");                  // fallback if dominant not in lookup
  return expr;
}

const dominantFilter = (group) => ["!=", ["get", `${group}_dominant`], null];

const dominantRadius = () => [
  "max", MIN_RADIUS,
  ["min", MAX_RADIUS, ["*", SCALE, ["sqrt", ["get", "total"]]]]
];
```

### Single-category filter (with arcs)

```js
const teamFilter = (group, teamName) => [">=", countExpr(group, teamName), 1];

const teamRadius = (group, teamName) => [
  "max", MIN_RADIUS,
  ["min", MAX_RADIUS, ["*", SCALE, ["sqrt", countExpr(group, teamName)]]]
];

// Color is just the team's primary color (no match expression — all
// matching zips render in that color, full opacity).
export function applyTeamFilter(map, group, teamName, teamColor, centroidsFC, poi) {
  const filter = teamFilter(group, teamName);
  const color = teamColor || "#CCCCCC";
  setFillsAndOutlines(map, color, filter);
  map.setPaintProperty(LAYER_CIRCLE, "circle-color", color);
  map.setPaintProperty(LAYER_CIRCLE, "circle-radius", teamRadius(group, teamName));
  map.setFilter(LAYER_CIRCLE, filter);
  setArcs(map, buildTeamArcs(centroidsFC, group, teamName, poi, color));
}
```

### Face-off (head-to-head)

```js
const TIE_COLOR = "#6b7280";

function faceoffFilter(group, a, b) {
  return [">=", ["+", countExpr(group, a), countExpr(group, b)], 1];
}

function faceoffColor(group, a, b, colorA, colorB) {
  return [
    "case",
    [">", countExpr(group, a), countExpr(group, b)], colorA || "#CCCCCC",
    [">", countExpr(group, b), countExpr(group, a)], colorB || "#CCCCCC",
    TIE_COLOR
  ];
}

function faceoffRadius(group, a, b) {
  return [
    "max", MIN_RADIUS,
    ["min", MAX_RADIUS,
      ["*", SCALE, ["sqrt", ["+", countExpr(group, a), countExpr(group, b)]]]
    ]
  ];
}

export function applyFaceoff(map, group, a, b, colorA, colorB) {
  setFillsAndOutlines(map, faceoffColor(group, a, b, colorA, colorB), faceoffFilter(group, a, b));
  map.setPaintProperty(LAYER_CIRCLE, "circle-color", faceoffColor(...));
  map.setPaintProperty(LAYER_CIRCLE, "circle-radius", faceoffRadius(group, a, b));
  map.setFilter(LAYER_CIRCLE, faceoffFilter(group, a, b));
  clearArcs(map); // face-off arcs would be visually cluttered
}
```

---

## Great-circle arcs

```js
import { greatCircle } from "@turf/great-circle";

export function buildTeamArcs(centroidsFC, group, teamName, poi, color) {
  if (!poi || !teamName || !centroidsFC) return EMPTY_FC;
  const countsKey = `${group}_counts`;
  const dest = [poi.lng, poi.lat];
  const features = [];
  let maxCount = 0;

  for (const f of centroidsFC.features) {
    const c = f.properties[countsKey]?.[teamName];
    if (!c) continue;
    if (c > maxCount) maxCount = c;
    const origin = f.geometry.coordinates;
    if (origin[0] === dest[0] && origin[1] === dest[1]) continue;
    const arc = greatCircle(origin, dest, { npoints: 64 });
    arc.properties = { count: c, color };
    features.push(arc);
  }
  // Normalize against the dataset max for opacity scaling
  for (const f of features) f.properties.maxCount = maxCount || 1;
  return { type: "FeatureCollection", features };
}

export function setArcs(map, fc) {
  map.getSource(SOURCE_ARCS)?.setData(fc || EMPTY_FC);
}

export function clearArcs(map) { setArcs(map, EMPTY_FC); }
```

64 npoints per arc is plenty for smooth curves. The `maxCount` is stamped on every feature so the line-opacity expression can normalize per-render.

---

## POI markers + tilt view

```js
export function buildPoisFC(categories, totals) {
  const totalsByName = new Map((totals || []).map(t => [t.short_name, t.count]));
  const features = [];
  for (const c of categories) {
    if (!c.poi) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.poi.lng, c.poi.lat] },
      properties: {
        short_name: c.short_name,
        poi_name: c.poi.name,
        color: c.primary_color,
        rank: totalsByName.get(c.short_name) || 0,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function setPois(map, fc) {
  map.getSource(SOURCE_POIS)?.setData(fc || EMPTY_FC);
}
```

Tilt animation is in `applyViewMode`:

```js
const TILT_PITCH = 55;

export function applyViewMode(map, viewMode, resolution = "zip") {
  const isPolygons  = viewMode === "polygons";
  const isCentroids = viewMode === "centroids";
  const isPois      = viewMode === "pois";
  const isZip       = isPolygons && resolution === "zip";
  const isCounty    = isPolygons && resolution === "county";

  map.setLayoutProperty(LAYER_FILL,             "visibility", isZip       ? "visible" : "none");
  map.setLayoutProperty(LAYER_OUTLINE,          "visibility", isZip       ? "visible" : "none");
  map.setLayoutProperty(LAYER_COUNTY_FILL,      "visibility", isCounty    ? "visible" : "none");
  map.setLayoutProperty(LAYER_COUNTY_OUTLINE,   "visibility", isCounty    ? "visible" : "none");
  map.setLayoutProperty(LAYER_CIRCLE,           "visibility", isCentroids ? "visible" : "none");
  map.setLayoutProperty(LAYER_POIS_CIRCLE,      "visibility", isPois      ? "visible" : "none");
  map.setLayoutProperty(LAYER_POIS_LABEL,       "visibility", isPois      ? "visible" : "none");

  const targetPitch = isPois ? TILT_PITCH : 0;
  if (Math.abs(map.getPitch() - targetPitch) > 0.5) {
    map.easeTo({ pitch: targetPitch, duration: 700 });
  }
}
```

---

## State priority (what gets applied)

```
isFaceoff   → applyFaceoff(map, group, a, b, colorA, colorB)
selectedTeam → applyTeamFilter(map, group, name, color, centroids, poi)
default     → applyDominant(map, categories, group)
```

`applyDominant` clears arcs; `applyTeamFilter` builds them; `applyFaceoff` clears them.

---

## Basemap swap

`map.setStyle()` wipes all custom sources and layers. The basemap-swap path passes a `rebuild` callback that re-adds everything from the in-memory data refs:

```js
export function setBasemap(map, basemapKey, rebuild) {
  const entry = BASEMAPS[basemapKey];
  if (!entry) return;
  map.once("style.load", () => rebuild(map));
  map.setStyle(entry.style);
}
```

The callback (in App.jsx) does in order: `addLayers` → `setPois` → `applyViewMode` → `bindInteractions` → re-apply current filter mode (faceoff / team / dominant).

```js
BASEMAPS = {
  standard: { label: "Standard", style: "mapbox://styles/mapbox/standard" },
  light:    { label: "Light",    style: "mapbox://styles/mapbox/light-v11" },
};
```

---

## Click popups

```js
export function bindInteractions(map, getGroup) {
  const interactiveLayers = [LAYER_FILL, LAYER_COUNTY_FILL, LAYER_CIRCLE];
  let popup = null;

  for (const layerId of interactiveLayers) {
    map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    map.on("click", layerId, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      if (popup) popup.remove();
      popup = new mapboxgl.Popup({ closeButton: true, maxWidth: "280px" })
        .setLngLat(e.lngLat)
        .setHTML(popupHTML(feature.properties, getGroup()))
        .addTo(map);
    });
  }
}
```

`getGroup` is a callback (not a value) so the popup reflects whatever group is currently active at click time — no need to re-bind handlers on every group toggle.

Popup HTML reads counts defensively (handles both object and JSON-string forms — useful if you ever swap to tiles):
```js
const counts = props[`${group}_counts`] || {};
const countsObj = typeof counts === "string" ? JSON.parse(counts) : counts;
const top3 = Object.entries(countsObj).sort((a, b) => b[1] - a[1]).slice(0, 3);
```

Display: zip/county label, total responses, top 3 categories with counts and percentages.

---

## Radius / opacity constants

```js
// in config.js
export const CENTROID_RADIUS_SCALE = 2.5;
export const CENTROID_RADIUS_MIN   = 3;
export const CENTROID_RADIUS_MAX   = 22;
export const NO_DATA_COLOR         = "#CCCCCC";
export const CONTESTED_COLOR       = "#808080";
```

`circle-radius = clamp(MIN, MAX, SCALE * sqrt(count))`. Square-root keeps a 100-response zip from being 100× the area of a 1-response zip.
