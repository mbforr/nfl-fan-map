// Map plumbing for the Rust Belt ⇄ Sun Belt app. Sibling of densityMap.js:
// `rbs-` prefixed sources/layers in slot "middle", reaching up only into
// ../config.js plus this app's own constants/margin modules.

import mapboxgl from "mapbox-gl";
import {
  HOME_TEAMS_BY_FIPS, NO_HOME_FIPS, RUST_BELT_TEAMS, STATE_BY_FIPS,
  SUN_BELT_FIPS, teamNick,
} from "./constants.js";
import { DIVERGING, LOW_N_COLOR, MIN_N, NO_HOME_COLOR, STOPS_M, formatMargin } from "./margin.js";

export const SOURCE_STATES = "rbs-states";
export const SOURCE_COUNTIES = "rbs-counties";
export const SOURCE_LABELS = "rbs-labels";

export const L_COUNTY_FILL = "rbs-county-fill";
export const L_COUNTY_LOWN = "rbs-county-lown";
export const L_COUNTY_HATCH = "rbs-county-hatch";
export const L_COUNTY_LINE = "rbs-county-line";
export const L_STATE_FILL = "rbs-state-fill";
export const L_STATE_HATCH = "rbs-state-hatch";
export const L_STATE_LINE = "rbs-state-line";
export const L_STATE_LABEL = "rbs-state-label";
export const L_SELECT_STATE = "rbs-select-state";
export const L_SELECT_COUNTY = "rbs-select-county";

const SLOT = "middle";
const EMPTY_FC = { type: "FeatureCollection", features: [] };
const HATCH_ID = "rbs-hatch";

// --- expressions -----------------------------------------------------------

// "48" from a state id ("48") or a county id ("48113") — one grammar, two sources.
const ST_FIPS = ["slice", ["get", "id"], 0, 2];

// `match` over a literal list, never `in` (which is a per-feature linear scan).
export const SUN_BELT_FILTER = [
  "all",
  ["==", ["get", "country"], "US"],
  ["match", ST_FIPS, SUN_BELT_FIPS, true, false],
];
const IS_NO_HOME = ["match", ST_FIPS, NO_HOME_FIPS, true, false];

const count = (t) => ["coalesce", ["get", t, ["get", "a_counts"]], 0];
const sum = (teams) => (teams.length ? ["+", ...teams.map(count), 0] : 0);

const rbExpr = (measure) => sum(measure ? [measure] : RUST_BELT_TEAMS);

// Home teams vary per state, so this is a case over the 9 contested FIPS.
// Built from HOME_TEAMS_BY_FIPS rather than hand-written, so the Giants/Jets=NJ
// and Commanders=MD judgements in the source table can never leak in wrong.
const homeExpr = (() => {
  const branches = [];
  for (const fips of SUN_BELT_FIPS) {
    const teams = HOME_TEAMS_BY_FIPS[fips] || [];
    if (!teams.length) continue;
    branches.push(["==", ST_FIPS, fips], sum(teams));
  }
  return ["case", ...branches, 0];
})();

/** Head-to-head margin, −1 (home sweep) … +1 (Rust Belt sweep). 0 when empty. */
const marginExpr = (measure) => [
  "let", "rb", rbExpr(measure), "hm", homeExpr,
  ["case",
    [">", ["+", ["var", "rb"], ["var", "hm"]], 0],
    ["/", ["-", ["var", "rb"], ["var", "hm"]], ["+", ["var", "rb"], ["var", "hm"]]],
    0],
];
const nExpr = (measure) => ["+", rbExpr(measure), homeExpr];

function rampExpr(measure) {
  const e = ["interpolate", ["linear"], marginExpr(measure)];
  STOPS_M.forEach((m, i) => e.push(m, DIVERGING[i]));
  return e;
}

// --- hatch pattern ---------------------------------------------------------

/**
 * Diagonal hatch for the 7 Sun Belt states with no NFL team. They compute to a
 * margin of exactly +1, which on the ramp would paint Utah *more* Rust Belt
 * than Arizona — but Arizona won a contest and Utah never had one. A texture
 * keeps them legibly on the Rust Belt side without claiming a rank.
 *
 * NOTE: images added with addImage are destroyed by setStyle, so this must be
 * called again inside the basemap rebuild, before addRustBeltLayers.
 */
export function ensureHatchImage(map) {
  if (map.hasImage(HATCH_ID)) return;
  const S = 16, r = 2;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S * r;
  const ctx = cv.getContext("2d");
  ctx.scale(r, r);
  ctx.fillStyle = "#faf6f1";
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = NO_HOME_COLOR;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = -S; i < S * 2; i += 8) {
    ctx.moveTo(i, -2);
    ctx.lineTo(i + S + 2, S + 2);
  }
  ctx.stroke();
  const img = ctx.getImageData(0, 0, S * r, S * r);
  map.addImage(HATCH_ID, { width: S * r, height: S * r, data: new Uint8Array(img.data) },
    { pixelRatio: r });
}

// --- layers ----------------------------------------------------------------

export function addRustBeltLayers(map, { states, counties }) {
  ensureHatchImage(map); // must precede any fill-pattern layer

  const ensure = (id, data) => {
    if (map.getSource(id)) map.getSource(id).setData(data || EMPTY_FC);
    else map.addSource(id, { type: "geojson", data: data || EMPTY_FC, promoteId: "id" });
  };
  ensure(SOURCE_COUNTIES, counties);
  ensure(SOURCE_STATES, states);
  // Labels get their own point source (built from the cx/cy the pipeline ships)
  // rather than riding the polygons: Mapbox labels every MultiPolygon *part*,
  // which put five "FL" labels across the Keys.
  if (!map.getSource(SOURCE_LABELS)) {
    map.addSource(SOURCE_LABELS, { type: "geojson", data: EMPTY_FC });
  }

  const add = (spec) => { if (!map.getLayer(spec.id)) map.addLayer({ slot: SLOT, ...spec }); };

  // Counties first so the state frame draws over them.
  add({
    id: L_COUNTY_FILL, type: "fill", source: SOURCE_COUNTIES,
    layout: { visibility: "none" },
    paint: { "fill-color": DIVERGING[4], "fill-opacity": 0.8 },
  });
  add({
    id: L_COUNTY_LOWN, type: "fill", source: SOURCE_COUNTIES,
    layout: { visibility: "none" },
    paint: { "fill-color": LOW_N_COLOR, "fill-opacity": 0.35 },
  });
  add({
    id: L_COUNTY_HATCH, type: "fill", source: SOURCE_COUNTIES,
    layout: { visibility: "none" },
    paint: { "fill-pattern": HATCH_ID, "fill-opacity": 0.9 },
  });
  add({
    id: L_COUNTY_LINE, type: "line", source: SOURCE_COUNTIES,
    layout: { visibility: "none" },
    paint: { "line-color": "#ffffff", "line-width": 0.3, "line-opacity": 0.5 },
  });

  add({
    id: L_STATE_FILL, type: "fill", source: SOURCE_STATES,
    paint: {
      "fill-color": DIVERGING[4],
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.85, 7, 0.7],
    },
  });
  add({
    id: L_STATE_HATCH, type: "fill", source: SOURCE_STATES,
    paint: { "fill-pattern": HATCH_ID, "fill-opacity": 0.9 },
  });
  // Deliberately visible in BOTH units: without the 16-state frame, a couple of
  // hundred shaded counties float in a blank continent.
  add({
    id: L_STATE_LINE, type: "line", source: SOURCE_STATES,
    filter: SUN_BELT_FILTER,
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 7, 1.6],
      "line-opacity": 0.75,
    },
  });
  // slot "top", and overlap forced: in slot "middle" these lose collision to the
  // basemap's own place labels and silently never render. There are only 16 and
  // they carry the number that makes the near-neutral ramp steps readable, so
  // they must always draw — the white halo keeps them legible over basemap text.
  add({
    id: L_STATE_LABEL, type: "symbol", source: SOURCE_LABELS, slot: "top",
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 6, 15],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#111827",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.8,
      "text-halo-blur": 0.4,
    },
  });
  // One highlight layer per source, rather than moving a single layer between
  // them — no remove/add churn on every unit switch.
  const selPaint = { "line-color": "#111827", "line-width": 2.2, "line-opacity": 0.9 };
  add({
    id: L_SELECT_COUNTY, type: "line", source: SOURCE_COUNTIES,
    filter: ["==", ["get", "id"], "__none__"], paint: selPaint,
  });
  add({
    id: L_SELECT_STATE, type: "line", source: SOURCE_STATES,
    filter: ["==", ["get", "id"], "__none__"], paint: selPaint,
  });
}

export function applyMargin(map, { measure, showLowN }) {
  if (!map.getLayer(L_STATE_FILL)) return;
  const ramp = rampExpr(measure);
  const n = nExpr(measure);
  const scored = ["all", SUN_BELT_FILTER, ["!", IS_NO_HOME]];

  map.setPaintProperty(L_STATE_FILL, "fill-color", ramp);
  map.setFilter(L_STATE_FILL, scored);
  map.setFilter(L_STATE_HATCH, ["all", SUN_BELT_FILTER, IS_NO_HOME]);

  map.setFilter(L_COUNTY_FILL, ["all", scored, [">=", n, MIN_N]]);
  map.setPaintProperty(L_COUNTY_FILL, "fill-color", ramp);
  map.setFilter(L_COUNTY_LOWN, ["all", scored, ["<", n, MIN_N]]);
  map.setPaintProperty(L_COUNTY_LOWN, "fill-color", showLowN ? ramp : LOW_N_COLOR);
  map.setPaintProperty(L_COUNTY_LOWN, "fill-opacity", showLowN ? 0.42 : 0.35);
  map.setFilter(L_COUNTY_HATCH, ["all", SUN_BELT_FILTER, IS_NO_HOME]);
  map.setFilter(L_COUNTY_LINE, SUN_BELT_FILTER);

}

/**
 * One label point per state, text precomputed in JS. The label carries the
 * number so the near-neutral inner ramp steps never have to be told apart by eye.
 */
export function setStateLabels(map, belt) {
  const src = map.getSource(SOURCE_LABELS);
  if (!src || !belt) return;
  const features = [];
  for (const s of belt.byFips.values()) {
    if (s.cx == null || s.cy == null) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.cx, s.cy] },
      properties: { label: `${s.usps}  ${s.noHome ? "—" : formatMargin(s.margin)}` },
    });
  }
  src.setData({ type: "FeatureCollection", features });
}

export function applyUnit(map, unit) {
  const vis = (id, on) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  const c = unit === "counties";
  vis(L_COUNTY_FILL, c); vis(L_COUNTY_LOWN, c); vis(L_COUNTY_HATCH, c); vis(L_COUNTY_LINE, c);
  vis(L_STATE_FILL, !c); vis(L_STATE_HATCH, !c); vis(L_STATE_LABEL, !c);
  vis(L_STATE_LINE, true); // frame stays in both units
}

export function applySelection(map, unit, id) {
  const set = (layer, value) => {
    if (map.getLayer(layer)) map.setFilter(layer, ["==", ["get", "id"], value]);
  };
  // Only the layer matching the visible unit ever holds a real id.
  set(L_SELECT_COUNTY, unit === "counties" && id ? id : "__none__");
  set(L_SELECT_STATE, unit === "states" && id ? id : "__none__");
}

// --- popups ----------------------------------------------------------------

const esc = (s) => String(s ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const swatch = (c) =>
  `<span class="inline-block h-2.5 w-2.5 rounded-sm align-middle" style="background:${c}"></span>`;
const readCounts = (p) => {
  const raw = p.a_counts || {};
  return typeof raw === "string" ? JSON.parse(raw) : raw;
};

function popupHTML(props, state) {
  const { measure } = state;
  const counts = readCounts(props);
  const fips = String(props.id).slice(0, 2);
  const st = STATE_BY_FIPS[fips];
  const homeTeams = HOME_TEAMS_BY_FIPS[fips] || [];
  const blocTeams = measure ? [measure] : RUST_BELT_TEAMS;
  const n0 = (t) => Number(counts[t]) || 0;
  const rb = blocTeams.reduce((s, t) => s + n0(t), 0);
  const home = homeTeams.reduce((s, t) => s + n0(t), 0);
  const total = Number(props.total) || 0;
  const label = measure ? esc(measure) : "Rust Belt (9)";

  const head = `<div class="font-semibold mb-0.5">${esc(props.region || props.name)}</div>
    <div class="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">${
      props.level === "us_state" ? "State" : "County"} · ${esc(st?.usps || "")}</div>`;

  const topRb = blocTeams.map((t) => ({ t, n: n0(t) })).filter((x) => x.n)
    .sort((a, b) => b.n - a.n).slice(0, 3)
    .map((x) => `<div class="flex justify-between gap-3"><span class="truncate">${esc(x.t)}</span>
      <span class="tabular-nums text-gray-600">${x.n}</span></div>`).join("");

  if (!homeTeams.length) {
    const pct = total ? Math.round((rb / total) * 100) : 0;
    return `<div class="text-sm">${head}
      <div class="mb-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">No NFL home team</div>
      <div class="font-semibold tabular-nums">${rb} ${label} of ${total} responses · ${pct}%</div>
      <div class="mt-1.5 space-y-0.5 text-xs">${topRb}</div>
      <div class="mt-1.5 text-[11px] text-gray-400">No local franchise — nothing to score against.</div>
    </div>`;
  }

  const n = rb + home;
  if (n < MIN_N) {
    return `<div class="text-sm">${head}
      <div class="text-xs text-gray-500">Only ${n} head-to-head response${n === 1 ? "" : "s"} here — too few to score.</div>
      <div class="mt-1 text-xs tabular-nums">${label} ${rb} · home ${home}</div>
    </div>`;
  }

  const margin = (rb - home) / n;
  const lead = rb === home ? "Dead heat"
    : rb > home ? `${label} +${rb - home} head-to-head`
    : `Home teams +${home - rb} head-to-head`;
  const homeRows = homeTeams.map((t) => `${esc(teamNick(t))} ${n0(t)}`).join(" · ");
  const biggest = homeTeams.map((t) => ({ t, n: n0(t) })).sort((a, b) => b.n - a.n)[0];
  const vsBiggest = homeTeams.length > 1 && biggest
    ? `<div class="mt-1 text-[11px] text-gray-500">Biggest single home team: ${esc(teamNick(biggest.t))} ${biggest.n}${
        rb > biggest.n ? ` — the bloc beats it ${rb}–${biggest.n}.` : "."}</div>`
    : "";

  return `<div class="text-sm">${head}
    <div class="flex items-center justify-between gap-3">
      <span class="flex items-center gap-1.5">${swatch(DIVERGING[6])}${label}</span>
      <span class="font-semibold tabular-nums">${rb}</span></div>
    <div class="flex items-center justify-between gap-3">
      <span class="flex items-center gap-1.5">${swatch(DIVERGING[2])}Home teams</span>
      <span class="font-semibold tabular-nums">${home}</span></div>
    <div class="mt-1 font-medium">${lead} <span class="text-gray-400 tabular-nums">(${formatMargin(margin)})</span></div>
    <div class="mt-1 text-[11px] text-gray-500">${homeRows}</div>${vsBiggest}
    <div class="mt-1.5 border-t border-gray-100 pt-1.5 text-[11px] text-gray-500 tabular-nums">
      ${label} = ${total ? Math.round((rb / total) * 100) : 0}% of all ${total} responses here
    </div>
  </div>`;
}

/**
 * Bind once, from map.on("load"). Layer-scoped handlers live on the Map, not the
 * style, so they survive setStyle — re-binding in the basemap rebuild is what
 * duplicates popups in src/App.jsx.
 */
export function bindRustBeltInteractions(map, getState) {
  const layers = [L_COUNTY_FILL, L_COUNTY_LOWN, L_COUNTY_HATCH, L_STATE_FILL, L_STATE_HATCH];
  let popup = null;
  const bound = [];
  const on = (type, layer, fn) => { map.on(type, layer, fn); bound.push([type, layer, fn]); };

  for (const id of layers) {
    on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    on("click", id, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      if (popup) popup.remove();
      const state = getState();
      popup = new mapboxgl.Popup({ closeButton: true, maxWidth: "300px" })
        .setLngLat(e.lngLat).setHTML(popupHTML(f.properties, state)).addTo(map);
      state.onSelect?.(String(f.properties.id));
    });
  }
  return function unbind() {
    for (const [t, l, fn] of bound) map.off(t, l, fn);
    if (popup) popup.remove();
  };
}
