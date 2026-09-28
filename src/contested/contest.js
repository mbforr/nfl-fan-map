// Pure logic for the contested-hexagon app. No map, no React.

import * as h3 from "h3-js";

/**
 * Viridis. Sequential and perceptually ordered, so "more contested" reads as a
 * direction rather than a set of categories — and deliberately unlike the other
 * two one-off pages (density's team-accent ramp, the Rust Belt's blue↔orange
 * diverging one) so nobody reads a shared meaning into a shared palette.
 */
export const RAMP = [
  "#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725",
];

export const RES_LABELS = {
  3: { label: "Region", blurb: "≈12,400 km² — bigger than Connecticut" },
  4: { label: "Metro", blurb: "≈1,770 km² — about one county" },
  5: { label: "City", blurb: "≈250 km² — a city and its suburbs" },
};

const hexToRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Piecewise sRGB lerp over RAMP — matches what Mapbox `interpolate` paints. */
export function colorAt(t) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(RAMP[i]);
  const b = hexToRgb(RAMP[i + 1]);
  return "#" + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, "0")).join("");
}

/**
 * Hexagon ring as GeoJSON. h3 returns geographic coordinates, so a cell
 * straddling the antimeridian comes back with longitudes at both +179 and −179
 * and Mapbox draws a band right across the map. The Aleutians put real cells
 * there, so shift the negative side past +180 to keep the ring contiguous.
 */
function ring(id) {
  const pts = h3.cellToBoundary(id, true);
  let lo = 180;
  let hi = -180;
  for (const [lng] of pts) { if (lng < lo) lo = lng; if (lng > hi) hi = lng; }
  const wraps = hi - lo > 180;
  const out = pts.map(([lng, lat]) => [wraps && lng < 0 ? lng + 360 : lng, lat]);
  out.push(out[0]);
  return out;
}

/**
 * One FeatureCollection for a resolution. Every kept cell ships, including the
 * thin ones: `scored` drives whether a hexagon gets a colour or the low-n grey,
 * so changing the threshold is a repaint rather than a re-tessellation.
 */
export function toFeatureCollection(cells, minN) {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      id: c.h,
      geometry: { type: "Polygon", coordinates: [ring(c.h)] },
      properties: { ...c, scored: c.contest != null && c.n >= minN },
    })),
  };
}

/** Ramp endpoints, stretched to the cells actually on screen. */
export function computeDomain(scored) {
  if (!scored.length) return { lo: 0, hi: 1, empty: true };
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of scored) {
    if (c.contest < lo) lo = c.contest;
    if (c.contest > hi) hi = c.contest;
  }
  if (hi - lo < 1e-6) hi = lo + 1e-6;
  return { lo, hi, empty: false };
}

export const normalize = (v, domain) => (v - domain.lo) / (domain.hi - domain.lo);

/**
 * The cells that clear the threshold, plus the two extremes the page is about.
 * Sorted most-contested first so the panel and the ranking agree.
 */
export function analyze(resolution, minN) {
  const cells = resolution?.cells || [];
  const scored = cells
    .filter((c) => c.contest != null && c.n >= minN)
    .sort((a, b) => b.contest - a.contest);
  return {
    cells,
    scored,
    domain: computeDomain(scored),
    mostContested: scored[0] || null,
    mostUniform: scored[scored.length - 1] || null,
  };
}

export const pct = (v) => `${Math.round(v * 100)}%`;
export const one = (v) => v.toFixed(1);

/**
 * Contest index back to effective teams. The index is entropy over ln(teams),
 * so this inverts to teams^contest — which is what the legend labels, since
 * "6 effective teams" means something to a reader and "0.58" does not.
 */
export const effectiveOf = (contest, teams) => teams ** contest;

/** Top teams in a cell, with each one's colour, for the breakdown bars. */
export function breakdown(cell, colorOf, limit = 5) {
  const counts = cell?.counts || {};
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const head = rows.slice(0, limit).map(([team, n]) => ({
    team, n, share: n / cell.n, color: colorOf(team),
  }));
  const rest = rows.slice(limit).reduce((s, [, n]) => s + n, 0);
  return { head, rest, distinct: rows.length };
}
