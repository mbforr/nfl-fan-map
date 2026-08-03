// Story-mode map: reuses the main app's sources/layers/expressions from map.js
// and adds three analysis layers (Voronoi cells, country choropleth, Rust Belt
// metros). Each chapter calls one show* function which hides everything else,
// styles its layer, and lets Story.jsx fly the camera.
import mapboxgl from "mapbox-gl";
import {
  addLayers,
  applyDominant,
  applyTeamFilter,
  clearArcs,
  LAYER_ARCS,
  LAYER_CIRCLE,
  LAYER_FILL,
  LAYER_OUTLINE,
  LAYER_POIS_CIRCLE,
  LAYER_POIS_LABEL,
} from "../map.js";
import { CONTESTED_COLOR, GROUP, NO_DATA_COLOR } from "../config.js";

const SLOT = "middle";
export const SOURCE_VORONOI = "story-voronoi";
export const SOURCE_COUNTRY = "story-country";
export const SOURCE_RUST = "story-rust";
export const SOURCE_LISA = "story-lisa";
export const VOR_FILL = "story-voronoi-fill";
export const VOR_OUTLINE = "story-voronoi-outline";
export const VOR_LABEL = "story-voronoi-label";
export const CTY_FILL = "story-country-fill";
export const CTY_OUTLINE = "story-country-outline";
export const RUST_CIRCLE = "story-rust-circle";
export const RUST_LABEL = "story-rust-label";
export const LISA_CIRCLE = "story-lisa-circle";

// LISA cluster colors (standard hot/cold scheme): HH hotspot, HL/LH outliers.
export const LISA_COLORS = { HH: "#d7191c", HL: "#fdae61", LH: "#2c7bb6" };

const MAIN_LAYERS = [LAYER_FILL, LAYER_OUTLINE, LAYER_CIRCLE, LAYER_ARCS,
  LAYER_POIS_CIRCLE, LAYER_POIS_LABEL];
const EXTRA_LAYERS = [VOR_FILL, VOR_OUTLINE, VOR_LABEL, CTY_FILL, CTY_OUTLINE,
  RUST_CIRCLE, RUST_LABEL, LISA_CIRCLE];

// team → primary_color match on an arbitrary string property.
function teamColorMatch(categories, prop) {
  const expr = ["match", ["get", prop]];
  for (const c of categories) {
    if (!c.short_name || !c.primary_color) continue;
    expr.push(c.short_name, c.primary_color);
  }
  expr.push("__contested__", CONTESTED_COLOR);
  expr.push(NO_DATA_COLOR);
  return expr;
}

function setVis(map, ids, visible) {
  for (const id of ids) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

export function addStoryLayers(map, data) {
  const { polygons, centroids, voronoi, country, rust, categories } = data;
  addLayers(map, { polygons, centroids }); // main fill/outline/circle/arcs/pois

  const ensure = (id, geo) => {
    if (map.getSource(id)) map.getSource(id).setData(geo);
    else map.addSource(id, { type: "geojson", data: geo });
  };
  ensure(SOURCE_VORONOI, voronoi);
  ensure(SOURCE_COUNTRY, country);
  ensure(SOURCE_RUST, rust);
  ensure(SOURCE_LISA, data.lisa);

  if (!map.getLayer(VOR_FILL)) {
    map.addLayer({
      id: VOR_FILL, type: "fill", source: SOURCE_VORONOI, slot: SLOT,
      layout: { visibility: "none" },
      paint: { "fill-color": teamColorMatch(categories, "cell_team"), "fill-opacity": 0.55 },
    });
  }
  if (!map.getLayer(VOR_OUTLINE)) {
    map.addLayer({
      id: VOR_OUTLINE, type: "line", source: SOURCE_VORONOI, slot: SLOT,
      layout: { visibility: "none" },
      paint: { "line-color": "#ffffff", "line-width": 1.1, "line-opacity": 0.9 },
    });
  }
  if (!map.getLayer(VOR_LABEL)) {
    map.addLayer({
      id: VOR_LABEL, type: "symbol", source: SOURCE_VORONOI, slot: SLOT,
      layout: {
        visibility: "none",
        "text-field": ["get", "label"],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 5, 13, 8, 16],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#111827",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.6,
      },
    });
  }
  if (!map.getLayer(CTY_FILL)) {
    map.addLayer({
      id: CTY_FILL, type: "fill", source: SOURCE_COUNTRY, slot: SLOT,
      layout: { visibility: "none" },
      paint: { "fill-color": teamColorMatch(categories, "a_dominant"), "fill-opacity": 0.75 },
    });
  }
  if (!map.getLayer(CTY_OUTLINE)) {
    map.addLayer({
      id: CTY_OUTLINE, type: "line", source: SOURCE_COUNTRY, slot: SLOT,
      layout: { visibility: "none" },
      paint: { "line-color": "#ffffff", "line-width": 0.5, "line-opacity": 0.6 },
    });
  }
  if (!map.getLayer(RUST_CIRCLE)) {
    map.addLayer({
      id: RUST_CIRCLE, type: "circle", source: SOURCE_RUST, slot: SLOT,
      layout: { visibility: "none" },
      paint: {
        "circle-color": teamColorMatch(categories, "dominant"),
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.4,
        "circle-radius": ["max", 6, ["*", 3.2, ["sqrt", ["get", "rust_belt_fans"]]]],
      },
    });
  }
  if (!map.getLayer(LISA_CIRCLE)) {
    map.addLayer({
      id: LISA_CIRCLE, type: "circle", source: SOURCE_LISA, slot: SLOT,
      layout: { visibility: "none" },
      paint: {
        "circle-color": ["match", ["get", "cluster"],
          "HH", LISA_COLORS.HH, "HL", LISA_COLORS.HL, "LH", LISA_COLORS.LH, "#9ca3af"],
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 0.8,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 5, 6, 9, 10, 14],
      },
    });
  }
  if (!map.getLayer(RUST_LABEL)) {
    map.addLayer({
      id: RUST_LABEL, type: "symbol", source: SOURCE_RUST, slot: SLOT,
      layout: {
        visibility: "none",
        // metro + its most-popular Rust Belt team, e.g. "Phoenix · Packers 45"
        "text-field": ["concat", ["get", "metro"], " · ",
          ["get", "top_rust_nick"], " ", ["to-string", ["get", "top_rust_count"]]],
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        "text-size": 12, "text-offset": [0, -1.6], "text-anchor": "bottom", "text-optional": true,
      },
      paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
  }
}

function hideAll(map) {
  setVis(map, [...MAIN_LAYERS, ...EXTRA_LAYERS], false);
  clearArcs(map);
}

// ---- Chapter layer applications ----
export function showDominant(map, categories) {
  hideAll(map);
  applyDominant(map, categories, GROUP);
  setVis(map, [LAYER_FILL, LAYER_OUTLINE], true);
}

export function showTeam(map, categories, teamName, centroids) {
  hideAll(map);
  const meta = categories.find((c) => c.short_name === teamName);
  applyTeamFilter(map, GROUP, teamName, meta?.primary_color, centroids, meta?.poi);
  setVis(map, [LAYER_FILL, LAYER_OUTLINE, LAYER_ARCS], true);
}

export function showVoronoi(map) {
  hideAll(map);
  setVis(map, [VOR_FILL, VOR_OUTLINE, VOR_LABEL], true);
}

export function showCountry(map) {
  hideAll(map);
  setVis(map, [CTY_FILL, CTY_OUTLINE], true);
}

export function showRust(map, categories) {
  hideAll(map);
  applyDominant(map, categories, GROUP); // faint county context under the metros
  setVis(map, [LAYER_FILL], true);
  map.setPaintProperty(LAYER_FILL, "fill-opacity", 0.15);
  setVis(map, [RUST_CIRCLE, RUST_LABEL], true);
}

export function showLisa(map, teamName) {
  hideAll(map);
  if (map.getLayer(LISA_CIRCLE)) {
    map.setFilter(LISA_CIRCLE, ["==", ["get", "team"], teamName]);
    setVis(map, [LISA_CIRCLE], true);
  }
}

// Reset the dimmed fill opacity when leaving the Rust Belt chapter.
export function resetFillOpacity(map) {
  if (map.getLayer(LAYER_FILL)) map.setPaintProperty(LAYER_FILL, "fill-opacity", 0.7);
}

export function flyTo(map, camera) {
  map.flyTo({
    center: camera.center,
    zoom: camera.zoom,
    pitch: camera.pitch || 0,
    bearing: camera.bearing || 0,
    duration: camera.duration || 1600,
    essential: true,
  });
}

// Lightweight popups for the extra layers.
export function bindStoryPopups(map, colorOf) {
  let popup = null;
  const show = (e, html) => {
    if (popup) popup.remove();
    popup = new mapboxgl.Popup({ closeButton: true, maxWidth: "260px" })
      .setLngLat(e.lngLat).setHTML(html).addTo(map);
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const sw = (c) => `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c || "#9ca3af"}"></span>`;

  for (const id of [VOR_FILL, CTY_FILL, RUST_CIRCLE, LISA_CIRCLE]) {
    map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
  }
  const LISA_LABEL = {
    HH: "hotspot (high, near other highs)",
    HL: "high outlier (high, near lows)",
    LH: "low outlier (low, near highs)",
  };
  map.on("click", LISA_CIRCLE, (e) => {
    const p = e.features?.[0]?.properties; if (!p) return;
    show(e, `<div class="text-sm"><div class="font-semibold">${esc(p.region)}</div>
      <div class="text-xs text-gray-600 mt-1">${sw(LISA_COLORS[p.cluster])} ${esc(p.team)} ${LISA_LABEL[p.cluster] || p.cluster}</div>
      <div class="text-xs text-gray-500">${p.count} fans here</div></div>`);
  });
  map.on("click", VOR_FILL, (e) => {
    const p = e.features?.[0]?.properties; if (!p) return;
    const name = p.label || p.cell_team;
    show(e, `<div class="text-sm"><div class="font-semibold mb-1">${sw(colorOf(p.cell_team))} ${esc(name)} territory</div>
      <div class="text-xs text-gray-600">${Math.round(p.accuracy * 100)}% of fans here root for the ${esc(name)}</div>
      <div class="text-xs text-gray-500 mt-0.5">Actual top team: ${esc(p.top_actual_team)} · ${p.total_fans_in_cell} fans</div></div>`);
  });
  map.on("click", CTY_FILL, (e) => {
    const p = e.features?.[0]?.properties; if (!p) return;
    show(e, `<div class="text-sm"><div class="font-semibold">${esc(p.region)}</div>
      <div class="text-xs text-gray-600 mt-1">${sw(colorOf(p.a_dominant))} Top team: ${esc(p.a_dominant)}</div>
      <div class="text-xs text-gray-500">${p.total} responses</div></div>`);
  });
  map.on("click", RUST_CIRCLE, (e) => {
    const p = e.features?.[0]?.properties; if (!p) return;
    let top3 = [];
    try { top3 = JSON.parse(p.top3 || "[]"); } catch { /* ignore */ }
    const top3rows = top3.map((t, i) =>
      `<div class="flex items-center justify-between gap-3">
         <span class="flex items-center gap-1.5">${sw(colorOf(t.team))}<span>${i + 1}. ${esc(t.team)}</span></span>
         <span class="tabular-nums text-gray-500">${t.count}</span>
       </div>`).join("");
    show(e, `<div class="text-sm">
      <div class="font-semibold">${esc(p.metro)}</div>
      <div class="text-xs text-gray-600 mt-1">Top Rust Belt team: ${sw(colorOf(p.top_rust_team))}<b>${esc(p.top_rust_team)}</b> (${p.top_rust_count})</div>
      <div class="text-xs text-gray-500">${p.rust_belt_fans} Rust Belt fans of ${p.total} responses · ${Math.round(p.rust_belt_share * 100)}%</div>
      <div class="mt-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Top 3 teams in this city</div>
      <div class="mt-1 space-y-0.5 text-xs">${top3rows}</div>
    </div>`);
  });
}
