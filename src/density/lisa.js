// LISA (local Moran's I) payload handling for the density app.
//
// Colors are defined here rather than imported from src/walkthrough/storyMap.js:
// apps only reach *up* into ../map.js and ../config.js, never sideways into each
// other — and the walkthrough's table only has three classes (no LL) anyway.

export const LISA_COLORS = {
  HH: "#d7191c", // hotspot: high, surrounded by high
  LL: "#2c7bb6", // coldspot: low, surrounded by low
  HL: "#fdae61", // high outlier
  LH: "#abd9e9", // low outlier
  NS: "#e5e7eb", // not significant
};

export const LISA_LABELS = {
  HH: "Hotspot",
  LL: "Coldspot",
  HL: "High outlier",
  LH: "Low outlier",
};

export const LISA_BLURBS = {
  HH: "high share, neighbours also high",
  LL: "low share, neighbours also low",
  HL: "high share, surrounded by low",
  LH: "low share, surrounded by high",
};

export const LISA_ORDER = ["HH", "LL", "HL", "LH"];

// The payload ships integer quadrant codes (1=HH, 2=LL, 3=HL, 4=LH) so numeric
// order matches legend order. meta.quad_codes carries the same mapping.
const CODE_TO_CLASS = { 1: "HH", 2: "LL", 3: "HL", 4: "LH" };

/**
 * Validate + index the county_lisa.json payload.
 *
 * The one real hazard is FIPS typing: geojson `properties.id` keeps leading zeros
 * ("01001"), so an integer key from pandas would silently fail to join for every
 * county in AL/AK/AZ/AR/CA. We pad defensively and warn loudly if we had to.
 */
export function normalizeLisa(json) {
  if (!json?.variables) return { meta: {}, counties: {}, byKey: new Map() };

  let padded = 0;
  const fix = (k) => {
    const s = String(k);
    if (s.length === 5) return s;
    padded += 1;
    return s.padStart(5, "0");
  };

  const counties = {};
  for (const [k, v] of Object.entries(json.counties || {})) counties[fix(k)] = v;

  const byKey = new Map();
  for (const v of json.variables) {
    const clusters = new Map();
    for (const [k, pair] of Object.entries(v.clusters || {})) {
      const code = Array.isArray(pair) ? pair[0] : pair;
      const p = Array.isArray(pair) ? pair[1] : 0;
      const cls = CODE_TO_CLASS[code];
      if (cls) clusters.set(fix(k), { cls, p });
    }
    byKey.set(v.key, { ...v, clusters });
  }

  if (padded) {
    console.warn(
      `county_lisa.json: ${padded} FIPS keys were not 5 characters and were zero-padded. ` +
      "The producer should emit zero-padded strings.",
    );
  }
  return { meta: json.meta || {}, counties, byKey, order: json.variables.map((v) => v.key) };
}

/**
 * Group one variable's clusters into the four FIPS arrays the Mapbox `match`
 * wants. O(n) over ~300 entries — cheap enough to redo whenever the variable or
 * the confidence threshold changes, which is what keeps the FDR filter free.
 */
export function groupClusters(variable, confidence) {
  const empty = { HH: [], LL: [], HL: [], LH: [], all: [], counts: { HH: 0, LL: 0, HL: 0, LH: 0 } };
  if (!variable) return empty;

  const cut = confidence === "fdr" ? (variable.fdr_cut ?? 0) : Infinity;
  const g = { HH: [], LL: [], HL: [], LH: [], all: [], counts: { HH: 0, LL: 0, HL: 0, LH: 0 } };
  for (const [fips, { cls, p }] of variable.clusters) {
    if (confidence === "fdr" && !(p <= cut)) continue;
    g[cls].push(fips);
    g.all.push(fips);
    g.counts[cls] += 1;
  }
  return g;
}

/** Plain-English reading of a global Moran's I. */
export function describeMoran(v) {
  if (!v) return "";
  const i = v.moran_i;
  const sig = v.p_sim < 0.05;
  if (!sig) return "No significant spatial pattern — this measure is scattered.";
  const strength =
    i >= 0.5 ? "Strongly clustered" : i >= 0.3 ? "Clearly clustered" :
    i >= 0.15 ? "Moderately clustered" : i > 0 ? "Weakly clustered" : "Dispersed";
  const what = v.key === "total"
    ? "responses concentrate in contiguous counties"
    : "fans concentrate in contiguous counties rather than scattering";
  return `${strength} — ${what}.`;
}
