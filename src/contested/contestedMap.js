// Map plumbing for the contested-hexagon app. Sibling of densityMap.js and
// rustbeltMap.js: `hex-` prefixed sources/layers in slot "middle", reaching up
// into ../config.js and this app's own contest.js only.

import mapboxgl from "mapbox-gl";
import { RAMP, breakdown, one, pct } from "./contest.js";

export const SOURCE_CELLS = "hex-cells";

export const L_FILL = "hex-fill";
export const L_LOWN = "hex-lown";
export const L_LINE = "hex-line";
export const L_EXTREME = "hex-extreme";

const SLOT = "middle";
const EMPTY_FC = { type: "FeatureCollection", features: [] };

export const LOW_N_COLOR = "#dcdcd6";

const IS_SCORED = ["==", ["get", "scored"], true];
const NOT_SCORED = ["==", ["get", "scored"], false];

/** Colour by contest index, normalized onto the visible range. */
export function colorExpr(domain) {
  if (domain.empty) return RAMP[0];
  const t = ["/", ["-", ["get", "contest"], domain.lo], domain.hi - domain.lo];
  const expr = ["interpolate", ["linear"], t];
  RAMP.forEach((c, i) => expr.push(i / (RAMP.length - 1), c));
  return expr;
}

export function addContestedLayers(map, cells) {
  if (map.getSource(SOURCE_CELLS)) map.getSource(SOURCE_CELLS).setData(cells || EMPTY_FC);
  else map.addSource(SOURCE_CELLS, { type: "geojson", data: cells || EMPTY_FC, promoteId: "h" });

  const add = (spec) => { if (!map.getLayer(spec.id)) map.addLayer({ slot: SLOT, ...spec }); };

  // Thin cells draw first and flat, so they read as context rather than as a
  // low score — the whole point of the threshold is that they have no score.
  add({
    id: L_LOWN, type: "fill", source: SOURCE_CELLS, filter: NOT_SCORED,
    paint: { "fill-color": LOW_N_COLOR, "fill-opacity": 0.35 },
  });
  add({
    id: L_FILL, type: "fill", source: SOURCE_CELLS, filter: IS_SCORED,
    paint: {
      "fill-color": RAMP[0],
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.82, 8, 0.66],
    },
  });
  add({
    id: L_LINE, type: "line", source: SOURCE_CELLS,
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 1.1],
      "line-opacity": 0.45,
    },
  });
  // The two cells the page is about. One layer, two ids, so highlighting is a
  // filter swap rather than layer churn on every control change.
  add({
    id: L_EXTREME, type: "line", source: SOURCE_CELLS,
    filter: ["==", ["get", "h"], "__none__"],
    paint: {
      "line-color": "#111827",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 2, 8, 3.5],
      "line-opacity": 0.95,
    },
  });
}

export function applyContest(map, { domain, extremes }) {
  if (!map.getLayer(L_FILL)) return;
  map.setPaintProperty(L_FILL, "fill-color", colorExpr(domain));
  const ids = extremes.filter(Boolean);
  map.setFilter(L_EXTREME, ids.length
    ? ["match", ["get", "h"], ids, true, false]
    : ["==", ["get", "h"], "__none__"]);
}

export function setCells(map, fc) {
  const src = map.getSource(SOURCE_CELLS);
  if (src) src.setData(fc || EMPTY_FC);
}

// --- popups ----------------------------------------------------------------

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function readCell(props) {
  const counts = typeof props.counts === "string" ? JSON.parse(props.counts) : props.counts;
  return { ...props, counts: counts || {} };
}

function cellPopup(props, { colorOf, minN }) {
  const cell = readCell(props);
  const where = escapeHTML(cell.label || "Unnamed cell");
  const more = cell.places > 1
    ? `<span class="text-gray-400"> +${cell.places - 1} more place${cell.places > 2 ? "s" : ""}</span>`
    : "";

  if (!props.scored) {
    return `<div class="text-sm">
      <div class="font-semibold">${where}</div>
      <div class="text-xs text-gray-500 mt-1">
        ${cell.n} response${cell.n === 1 ? "" : "s"} — below the ${minN}-response minimum, so this
        hexagon isn't scored.
      </div>
    </div>`;
  }

  const { head, rest } = breakdown(cell, colorOf);
  const bars = head.map((r) => `
    <div class="flex items-center gap-1.5">
      <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style="background:${r.color}"></span>
      <span class="flex-1 truncate">${escapeHTML(r.team)}</span>
      <span class="tabular-nums text-gray-500">${pct(r.share)}</span>
    </div>`).join("");

  return `<div class="text-sm">
    <div class="font-semibold">${where}</div>
    <div class="text-[10px] uppercase tracking-wide text-gray-400 mt-0.5">
      ${cell.n} responses${more}
    </div>
    <div class="mt-1.5 font-semibold tabular-nums">${one(cell.effective)} effective teams</div>
    <div class="text-xs text-gray-600">
      ${cell.distinct} teams present · leader ${pct(cell.top_share)} · margin ${pct(cell.lead)}
    </div>
    <div class="mt-1.5 space-y-0.5 text-xs">${bars}</div>
    ${rest ? `<div class="text-[11px] text-gray-400 mt-1">+${rest} across other teams</div>` : ""}
  </div>`;
}

/**
 * Bind once, in map.on("load"). Layer-scoped map.on handlers live on the Map,
 * not the style, so they survive setStyle — re-binding them in the basemap
 * rebuild is what makes popups fire twice. Returns an unbind() for cleanup.
 */
export function bindContestedInteractions(map, getState) {
  let popup = null;
  const handlers = [];
  const on = (type, layer, fn) => { map.on(type, layer, fn); handlers.push([type, layer, fn]); };

  for (const id of [L_FILL, L_LOWN]) {
    on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    on("click", id, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      if (popup) popup.remove();
      popup = new mapboxgl.Popup({ closeButton: true, maxWidth: "300px" })
        .setLngLat(e.lngLat).setHTML(cellPopup(f.properties, getState())).addTo(map);
    });
  }

  return function unbind() {
    for (const [type, layer, fn] of handlers) map.off(type, layer, fn);
    if (popup) popup.remove();
  };
}
