// Aggregate US survey responses into H3 hexagons and score how contested each
// one is, emitting public/data/h3_contest.json.
//
// Sibling of analysis/src/15_county_lisa.py: a derived-metric step that reads
// data/responses.csv directly rather than the county aggregates preprocess.js
// writes. Hexagons need POINTS, and the county aggregates have already thrown
// the points away.
//
// Point per response = the GeoNames centroid of its ZIP. City centroids were
// the alternative (preprocess.js already indexes them) but every respondent in
// a city would land on one coordinate, so Chicago would be a single point
// instead of ~100 ZIPs spread across several hexagons — which is exactly the
// intra-metro variation this map exists to show.
//
// US only. Elsewhere the finest geography the survey resolves is a province or
// a whole country, and collapsing those onto one centroid would invent hexagons
// that say more about the centroid than about the fans.

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import * as h3 from "h3-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const OUT = path.join(ROOT, "public/data");

const RESPONSES_PATH = path.join(DATA, "responses.csv");
const POSTAL_PATH = path.join(DATA, "_raw/US_postal.txt");
const CATEGORIES_PATH = path.join(OUT, "category_a.json");

const COL_TEAM = "Which NFL team are you a fan of?";
const COL_COUNTRY = "Country";
const COL_ZIP = "Postal Code";

const RESOLUTIONS = [3, 4, 5];

/** Cells below this are kept for context but never scored or ranked. */
const MIN_N = 25;
/** Below this a hexagon is too thin to draw any conclusion from at all. */
const KEEP_N = 5;

const US_NAMES = new Set([
  "us", "usa", "u.s.", "u.s.a.", "united states", "united states of america", "america",
]);

function padZip(s) {
  if (!s) return null;
  const m = String(s).replace(/\s+/g, "").match(/^(\d{3,5})/);
  return m ? m[1].padStart(5, "0") : null;
}

// "Current: 23188, growing up: 23508" → "23188". Same salvage preprocess.js does.
function salvageEmbeddedZip(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(?<!\d)(\d{5})(?!\d)/);
  return m ? m[1] : null;
}

/**
 * ZIP → { lat, lng, place, state }. GeoNames ships one row per ZIP/place pair,
 * so a ZIP spanning towns appears several times; first row wins.
 */
function loadPostalCentroids() {
  const txt = fs.readFileSync(POSTAL_PATH, "utf8");
  const idx = new Map();
  for (const line of txt.split("\n")) {
    const c = line.split("\t");
    if (c.length < 12) continue;
    const zip = c[1];
    if (idx.has(zip)) continue;
    const lat = parseFloat(c[9]);
    const lng = parseFloat(c[10]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    idx.set(zip, { lat, lng, place: c[2], state: c[4] });
  }
  return idx;
}

/**
 * Shannon entropy over the team mix, normalized against a perfectly even split
 * of all 32 teams, so cells are comparable to each other and not just to
 * themselves.
 *
 * The Miller–Madow term (+(K−1)/2n) matters here and isn't decoration: plug-in
 * entropy is biased DOWNWARD at small n — you can't observe 32 teams in 30
 * responses — which would hand the "most uniform" title to whichever cell
 * happened to be smallest. The correction grows as n shrinks, cancelling most
 * of that.
 */
function score(counts, n, hMax) {
  let h = 0;
  let k = 0;
  let top = 0;
  let second = 0;
  let topTeam = null;
  for (const [team, c] of counts) {
    if (!c) continue;
    k += 1;
    const p = c / n;
    h -= p * Math.log(p);
    if (c > top) { second = top; top = c; topTeam = team; }
    else if (c > second) { second = c; }
  }
  const corrected = h + (k - 1) / (2 * n);
  return {
    contest: corrected / hMax,
    effective: Math.exp(corrected),
    distinct: k,
    top_team: topTeam,
    top_share: top / n,
    lead: (top - second) / n,
  };
}

const round = (v, d) => Number(v.toFixed(d));

function main() {
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, "utf8"));
  const hMax = Math.log(categories.length);

  const txt = fs.readFileSync(RESPONSES_PATH, "utf8").replace(/\r\n/g, "\n");
  const rows = parse(txt, {
    columns: true, skip_empty_lines: true, trim: true,
    relax_quotes: true, relax_column_count: true,
  });

  const postal = loadPostalCentroids();
  const known = new Set(categories.map((c) => c.short_name));

  const points = [];
  const unplaced = { no_zip: 0, unknown_zip: 0, unknown_team: 0 };
  let usRows = 0;

  for (const row of rows) {
    const country = String(row[COL_COUNTRY] || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!US_NAMES.has(country)) continue;
    usRows += 1;

    const team = row[COL_TEAM];
    if (!known.has(team)) { unplaced.unknown_team += 1; continue; }

    const zip = padZip(row[COL_ZIP]) || salvageEmbeddedZip(row[COL_ZIP]);
    if (!zip) { unplaced.no_zip += 1; continue; }
    const pt = postal.get(zip);
    if (!pt) { unplaced.unknown_zip += 1; continue; }

    points.push({ lat: pt.lat, lng: pt.lng, team, place: pt.place, state: pt.state });
  }

  const out = {
    meta: {
      generated: new Date().toISOString().slice(0, 10),
      point_source: "GeoNames US postal-code centroids",
      scope: "US",
      teams: categories.length,
      resolutions: RESOLUTIONS,
      min_n: MIN_N,
      keep_n: KEEP_N,
      us_rows: usRows,
      placed: points.length,
      unplaced,
    },
    resolutions: {},
  };

  for (const res of RESOLUTIONS) {
    const cells = new Map();
    for (const p of points) {
      const id = h3.latLngToCell(p.lat, p.lng, res);
      let cell = cells.get(id);
      if (!cell) cells.set(id, (cell = { n: 0, counts: new Map(), places: new Map() }));
      cell.n += 1;
      cell.counts.set(p.team, (cell.counts.get(p.team) || 0) + 1);
      const label = `${p.place}, ${p.state}`;
      cell.places.set(label, (cell.places.get(label) || 0) + 1);
    }

    const list = [];
    for (const [id, cell] of cells) {
      if (cell.n < KEEP_N) continue;
      // The hexagon's name is wherever most of its respondents live.
      let label = null;
      let best = 0;
      let places = 0;
      for (const [name, c] of cell.places) {
        places += 1;
        if (c > best) { best = c; label = name; }
      }
      const entry = { h: id, n: cell.n, label, places };
      if (cell.n >= MIN_N) {
        const s = score(cell.counts, cell.n, hMax);
        entry.contest = round(s.contest, 4);
        entry.effective = round(s.effective, 2);
        entry.distinct = s.distinct;
        entry.top_team = s.top_team;
        entry.top_share = round(s.top_share, 4);
        entry.lead = round(s.lead, 4);
        entry.counts = Object.fromEntries(
          [...cell.counts].sort((a, b) => b[1] - a[1]),
        );
      }
      list.push(entry);
    }

    list.sort((a, b) => b.n - a.n);
    const scored = list.filter((c) => c.contest != null);
    out.resolutions[res] = {
      area_km2: Math.round(h3.getHexagonAreaAvg(res, "km2")),
      edge_km: round(h3.getHexagonEdgeLengthAvg(res, "km"), 1),
      cells: list,
    };

    const byContest = [...scored].sort((a, b) => b.contest - a.contest);
    console.log(
      `res ${res} (~${out.resolutions[res].area_km2.toLocaleString()} km²): ` +
      `${list.length} cells kept, ${scored.length} scored (n≥${MIN_N})`,
    );
    if (byContest.length) {
      const fmt = (c) => `${c.label} — n=${c.n}, ${c.effective} effective teams, ` +
        `top ${c.top_team} ${(c.top_share * 100).toFixed(0)}%`;
      console.log(`    most contested: ${fmt(byContest[0])}`);
      console.log(`    most uniform:   ${fmt(byContest[byContest.length - 1])}`);
    }
  }

  const dest = path.join(OUT, "h3_contest.json");
  fs.writeFileSync(dest, JSON.stringify(out));
  const kb = (fs.statSync(dest).size / 1024).toFixed(0);
  console.log(`\nwrote public/data/h3_contest.json (${kb} KB)`);
  console.log(`  US rows ${usRows}, placed ${points.length}, unplaced`, unplaced);
}

main();
