// Pure math for the density ramp. No map, no React — safe to unit-test.
//
// Response counts are brutally skewed (US counties: median 4, p99 175, max 694;
// 24% of counties have exactly 1). Equal-interval puts 99% of counties in one
// class, and quantile breaks fail outright — p10 == p25 == 1, so the breaks
// collide and Mapbox throws on non-ascending stops. So we position each value on
// a log-normalized axis instead:  t(v) = ln(1+v) / ln(1+vHi).

export const MEASURE_TOTAL = "__total__";

/** Value for one feature under the current measure, mirroring the map expression. */
export function readValue(props, measure, perArea) {
  const v = measure === MEASURE_TOTAL || !measure
    ? Number(props.total) || 0
    : Number(props.a_counts?.[measure]) || 0;
  if (!perArea) return v;
  const km2 = Number(props.area_km2) || 0;
  return km2 > 0 ? v / (km2 / 1000) : 0;
}

const pct = (sorted, q) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] : 0;

/**
 * One scan of the centroid features → everything the paint and the legend need.
 * Scans centroids (952 KB) rather than polygons (16 MB); properties are identical.
 */
export function computeScale(centroidsFC, measure, scope, perArea) {
  const feats = centroidsFC?.features || [];
  const vals = [];
  let trueMax = 0;
  let trueMaxRegion = "";

  for (const f of feats) {
    const p = f.properties;
    if (scope === "us" && p.country !== "US") continue;
    const v = readValue(p, measure, perArea);
    if (v <= 0) continue;
    vals.push(v);
    if (v > trueMax) { trueMax = v; trueMaxRegion = p.region; }
  }

  vals.sort((a, b) => a - b);
  const n = vals.length;
  if (!n) {
    return { empty: true, n: 0, vHi: 1, ln1pVHi: Math.log1p(1), positives: vals,
             median: 0, trueMax: 0, trueMaxRegion: "" };
  }

  // p99, not max: one outlier would otherwise compress everything else into the
  // bottom of the ramp. `interpolate` clamps above the top stop, so the handful
  // above p99 simply saturate.
  const vHi = Math.max(pct(vals, 0.99), perArea ? 1e-6 : 2);
  return {
    empty: false,
    n,
    positives: vals,
    median: pct(vals, 0.5),
    p90: pct(vals, 0.9),
    vHi,
    ln1pVHi: Math.log1p(vHi),
    trueMax,
    trueMaxRegion,
  };
}

/** Normalized 0..1 position of a value on the ramp — used to place legend ticks. */
export function tPos(v, vHi) {
  if (!(vHi > 0)) return 0;
  return Math.min(1, Math.max(0, Math.log1p(Math.max(0, v)) / Math.log1p(vHi)));
}

/** Percentile of a value within the positive population (for popups). */
export function percentileOf(sorted, v) {
  if (!sorted.length) return 0;
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1; else hi = mid;
  }
  return lo / sorted.length;
}

// --- color -----------------------------------------------------------------

const clamp255 = (x) => Math.max(0, Math.min(255, Math.round(x)));

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s, 16);
  return Number.isFinite(n) && s.length === 6
    ? [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    : [128, 128, 128];
}
const rgbToHex = (r, g, b) =>
  "#" + [r, g, b].map((x) => clamp255(x).toString(16).padStart(2, "0")).join("");

export function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  return rgbToHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
}

/** Relative luminance, 0..1. Used to reject near-white team primaries. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Colorblind-safe sequential blues for the aggregate measure.
const TOTAL_RAMP = ["#eff3ff", "#c6dbef", "#9ecae1", "#6baed6", "#3182bd", "#08519c"];

function rgbToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}

/**
 * Six evenly-spaced ramp colors. Team measures ramp toward the team's own color.
 *
 * Built in HSL rather than by mixing the primary toward white in sRGB. Several
 * NFL primaries are very dark and desaturated (Packers #203731 is R32 G55 B49);
 * mixing those with white gives near-neutral greys, so a "Packers" map came out
 * looking greyscale. Holding hue and a saturation floor while stepping lightness
 * keeps the team legible at every stop.
 */
export function buildRamp(meta) {
  if (!meta) return TOTAL_RAMP.slice();
  let base = meta.primary_color;
  // A near-white primary would make the whole ramp invisible; fall back.
  if (!base || luminance(base) > 0.75) base = meta.secondary_color || base;
  if (!base) return TOTAL_RAMP.slice();

  const [h, s0, l0] = rgbToHsl(base);
  if (s0 < 0.06) {
    // A genuinely achromatic primary (black/white/grey) has no hue to preserve.
    return [0.94, 0.8, 0.64, 0.46, 0.3, 0.16].map((l) => hslToHex(0, 0, l));
  }
  const s = Math.min(0.85, Math.max(0.45, s0));
  const lTop = Math.max(0.18, Math.min(l0, 0.42)); // darkest stop
  const lows = [0.93, 0.83, 0.70, 0.56, 0.42];
  return [...lows.map((l) => hslToHex(h, s, Math.max(l, lTop + 0.04))), hslToHex(h, s, lTop)];
}

/**
 * Nice round tick values that fit under vHi, for the legend.
 *
 * Because positions are logarithmic the upper ticks bunch up, so we drop any
 * that would land within MIN_GAP of their neighbour — the top tick (which is
 * labelled "≥") always wins, since it anchors the ramp.
 */
export function niceTicks(vHi, allowFractional = false) {
  const MIN_GAP = 0.14; // normalized ramp distance between labels
  const whole = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  // Fractions only make sense for a rate; you can't have 0.25 responses.
  const candidates = allowFractional ? [0.1, 0.25, 0.5, ...whole] : whole;
  const below = candidates.filter((v) => v < vHi);
  const top = allowFractional
    ? Number(vHi.toPrecision(vHi < 10 ? 2 : 3))
    : Math.max(1, Math.round(vHi));

  // Walk down from the top so the anchor tick is always kept.
  const kept = [top];
  for (let i = below.length - 1; i >= 0; i--) {
    const v = below[i];
    if (tPos(kept[kept.length - 1], vHi) - tPos(v, vHi) >= MIN_GAP) kept.push(v);
  }
  return kept.reverse();
}

export function formatValue(v, perArea) {
  if (perArea) return v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(v < 10 ? 2 : 1);
  return Math.round(v).toLocaleString();
}
