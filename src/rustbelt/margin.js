// Pure math for the Rust Belt ⇄ home-team head-to-head. No map, no React.

import {
  HOME_TEAMS_BY_FIPS, NO_HOME_FIPS, RUST_BELT_TEAMS, STATE_BY_FIPS, SUN_BELT,
} from "./constants.js";

/** A county/state needs this many head-to-head responses before it's scored. */
export const MIN_N = 5;

// Diverging ramp: blue = home teams lead, orange = Rust Belt leads, neutral
// grey midpoint. Orange rather than red for the warm pole — rust is orange, and
// red/blue on a US state map reads as electoral, which this is not.
export const DIVERGING = [
  "#184f95", "#2a78d6", "#6da7ec", "#b7d3f6",
  "#f0efec",
  "#f7b98f", "#e98033", "#bf5a20", "#8c3a12",
];

// Stops are square-spaced in margin, i.e. stop k sits at ±((4-k)/4)².
// The contested states all live inside ±0.08 (TX −0.073, CA −0.076, FL −0.077,
// GA +0.042, NC +0.058) — on a linear ramp they'd be indistinguishable from the
// midpoint and the map would say nothing. Square spacing expands the middle.
export const STOPS_M = [-1, -0.5625, -0.25, -0.0625, 0, 0.0625, 0.25, 0.5625, 1];

export const NO_HOME_COLOR = "#c96a2e"; // hatch ink
export const LOW_N_COLOR = "#d9d6cf";

/**
 * Normalized 0..1 position of a margin. Because STOPS_M[k] = ±((4-k)/4)², this
 * puts stop k at exactly k/8 — so an evenly-spaced CSS gradient over DIVERGING
 * matches the Mapbox `interpolate` pixel for pixel.
 */
export function tDiv(m) {
  const v = Math.max(-1, Math.min(1, m || 0));
  return (Math.sign(v) * Math.sqrt(Math.abs(v)) + 1) / 2;
}

const hexToRgb = (h) => {
  const s = h.replace("#", "");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Piecewise sRGB lerp over DIVERGING — the same result Mapbox paints. */
export function colorAt(m) {
  const t = tDiv(m) * (DIVERGING.length - 1);
  const i = Math.max(0, Math.min(DIVERGING.length - 2, Math.floor(t)));
  const f = t - i;
  const a = hexToRgb(DIVERGING[i]);
  const b = hexToRgb(DIVERGING[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function formatMargin(m) {
  if (m == null) return "—";
  const pct = Math.round(m * 100);
  if (pct === 0) return "even";
  return (pct > 0 ? "+" : "−") + Math.abs(pct);
}

/** Legend ticks, thinned so labels don't collide (mirrors niceTicks' MIN_GAP walk). */
export function divergingTicks() {
  const MIN_GAP = 0.1;
  const cands = [-1, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 1];
  const kept = [];
  for (const v of cands) {
    if (!kept.length || tDiv(v) - tDiv(kept[kept.length - 1]) >= MIN_GAP || v === 1) kept.push(v);
  }
  return kept;
}

const countOf = (counts, team) => Number(counts?.[team]) || 0;
export const blocCount = (counts, teams) =>
  teams.reduce((s, t) => s + countOf(counts, t), 0);

/**
 * One scan of the state features → everything the map and both panels need.
 *
 * `measure` is null for the whole 9-team bloc, or a single team name.
 */
export function computeBelt(statesFC, measure, categories) {
  const blocTeams = measure ? [measure] : RUST_BELT_TEAMS;
  const byFips = new Map();
  let rbAll = 0, homeAll = 0, totalAll = 0, leads = 0, scored = 0;

  for (const f of statesFC?.features || []) {
    const p = f.properties;
    const fips = String(p.id);
    if (!STATE_BY_FIPS[fips]) continue;

    const counts = p.a_counts || {};
    const homeTeams = HOME_TEAMS_BY_FIPS[fips] || [];
    const rb = blocCount(counts, blocTeams);
    const home = blocCount(counts, homeTeams);
    const noHome = homeTeams.length === 0;
    const n = rb + home;
    const margin = noHome || n === 0 ? null : (rb - home) / n;

    const homeByTeam = homeTeams
      .map((t) => ({ team: t, count: countOf(counts, t) }))
      .sort((a, b) => b.count - a.count);

    byFips.set(fips, {
      fips, usps: p.usps, name: p.name || p.region,
      total: Number(p.total) || 0,
      rb, home, homeTeams, homeByTeam, noHome, n, margin,
      share: p.total ? rb / p.total : 0,
      cx: p.cx, cy: p.cy,
    });

    rbAll += rb; homeAll += home; totalAll += Number(p.total) || 0;
    if (margin != null) { scored += 1; if (margin > 0) leads += 1; }
    else if (noHome) leads += 1; // uncontested counts as a lead in the tally
  }

  // Per-team Sun Belt presence, for the panel and the dropdown's meta column.
  // Always all 9, regardless of `measure`, so the panel list never collapses.
  const sunByTeam = Object.fromEntries(RUST_BELT_TEAMS.map((t) => [t, 0]));
  for (const f of statesFC?.features || []) {
    const p = f.properties;
    if (!STATE_BY_FIPS[String(p.id)]) continue;
    for (const t of RUST_BELT_TEAMS) sunByTeam[t] += countOf(p.a_counts, t);
  }

  return {
    byFips,
    rollup: {
      rb: rbAll, home: homeAll, total: totalAll,
      leads, scored, states: byFips.size,
      sunByTeam,
      share: totalAll ? rbAll / totalAll : 0,
    },
  };
}

/** Per-team national totals from totals.json, for the export-rate column. */
export function exportRates(sunByTeam, totalsA) {
  const nat = new Map((totalsA || []).map((t) => [t.short_name, t.count]));
  return Object.fromEntries(
    Object.entries(sunByTeam).map(([t, sun]) => {
      const n = nat.get(t) || 0;
      return [t, { sun, national: n, rate: n ? sun / n : 0 }];
    }),
  );
}

export const SUN_BELT_LIST = SUN_BELT;
export const NO_HOME = NO_HOME_FIPS;
