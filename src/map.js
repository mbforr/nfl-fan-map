import mapboxgl from "mapbox-gl";
import { greatCircle } from "@turf/great-circle";
import {
  BASEMAPS,
  CENTROID_RADIUS_MAX,
  CENTROID_RADIUS_MIN,
  CENTROID_RADIUS_SCALE,
  CONTESTED_COLOR,
  INITIAL_VIEW,
  NO_DATA_COLOR,
  TIE_COLOR,
} from "./config.js";

export const SOURCE_POLYGONS = "regions-polygons";
export const SOURCE_CENTROIDS = "regions-centroids";
export const SOURCE_ARCS = "team-arcs";
export const SOURCE_POIS = "pois";

export const LAYER_FILL = "regions-fill";
export const LAYER_OUTLINE = "regions-outline";
export const LAYER_CIRCLE = "regions-centroid-circle";
export const LAYER_ARCS = "team-arcs";
export const LAYER_POIS_CIRCLE = "pois-circle";
export const LAYER_POIS_LABEL = "pois-label";

const EMPTY_FC = { type: "FeatureCollection", features: [] };
const SLOT = "middle";

export function createMap(container) {
  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const map = new mapboxgl.Map({
    container,
    style: BASEMAPS.standard.style,
    center: INITIAL_VIEW.center,
    zoom: INITIAL_VIEW.zoom,
    minZoom: INITIAL_VIEW.minZoom,
    maxZoom: INITIAL_VIEW.maxZoom,
    projection: "globe",
  });
  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
  return map;
}

// ---------------------------------------------------------------------
// Expressions

const countExpr = (group, team) => [
  "coalesce",
  ["get", team, ["get", `${group}_counts`]],
  0,
];

function dominantColorExpr(categories, group) {
  const expr = ["match", ["get", `${group}_dominant`]];
  for (const c of categories) {
    if (!c.short_name || !c.primary_color) continue;
    expr.push(c.short_name, c.primary_color);
  }
  expr.push("__contested__", CONTESTED_COLOR);
  expr.push(NO_DATA_COLOR);
  return expr;
}
const dominantFilter = (group) => ["!=", ["get", `${group}_dominant`], null];

const totalRadiusExpr = () => [
  "max",
  CENTROID_RADIUS_MIN,
  ["min", CENTROID_RADIUS_MAX, ["*", CENTROID_RADIUS_SCALE, ["sqrt", ["get", "total"]]]],
];

const teamFilter = (group, team) => [">=", countExpr(group, team), 1];
const teamRadius = (group, team) => [
  "max",
  CENTROID_RADIUS_MIN,
  ["min", CENTROID_RADIUS_MAX, ["*", CENTROID_RADIUS_SCALE, ["sqrt", countExpr(group, team)]]],
];

// ---------------------------------------------------------------------
// Layer setup

export function addLayers(map, { polygons, centroids }) {
  const ensureSource = (id, data) => {
    if (map.getSource(id)) map.getSource(id).setData(data);
    else map.addSource(id, { type: "geojson", data });
  };

  ensureSource(SOURCE_POLYGONS, polygons || EMPTY_FC);
  ensureSource(SOURCE_CENTROIDS, centroids || EMPTY_FC);
  ensureSource(SOURCE_ARCS, EMPTY_FC);
  ensureSource(SOURCE_POIS, EMPTY_FC);

  // Fill
  if (!map.getLayer(LAYER_FILL)) {
    map.addLayer({
      id: LAYER_FILL,
      type: "fill",
      source: SOURCE_POLYGONS,
      slot: SLOT,
      paint: { "fill-color": NO_DATA_COLOR, "fill-opacity": 0.7 },
    });
  }
  // Outline
  if (!map.getLayer(LAYER_OUTLINE)) {
    map.addLayer({
      id: LAYER_OUTLINE,
      type: "line",
      source: SOURCE_POLYGONS,
      slot: SLOT,
      paint: { "line-color": "#ffffff", "line-width": 0.4, "line-opacity": 0.65 },
    });
  }
  // Centroid circle
  if (!map.getLayer(LAYER_CIRCLE)) {
    map.addLayer({
      id: LAYER_CIRCLE,
      type: "circle",
      source: SOURCE_CENTROIDS,
      slot: SLOT,
      layout: { visibility: "none" },
      paint: {
        "circle-color": NO_DATA_COLOR,
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 0.8,
        "circle-radius": totalRadiusExpr(),
      },
    });
  }
  // Arcs
  if (!map.getLayer(LAYER_ARCS)) {
    map.addLayer({
      id: LAYER_ARCS,
      type: "line",
      source: SOURCE_ARCS,
      slot: SLOT,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#000000"],
        "line-opacity": [
          "max",
          0.15,
          ["min", 0.9, ["*", 0.9, ["/", ["get", "count"], ["get", "maxCount"]]]],
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 6, 1.0, 10, 1.6],
      },
    });
  }
  // POI circle
  if (!map.getLayer(LAYER_POIS_CIRCLE)) {
    map.addLayer({
      id: LAYER_POIS_CIRCLE,
      type: "circle",
      source: SOURCE_POIS,
      slot: SLOT,
      layout: { visibility: "none" },
      paint: {
        "circle-color": ["coalesce", ["get", "color"], "#000000"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 6, 7, 10, 11],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.95,
        "circle-pitch-alignment": "map",
      },
    });
  }
  // POI label
  if (!map.getLayer(LAYER_POIS_LABEL)) {
    map.addLayer({
      id: LAYER_POIS_LABEL,
      type: "symbol",
      source: SOURCE_POIS,
      slot: SLOT,
      layout: {
        visibility: "none",
        "text-field": ["get", "short_name"],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 13, 12, 16],
        "text-offset": [0, -1.4],
        "text-anchor": "bottom",
        "text-optional": true,
        "symbol-sort-key": ["-", 0, ["coalesce", ["get", "rank"], 0]],
      },
      paint: {
        "text-color": "#111827",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.5,
      },
    });
  }
}

// ---------------------------------------------------------------------
// Filter application

export function applyDominant(map, categories, group) {
  const color = dominantColorExpr(categories, group);
  const filter = dominantFilter(group);
  map.setPaintProperty(LAYER_FILL, "fill-color", color);
  map.setFilter(LAYER_FILL, filter);
  map.setFilter(LAYER_OUTLINE, filter);
  map.setPaintProperty(LAYER_CIRCLE, "circle-color", color);
  map.setPaintProperty(LAYER_CIRCLE, "circle-radius", totalRadiusExpr());
  map.setFilter(LAYER_CIRCLE, filter);
  clearArcs(map);
}

// Face-off (head-to-head)
const faceoffFilterExpr = (group, a, b) => [
  ">=",
  ["+", countExpr(group, a), countExpr(group, b)],
  1,
];
const faceoffColorExpr = (group, a, b, colorA, colorB) => [
  "case",
  [">", countExpr(group, a), countExpr(group, b)], colorA || NO_DATA_COLOR,
  [">", countExpr(group, b), countExpr(group, a)], colorB || NO_DATA_COLOR,
  TIE_COLOR,
];
const faceoffRadiusExpr = (group, a, b) => [
  "max",
  CENTROID_RADIUS_MIN,
  ["min", CENTROID_RADIUS_MAX,
    ["*", CENTROID_RADIUS_SCALE,
      ["sqrt", ["+", countExpr(group, a), countExpr(group, b)]],
    ],
  ],
];

export function applyFaceoff(map, group, a, b, colorA, colorB) {
  const filter = faceoffFilterExpr(group, a, b);
  const color = faceoffColorExpr(group, a, b, colorA, colorB);
  map.setPaintProperty(LAYER_FILL, "fill-color", color);
  map.setFilter(LAYER_FILL, filter);
  map.setFilter(LAYER_OUTLINE, filter);
  map.setPaintProperty(LAYER_CIRCLE, "circle-color", color);
  map.setPaintProperty(LAYER_CIRCLE, "circle-radius", faceoffRadiusExpr(group, a, b));
  map.setFilter(LAYER_CIRCLE, filter);
  clearArcs(map);
}

export function applyTeamFilter(map, group, teamName, teamColor, centroidsFC, poi) {
  const color = teamColor || NO_DATA_COLOR;
  const filter = teamFilter(group, teamName);
  map.setPaintProperty(LAYER_FILL, "fill-color", color);
  map.setFilter(LAYER_FILL, filter);
  map.setFilter(LAYER_OUTLINE, filter);
  map.setPaintProperty(LAYER_CIRCLE, "circle-color", color);
  map.setPaintProperty(LAYER_CIRCLE, "circle-radius", teamRadius(group, teamName));
  map.setFilter(LAYER_CIRCLE, filter);
  setArcs(map, buildTeamArcs(centroidsFC, group, teamName, poi, color));
}

// ---------------------------------------------------------------------
// View mode (polygons | centroids | pois)

const TILT_PITCH = 55;

export function applyViewMode(map, viewMode) {
  const isPolygons = viewMode === "polygons";
  const isCentroids = viewMode === "centroids";
  const isPois = viewMode === "pois";

  if (map.getLayer(LAYER_FILL))    map.setLayoutProperty(LAYER_FILL,    "visibility", isPolygons ? "visible" : "none");
  if (map.getLayer(LAYER_OUTLINE)) map.setLayoutProperty(LAYER_OUTLINE, "visibility", isPolygons ? "visible" : "none");
  if (map.getLayer(LAYER_CIRCLE))  map.setLayoutProperty(LAYER_CIRCLE,  "visibility", isCentroids ? "visible" : "none");
  if (map.getLayer(LAYER_POIS_CIRCLE)) map.setLayoutProperty(LAYER_POIS_CIRCLE, "visibility", isPois ? "visible" : "none");
  if (map.getLayer(LAYER_POIS_LABEL))  map.setLayoutProperty(LAYER_POIS_LABEL,  "visibility", isPois ? "visible" : "none");

  const targetPitch = isPois ? TILT_PITCH : 0;
  if (Math.abs(map.getPitch() - targetPitch) > 0.5) {
    map.easeTo({ pitch: targetPitch, duration: 700 });
  }
}

// ---------------------------------------------------------------------
// Arcs

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
  for (const f of features) f.properties.maxCount = maxCount || 1;
  return { type: "FeatureCollection", features };
}

export function setArcs(map, fc) {
  const src = map.getSource(SOURCE_ARCS);
  if (src) src.setData(fc || EMPTY_FC);
}
export function clearArcs(map) {
  setArcs(map, EMPTY_FC);
}

// ---------------------------------------------------------------------
// POIs

export function buildPoisFC(categories, totals) {
  const totalsByName = new Map((totals || []).map((t) => [t.short_name, t.count]));
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
  const src = map.getSource(SOURCE_POIS);
  if (src) src.setData(fc || EMPTY_FC);
}

// ---------------------------------------------------------------------
// Basemap swap

export function setBasemap(map, basemapKey, rebuild) {
  const entry = BASEMAPS[basemapKey];
  if (!entry) return;
  map.once("style.load", () => rebuild(map));
  map.setStyle(entry.style);
}

// ---------------------------------------------------------------------
// Click popups

export function bindInteractions(map, getGroup) {
  const interactiveLayers = [LAYER_FILL, LAYER_CIRCLE, LAYER_POIS_CIRCLE];
  let popup = null;

  for (const layerId of interactiveLayers) {
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("click", layerId, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      if (popup) popup.remove();
      popup = new mapboxgl.Popup({ closeButton: true, maxWidth: "280px" })
        .setLngLat(e.lngLat)
        .setHTML(layerId === LAYER_POIS_CIRCLE ? poiPopupHTML(f.properties) : popupHTML(f.properties, getGroup()))
        .addTo(map);
    });
  }
}

function popupHTML(props, group) {
  const counts = props[`${group}_counts`] || {};
  const obj = typeof counts === "string" ? JSON.parse(counts) : counts;
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const total = Number(props.total) || entries.reduce((s, [, n]) => s + n, 0);
  const top3 = entries.slice(0, 3);
  const region = props.region || "—";
  const rows = top3
    .map(([team, n]) => {
      const pct = total ? ((n / total) * 100).toFixed(0) : "0";
      return `<div class="flex justify-between gap-2"><span class="truncate">${escapeHTML(team)}</span><span class="tabular-nums text-gray-600">${n} (${pct}%)</span></div>`;
    })
    .join("");
  return `
    <div class="text-sm">
      <div class="font-semibold mb-1">${escapeHTML(region)}</div>
      <div class="text-xs text-gray-500 mb-2">${total} response${total === 1 ? "" : "s"}</div>
      <div class="space-y-1 text-xs">${rows}</div>
    </div>`;
}

function poiPopupHTML(props) {
  return `
    <div class="text-sm">
      <div class="font-semibold">${escapeHTML(props.short_name)}</div>
      <div class="text-xs text-gray-600">${escapeHTML(props.poi_name || "")}</div>
    </div>`;
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export { TIE_COLOR };
