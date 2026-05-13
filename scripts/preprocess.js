// Preprocessing: aggregate data/responses.csv against the boundary files
// in data/, and emit:
//   public/data/regions_polygons.geojson
//   public/data/regions_centroids.geojson
//   public/data/totals.json
//
// Single-axis (group "a"). Multi-country aggregation:
//   US  → county (via ZCTA→county crosswalk, joined to GADM USA L2 by state + name)
//   CA  → province (GADM CAN L1, joined by ISO_1)
//   MX  → state    (GADM MEX L1, joined by ISO_1)
//   *   → country  (per-country GADM L0 merged in countries_world.geojson)

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import iso from "iso-3166-1";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const OUT = path.join(ROOT, "public/data");

const RESPONSES_PATH = path.join(DATA, "responses.csv");
const CROSSWALK_PATH = path.join(DATA, "zip_county_crosswalk.txt");
const COUNTIES_PATH = path.join(DATA, "counties_us.geojson");
const PROVINCES_PATH = path.join(DATA, "provinces_ca.geojson");
const DIVISIONS_CA_PATH = path.join(DATA, "divisions_ca.geojson");
const STATES_PATH = path.join(DATA, "states_mx.geojson");
const STATES_DE_PATH = path.join(DATA, "states_de.geojson");
const STATES_AU_PATH = path.join(DATA, "states_au.geojson");
const NATIONS_GB_PATH = path.join(DATA, "nations_gb.geojson");
const COUNTRIES_PATH = path.join(DATA, "countries_world.geojson");
const CA_GEONAMES_PATH = path.join(DATA, "_raw/CA.txt");

const COL_TEAM = "Which NFL team are you a fan of?";
const COL_COUNTRY = "Country";
const COL_REGION = "State, province, or region";
const COL_CITY = "City or town";
const COL_ZIP = "Postal Code";

// ---------------------------------------------------------------------
// State FIPS → name (used to bridge Census FIPS to GADM NAME_1)

const FIPS_TO_STATE = {
  "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas",
  "06": "California", "08": "Colorado", "09": "Connecticut", "10": "Delaware",
  "11": "District of Columbia", "12": "Florida", "13": "Georgia", "15": "Hawaii",
  "16": "Idaho", "17": "Illinois", "18": "Indiana", "19": "Iowa", "20": "Kansas",
  "21": "Kentucky", "22": "Louisiana", "23": "Maine", "24": "Maryland",
  "25": "Massachusetts", "26": "Michigan", "27": "Minnesota", "28": "Mississippi",
  "29": "Missouri", "30": "Montana", "31": "Nebraska", "32": "Nevada",
  "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico", "36": "New York",
  "37": "North Carolina", "38": "North Dakota", "39": "Ohio", "40": "Oklahoma",
  "41": "Oregon", "42": "Pennsylvania", "44": "Rhode Island", "45": "South Carolina",
  "46": "South Dakota", "47": "Tennessee", "48": "Texas", "49": "Utah",
  "50": "Vermont", "51": "Virginia", "53": "Washington", "54": "West Virginia",
  "55": "Wisconsin", "56": "Wyoming",
};

const STATE_FIPS_TO_USPS = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY",
};

// ---------------------------------------------------------------------
// Country normalization (free-text → ISO-2)

const MANUAL_COUNTRY = new Map([
  ["united states", "US"], ["usa", "US"], ["u.s.", "US"], ["u.s.a.", "US"],
  ["united states of america", "US"], ["america", "US"],
  ["united kingdom", "GB"], ["uk", "GB"], ["england", "GB"],
  ["great britain", "GB"], ["britain", "GB"], ["scotland", "GB"], ["wales", "GB"],
  ["czechia", "CZ"], ["czech republic", "CZ"],
  ["south korea", "KR"], ["korea, south", "KR"], ["republic of korea", "KR"],
  ["north korea", "KP"], ["korea, north", "KP"],
  ["russia", "RU"], ["russian federation", "RU"],
  ["iran", "IR"],
  ["vietnam", "VN"], ["viet nam", "VN"],
  ["taiwan", "TW"],
  ["palestine", "PS"],
  ["ivory coast", "CI"], ["cote d'ivoire", "CI"],
  ["bolivia", "BO"],
  ["venezuela", "VE"],
  ["tanzania", "TZ"],
  ["syria", "SY"],
  ["laos", "LA"],
  ["moldova", "MD"],
  ["brunei", "BN"],
  ["micronesia", "FM"],
  ["myanmar", "MM"], ["burma", "MM"],
  ["turkey", "TR"], ["türkiye", "TR"],
  ["new zealand", "NZ"],
  ["netherlands", "NL"], ["the netherlands", "NL"], ["holland", "NL"],
  ["saint kitts and nevis", "KN"], ["st. kitts and nevis", "KN"], ["st kitts and nevis", "KN"],
  ["bosnia and herzegovina", "BA"], ["bosnia", "BA"], ["bosnia & herzegovina", "BA"],
  ["united arab emirates", "AE"], ["uae", "AE"],
  ["dominican republic", "DO"],
  ["costa rica", "CR"],
  ["south africa", "ZA"],
  ["el salvador", "SV"],
  ["sri lanka", "LK"],
  ["saudi arabia", "SA"],
  ["hong kong", "HK"],
]);

function normalizeCountry(s) {
  if (!s) return null;
  const v = String(s).replace(/\s+/g, " ").trim();
  if (!v) return null;
  const manual = MANUAL_COUNTRY.get(v.toLowerCase());
  if (manual) return manual;
  return (
    iso.whereCountry(v)?.alpha2 ||
    iso.whereAlpha2(v.toUpperCase())?.alpha2 ||
    iso.whereAlpha3(v.toUpperCase())?.alpha2 ||
    null
  );
}

// ---------------------------------------------------------------------
// Province/state normalization

const CA_PROVINCE = {
  "ab": "AB", "alberta": "AB",
  "bc": "BC", "b.c.": "BC", "british columbia": "BC", "british colombia": "BC", "british colombia": "BC",
  "mb": "MB", "manitoba": "MB",
  "nb": "NB", "new brunswick": "NB",
  "nl": "NL", "newfoundland": "NL", "newfoundland and labrador": "NL", "labrador": "NL",
  "ns": "NS", "nova scotia": "NS",
  "nt": "NT", "northwest territories": "NT",
  "nu": "NU", "nunavut": "NU",
  "on": "ON", "ontario": "ON",
  "pe": "PE", "pei": "PE", "prince edward island": "PE",
  "qc": "QC", "quebec": "QC", "québec": "QC", "qu": "QC",
  "sk": "SK", "saskatchewan": "SK",
  "yt": "YT", "yukon": "YT", "yukon territory": "YT",
};

const MX_STATE = {
  "aguascalientes": "AGU",
  "baja california": "BCN", "baja california norte": "BCN",
  "baja california sur": "BCS",
  "campeche": "CAM",
  "chiapas": "CHP",
  "chihuahua": "CHH",
  "ciudad de mexico": "CMX", "ciudad de méxico": "CMX", "mexico city": "CMX", "df": "CMX",
  "coahuila": "COA", "coahuila de zaragoza": "COA",
  "colima": "COL",
  "durango": "DUR",
  "estado de mexico": "MEX", "estado de méxico": "MEX", "state of mexico": "MEX", "mexico": "MEX",
  "guanajuato": "GUA",
  "guerrero": "GRO",
  "hidalgo": "HID",
  "jalisco": "JAL",
  "michoacan": "MIC", "michoacán": "MIC",
  "morelos": "MOR", "state of morelos": "MOR",
  "nayarit": "NAY",
  "nuevo leon": "NLE", "nuevo león": "NLE",
  "oaxaca": "OAX",
  "puebla": "PUE",
  "queretaro": "QUE", "querétaro": "QUE",
  "quintana roo": "ROO",
  "san luis potosi": "SLP", "san luis potosí": "SLP",
  "sinaloa": "SIN",
  "sonora": "SON",
  "tabasco": "TAB",
  "tamaulipas": "TAM",
  "tlaxcala": "TLA",
  "veracruz": "VER", "veracruz de ignacio de la llave": "VER",
  "yucatan": "YUC", "yucatán": "YUC",
  "zacatecas": "ZAC",
};

function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeCAProvince(s) {
  return CA_PROVINCE[norm(s)] || null;
}

function normalizeMXState(s) {
  return MX_STATE[norm(s)] || null;
}

// ---------------------------------------------------------------------
// Germany Bundesländer (16). Values are GADM HASC_1 codes (DE.BW, …) —
// they're our stable ID for the L1 join.
const DE_STATE = {
  "baden-württemberg": "DE.BW", "baden wurttemberg": "DE.BW", "baden-wurttemberg": "DE.BW", "bw": "DE.BW",
  "bavaria": "DE.BY", "bayern": "DE.BY", "by": "DE.BY",
  "berlin": "DE.BE", "be": "DE.BE",
  "brandenburg": "DE.BR",
  "bremen": "DE.HB", "hb": "DE.HB",
  "hamburg": "DE.HH", "hh": "DE.HH",
  "hesse": "DE.HE", "hessen": "DE.HE", "he": "DE.HE",
  "mecklenburg-vorpommern": "DE.MV", "mecklenburg vorpommern": "DE.MV", "mecklenburg-western pomerania": "DE.MV", "mv": "DE.MV",
  "lower saxony": "DE.NI", "niedersachsen": "DE.NI", "ni": "DE.NI",
  "north rhine-westphalia": "DE.NW", "north rhine westphalia": "DE.NW",
  "nordrhein-westfalen": "DE.NW", "nordrhein westfalen": "DE.NW",
  "nrw": "DE.NW", "nw": "DE.NW",
  "rhineland-palatinate": "DE.RP", "rheinland-pfalz": "DE.RP", "rheinland pfalz": "DE.RP", "rp": "DE.RP",
  "saarland": "DE.SL", "sl": "DE.SL",
  "saxony": "DE.SN", "sachsen": "DE.SN", "sn": "DE.SN",
  "saxony-anhalt": "DE.ST", "sachsen-anhalt": "DE.ST", "sachsen anhalt": "DE.ST", "st": "DE.ST",
  "schleswig-holstein": "DE.SH", "schleswig holstein": "DE.SH", "sh": "DE.SH",
  "thuringia": "DE.TH", "thüringen": "DE.TH", "thuringen": "DE.TH", "th": "DE.TH",
};

// Ordered substring matchers — used when the exact-key lookup misses. Patterns
// are tried in order, first hit wins. Catches typos ("baden-württenberg"),
// district names ("kreis steinfurt"), and ASCII workarounds ("wuerttemberg").
const DE_SUBSTRING = [
  [/wuerttemberg|wütttemberg|württenberg|baden\s*w/, "DE.BW"],
  [/bavar|bayern|niederbayern|mittelfranken/, "DE.BY"],
  [/berlin/, "DE.BE"],
  [/brandenburg/, "DE.BR"],
  [/bremen/, "DE.HB"],
  [/hamburg/, "DE.HH"],
  [/hessen|hesse/, "DE.HE"],
  [/mecklenburg|vorpommern/, "DE.MV"],
  [/niedersachsen|lower saxony|loser saxony|lowe saxony|vechta|salzgitter/, "DE.NI"],
  [/nordrhein|north[- ]?rhine|northrhein|nrw|west(falia|phalia|falen)|steinfurt/, "DE.NW"],
  [/rhineland|rheinland|palatinate|pfalz|palpatine|palentine|palatine/, "DE.RP"],
  [/saarland/, "DE.SL"],
  [/sachsen-anhalt|saxony-anhalt|anhalt/, "DE.ST"],
  [/sachsen|saxony|vogtland/, "DE.SN"],
  [/schleswig|holstein/, "DE.SH"],
  [/thüringen|thuringen|thuringia/, "DE.TH"],
];

function normalizeDEState(s) {
  const k = norm(s);
  if (!k) return null;
  if (DE_STATE[k]) return DE_STATE[k];
  for (const [re, code] of DE_SUBSTRING) if (re.test(k)) return code;
  return null;
}

// ---------------------------------------------------------------------
// UK: classify a respondent into one of the four constituent countries.
// Most people type a county or city name; default everything that isn't
// explicitly Scotland/Wales/NI to England (the largest by far).
const GB_KEYWORDS = {
  SCO: [
    "scotland", "scottish", "edinburgh", "glasgow", "aberdeen", "dundee",
    "stirling", "inverness", "fife", "highlands", "lothian", "perthshire",
    "ayrshire", "lanarkshire",
  ],
  WAL: [
    "wales", "welsh", "cardiff", "swansea", "newport", "anglesey", "gwynedd",
    "powys", "ceredigion", "pembrokeshire", "carmarthenshire", "monmouthshire",
    "wrexham", "rhondda",
  ],
  NIR: [
    "northern ireland", "ulster", "belfast", "antrim", "armagh", "down",
    "fermanagh", "londonderry", "tyrone",
  ],
};

const GB_ID_TO_GID = { ENG: "GBR.1_1", SCO: "GBR.3_1", WAL: "GBR.4_1", NIR: "GBR.2_1" };
const GB_LABEL = { ENG: "England", SCO: "Scotland", WAL: "Wales", NIR: "Northern Ireland" };

// ---------------------------------------------------------------------
// Australia states/territories (8). Values are GADM HASC_1 codes.
const AU_STATE = {
  "new south wales": "AU.NS", "nsw": "AU.NS",
  "victoria": "AU.VI", "vic": "AU.VI",
  "queensland": "AU.QL", "qld": "AU.QL",
  "western australia": "AU.WA", "wa": "AU.WA",
  "south australia": "AU.SA", "sa": "AU.SA",
  "tasmania": "AU.TS", "tas": "AU.TS",
  "australian capital territory": "AU.AC", "act": "AU.AC", "canberra": "AU.AC",
  "northern territory": "AU.NT", "nt": "AU.NT",
};

const AU_SUBSTRING = [
  [/new\s*south\s*wales|sydney|newcastle|wollongong/, "AU.NS"],
  [/victoria|melbourne|geelong|ballarat/, "AU.VI"],
  [/queensland|brisbane|gold coast|cairns|townsville/, "AU.QL"],
  [/western\s*australia|perth|fremantle/, "AU.WA"],
  [/south\s*australia|adelaide/, "AU.SA"],
  [/tasmania|hobart|launceston/, "AU.TS"],
  [/australian\s*capital|canberra/, "AU.AC"],
  [/northern\s*territory|darwin|alice springs/, "AU.NT"],
];

function normalizeAUState(s) {
  const k = norm(s);
  if (!k) return null;
  if (AU_STATE[k]) return AU_STATE[k];
  for (const [re, code] of AU_SUBSTRING) if (re.test(k)) return code;
  return null;
}

function normalizeGBNation(region, city) {
  const hay = (norm(region) + " " + norm(city)).trim();
  if (!hay) return "ENG";
  for (const [code, keys] of Object.entries(GB_KEYWORDS)) {
    for (const k of keys) if (hay.includes(k)) return code;
  }
  return "ENG";
}

// ---------------------------------------------------------------------
// County name normalization for the GADM ↔ Census FIPS join

function normCountyName(s) {
  if (!s) return null;
  let t = String(s).trim();
  t = t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  // Strip a single trailing admin-type suffix. Census convention: lowercase
  // " city" suffix → independent city (e.g. "Baltimore city"). Capitalized
  // " City" is part of a proper noun (e.g. "James City County", "Carson
  // City") — preserve it. The case-sensitive distinction is what makes
  // "James City County" → "James City" (strip "County") while still letting
  // "Baltimore city" → "Baltimore" (strip " city").
  const SUFFIXES_CI = [
    "City and Borough", "Census Area", "Indian Reservation",
    "Municipality", "Municipio", "Borough", "Parish", "County",
  ];
  const SUFFIXES_CS = [" city"]; // case-sensitive — only lowercase form
  let stripped = false;
  for (const suffix of SUFFIXES_CI) {
    const re = new RegExp(`\\s+${suffix}$`, "i");
    if (re.test(t)) { t = t.replace(re, ""); stripped = true; break; }
  }
  if (!stripped) {
    for (const suffix of SUFFIXES_CS) {
      if (t.endsWith(suffix)) { t = t.slice(0, -suffix.length); break; }
    }
  }
  t = t.replace(/\bSt\.?\b/gi, "Saint").replace(/\bSte\.?\b/gi, "Sainte");
  t = t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return t || null;
}

function gadmStateName(s) {
  // GADM concatenates words ("NewYork", "NorthCarolina") — undo to canonical.
  return String(s).replace(/([a-z])([A-Z])/g, "$1 $2");
}

// Used as the "state" half of the GADM ↔ Census join key. Normalizes to a
// case- and space-insensitive form so things like "District of Columbia"
// ↔ "DistrictofColumbia" match without forcing gadmStateName to know about
// every lowercase connector word ("of", "and", "the").
function stateKey(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// ---------------------------------------------------------------------
// ZIP → FIPS via the Census ZCTA relationship file. Pipe-delimited, with
// rows that span multiple counties; for each ZCTA pick the row with the
// largest AREALAND_PART (col 17).

function loadZipCountyCrosswalk() {
  const raw = fs.readFileSync(CROSSWALK_PATH, "utf8");
  const lines = raw.split(/\r?\n/);
  // Header may have a BOM — be defensive.
  const best = new Map(); // zip → { fips, area }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split("|");
    const zip = cols[1];
    const fips = cols[9];
    const area = Number(cols[16]) || 0;
    if (!zip || !fips) continue;
    const prev = best.get(zip);
    if (!prev || area > prev.area) best.set(zip, { fips, area });
  }
  const out = new Map();
  for (const [zip, { fips }] of best) out.set(zip, fips);
  return out;
}

function padZip(s) {
  if (!s) return null;
  const m = String(s).replace(/\s+/g, "").match(/^(\d{3,5})/);
  if (!m) return null;
  return m[1].padStart(5, "0");
}

// ---------------------------------------------------------------------
// GeoNames Canadian populated-places index. Used to look up city lat/lng
// for CA respondents, which we then PIP against the L2 boundary file.

const CA_PROVINCE_TO_GN = {
  AB: "01", BC: "02", MB: "03", NB: "04", NL: "05", NS: "07",
  ON: "08", PE: "09", QC: "10", SK: "11", YT: "12", NT: "13", NU: "14",
};

function loadGeoNamesCA() {
  if (!fs.existsSync(CA_GEONAMES_PATH)) return null;
  const txt = fs.readFileSync(CA_GEONAMES_PATH, "utf8");
  const idx = new Map(); // lowercased name → array of { lat, lng, admin1, pop }
  const lines = txt.split("\n");
  for (const line of lines) {
    if (!line) continue;
    const cols = line.split("\t");
    if (cols[6] !== "P") continue;     // populated places only
    const name = cols[1];
    const ascii = cols[2];
    const alts = cols[3] || "";
    const lat = parseFloat(cols[4]);
    const lng = parseFloat(cols[5]);
    const admin1 = cols[10];
    const pop = parseInt(cols[14], 10) || 0;
    const entry = { lat, lng, admin1, pop };
    for (const n of new Set([name, ascii, ...alts.split(",").filter(Boolean)])) {
      const key = norm(n);
      if (!key) continue;
      const arr = idx.get(key);
      if (arr) arr.push(entry);
      else idx.set(key, [entry]);
    }
  }
  return idx;
}

function lookupCACity(idx, cityRaw, provinceCode) {
  if (!idx) return null;
  const key = norm(cityRaw);
  if (!key) return null;
  const cands = idx.get(key);
  if (!cands || !cands.length) return null;
  const wantAdmin = provinceCode ? CA_PROVINCE_TO_GN[provinceCode] : null;
  let best = null;
  for (const c of cands) {
    if (wantAdmin && c.admin1 !== wantAdmin) continue;
    if (!best || c.pop > best.pop) best = c;
  }
  // No province match? Fall back to the most populous candidate so misspelled
  // or missing provinces still resolve to *something* plausible.
  if (!best) {
    for (const c of cands) if (!best || c.pop > best.pop) best = c;
  }
  return best;
}

// ---------------------------------------------------------------------
// Point-in-polygon (ray casting). `polygon` is a GeoJSON Polygon or
// MultiPolygon — the function checks any matching ring.

function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(pt, geom) {
  if (geom.type === "Polygon") {
    if (!pointInRing(pt, geom.coordinates[0])) return false;
    for (let i = 1; i < geom.coordinates.length; i++) {
      if (pointInRing(pt, geom.coordinates[i])) return false; // inside a hole
    }
    return true;
  }
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      if (!pointInRing(pt, poly[0])) continue;
      let inHole = false;
      for (let i = 1; i < poly.length; i++) {
        if (pointInRing(pt, poly[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}

function bbox(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (ring) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  };
  if (geom.type === "Polygon") for (const r of geom.coordinates) visit(r);
  else if (geom.type === "MultiPolygon") for (const p of geom.coordinates) for (const r of p) visit(r);
  return [minX, minY, maxX, maxY];
}

// ---------------------------------------------------------------------
// GeoJSON helpers

function readGeoJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function ringArea(ring) {
  let s = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function ringCentroid(ring) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a /= 2;
  if (a === 0) return ring[0];
  return [cx / (6 * a), cy / (6 * a)];
}

// Perpendicular distance from p to segment (a, b).
function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = p[0] - a[0], ey = p[1] - a[1];
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const tx = a[0] + Math.max(0, Math.min(1, t)) * dx;
  const ty = a[1] + Math.max(0, Math.min(1, t)) * dy;
  const ex = p[0] - tx, ey = p[1] - ty;
  return Math.sqrt(ex * ex + ey * ey);
}

// Iterative Douglas–Peucker. Tolerance is in degrees. 0.01 ≈ 1.1 km at the
// equator — invisible at country/state zoom.
function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const n = ring.length;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(ring[i], ring[lo], ring[hi]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolerance && idx !== -1) {
      keep[idx] = 1;
      stack.push([lo, idx]);
      stack.push([idx, hi]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]);
  return out.length >= 4 ? out : ring;
}

// Quantize coordinates to a fixed precision and de-duplicate consecutive
// equal points. 4 decimals ≈ 11m at the equator — well below pixel size at
// the zoom range this app uses.
function quantizeCoord(c, mul) {
  return [Math.round(c[0] * mul) / mul, Math.round(c[1] * mul) / mul];
}
function quantizeRing(ring, mul) {
  const out = [];
  let prev = null;
  for (const c of ring) {
    const q = quantizeCoord(c, mul);
    if (!prev || q[0] !== prev[0] || q[1] !== prev[1]) out.push(q);
    prev = q;
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
    out.push([out[0][0], out[0][1]]);
  }
  return out.length >= 4 ? out : null;
}
function quantizeGeometry(g, decimals = 4, simplifyTol = 0) {
  if (!g) return g;
  const mul = Math.pow(10, decimals);
  const process = (ring) => {
    let r = quantizeRing(ring, mul);
    if (r && simplifyTol > 0) r = simplifyRing(r, simplifyTol);
    return r;
  };
  if (g.type === "Polygon") {
    const rings = g.coordinates.map(process).filter(Boolean);
    return rings.length ? { type: "Polygon", coordinates: rings } : g;
  }
  if (g.type === "MultiPolygon") {
    const polys = g.coordinates
      .map((p) => p.map(process).filter(Boolean))
      .filter((p) => p.length);
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : g;
  }
  return g;
}

function featureCentroid(f) {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === "Polygon") return ringCentroid(g.coordinates[0]);
  if (g.type === "MultiPolygon") {
    let best = null, bestArea = -Infinity;
    for (const poly of g.coordinates) {
      const a = Math.abs(ringArea(poly[0]));
      if (a > bestArea) { bestArea = a; best = poly[0]; }
    }
    return best ? ringCentroid(best) : null;
  }
  return null;
}

// ---------------------------------------------------------------------
// Main

function dominantTeam(counts) {
  let topTeam = null, topCount = 0, ties = 0, total = 0;
  for (const [team, n] of Object.entries(counts)) {
    total += n;
    if (n > topCount) { topTeam = team; topCount = n; ties = 1; }
    else if (n === topCount) ties += 1;
  }
  if (!topTeam) return { team: null, pct: 0 };
  if (ties > 1) return { team: "__contested__", pct: topCount / total };
  return { team: topTeam, pct: topCount / total };
}

function readResponses() {
  let txt = fs.readFileSync(RESPONSES_PATH, "utf8");
  // The export has CRLF endings → trims happen below per-cell, but normalize
  // here once so columns line up cleanly.
  txt = txt.replace(/\r\n/g, "\n");
  return parse(txt, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const responses = readResponses();
  const zipToFips = loadZipCountyCrosswalk();
  const caCities = loadGeoNamesCA();

  // Pre-index CA L2 polygons by bbox so we can PIP-test efficiently.
  const caDivisions = readGeoJSON(DIVISIONS_CA_PATH);
  const caDivIndex = caDivisions.features.map((f) => ({ f, bbox: bbox(f.geometry) }));

  function resolveCALevel2(row) {
    if (!caCities) return null;
    const provCode = normalizeCAProvince(row[COL_REGION]);
    const hit = lookupCACity(caCities, row[COL_CITY], provCode);
    if (!hit) return null;
    const pt = [hit.lng, hit.lat];
    for (const { f, bbox: bb } of caDivIndex) {
      if (pt[0] < bb[0] || pt[0] > bb[2] || pt[1] < bb[1] || pt[1] > bb[3]) continue;
      if (pointInGeometry(pt, f.geometry)) return f.properties.GID_2;
    }
    return null;
  }

  const aggregates = new Map(); // key → { country, level, id, total, a_counts }
  const skipped = {
    badCountry: 0,
    usNoZip: 0,
    usBadZip: 0,
    caNoLevel: 0,    // CA — neither city PIP nor province name resolved
    mxNoState: 0,
    deNoState: 0,
    auNoState: 0,
    other: 0,
  };
  const byCountry = {};
  let validRows = 0;
  let teamCounts = {};

  for (const row of responses) {
    const country = normalizeCountry(row[COL_COUNTRY]);
    if (!country) { skipped.badCountry += 1; continue; }

    let level = null;
    let id = null;
    if (country === "US") {
      const zip = padZip(row[COL_ZIP]);
      if (!zip) { skipped.usNoZip += 1; continue; }
      const fips = zipToFips.get(zip);
      if (!fips) { skipped.usBadZip += 1; continue; }
      level = "county";
      id = fips;
    } else if (country === "CA") {
      // L2 first (city → census division via PIP). Fall back to L1 (province
      // by name) if city geocoding fails so we don't drop CA respondents.
      const divisionGid = resolveCALevel2(row);
      if (divisionGid) {
        level = "division";
        id = divisionGid;
      } else {
        const p = normalizeCAProvince(row[COL_REGION]);
        if (p) { level = "province"; id = p; }
        else { skipped.caNoLevel += 1; continue; }
      }
    } else if (country === "MX") {
      const s = normalizeMXState(row[COL_REGION]);
      if (!s) { skipped.mxNoState += 1; continue; }
      level = "state";
      id = s;
    } else if (country === "DE") {
      const s = normalizeDEState(row[COL_REGION]);
      if (!s) { skipped.deNoState += 1; continue; }
      level = "de_state";
      id = s;
    } else if (country === "AU") {
      const s = normalizeAUState(row[COL_REGION]);
      if (!s) { skipped.auNoState += 1; continue; }
      level = "au_state";
      id = s;
    } else if (country === "GB") {
      const nation = normalizeGBNation(row[COL_REGION], row[COL_CITY]);
      level = "gb_nation";
      id = nation;
    } else {
      level = "country";
      id = country;
    }

    const team = String(row[COL_TEAM] || "").trim();
    if (!team) { skipped.other += 1; continue; }

    const key = `${country}:${level}:${id}`;
    let agg = aggregates.get(key);
    if (!agg) {
      agg = { country, level, id, total: 0, a_counts: {} };
      aggregates.set(key, agg);
    }
    agg.total += 1;
    agg.a_counts[team] = (agg.a_counts[team] || 0) + 1;
    teamCounts[team] = (teamCounts[team] || 0) + 1;
    byCountry[country] = (byCountry[country] || 0) + 1;
    validRows += 1;
  }

  // Compute dominants
  for (const agg of aggregates.values()) {
    const dom = dominantTeam(agg.a_counts);
    agg.a_total = agg.total;
    agg.a_dominant = dom.team;
    agg.a_dominant_pct = Number(dom.pct.toFixed(4));
  }

  // ----- Join: US counties (GADM USA L2 by state+name) -----
  // GADM concatenates compound names — "Carson City" → "CarsonCity",
  // "District of Columbia" → "DistrictofColumbia". Split before normalizing
  // so the trailing-suffix logic in normCountyName behaves the same on both
  // sides of the join.
  const counties = readGeoJSON(COUNTIES_PATH);
  const gadmCountyByKey = new Map(); // `${stateKey}|${countyKey}` → feature
  for (const f of counties.features) {
    const sk = stateKey(f.properties.NAME_1);
    const countyKey = normCountyName(gadmStateName(f.properties.NAME_2));
    if (!sk || !countyKey) continue;
    gadmCountyByKey.set(`${sk}|${countyKey}`, f);
  }
  // Pull crosswalk county names — we need FIPS → (stateName, countyKey).
  // Re-scan the crosswalk to grab the county name for each FIPS.
  const fipsMeta = new Map(); // fips → { stateName, countyKey, namelsad }
  {
    const lines = fs.readFileSync(CROSSWALK_PATH, "utf8").split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("|");
      const fips = cols[9];
      const namelsad = cols[10];
      if (!fips || fipsMeta.has(fips)) continue;
      const stateFips = fips.slice(0, 2);
      const stateName = FIPS_TO_STATE[stateFips];
      if (!stateName) continue;
      fipsMeta.set(fips, {
        stateName,
        stateUsps: STATE_FIPS_TO_USPS[stateFips],
        countyKey: normCountyName(namelsad),
        namelsad,
      });
    }
  }

  // ----- Join: CA provinces -----
  const provinces = readGeoJSON(PROVINCES_PATH);
  const gadmProvByISO = new Map();
  for (const f of provinces.features) {
    const iso1 = f.properties.ISO_1; // "CA-ON"
    if (iso1 && iso1 !== "NA") {
      gadmProvByISO.set(iso1.replace(/^CA-/, ""), f);
    }
    // Quebec has ISO_1 = "NA" in this file; fall back to NAME_1.
    const name = f.properties.NAME_1;
    if (name === "Québec") gadmProvByISO.set("QC", f);
  }

  // ----- Join: MX states -----
  // GADM marks some states' ISO_1 as "NA"; fall back to NAME_1 → 3-letter
  // subdivision code so every aggregate finds a polygon.
  const MX_NAME_TO_ISO = {
    "Coahuila": "COA", "DistritoFederal": "CMX", "México": "MEX",
    "Michoacán": "MIC", "NuevoLeón": "NLE", "Querétaro": "QUE",
    "SanLuisPotosí": "SLP", "Veracruz": "VER", "Yucatán": "YUC",
  };
  const mxStates = readGeoJSON(STATES_PATH);
  const gadmMxByISO = new Map();
  for (const f of mxStates.features) {
    const iso1 = f.properties.ISO_1; // "MX-AGU" or "NA"
    if (iso1 && iso1 !== "NA") {
      gadmMxByISO.set(iso1.replace(/^MX-/, ""), f);
      continue;
    }
    const fallback = MX_NAME_TO_ISO[f.properties.NAME_1];
    if (fallback) gadmMxByISO.set(fallback, f);
  }

  // ----- Join: CA L2 census divisions -----
  const gadmCADivByGID = new Map();
  for (const f of caDivisions.features) {
    const gid = f.properties.GID_2;
    if (gid) gadmCADivByGID.set(gid, f);
  }

  // ----- Join: DE L1 Bundesländer (by HASC_1 code) -----
  const deStates = readGeoJSON(STATES_DE_PATH);
  const gadmDEByHASC = new Map();
  for (const f of deStates.features) {
    const hasc = f.properties.HASC_1;
    if (hasc && hasc !== "NA") gadmDEByHASC.set(hasc, f);
  }

  // ----- Join: AU L1 states/territories (by HASC_1 code) -----
  const auStates = readGeoJSON(STATES_AU_PATH);
  const gadmAUByHASC = new Map();
  for (const f of auStates.features) {
    const hasc = f.properties.HASC_1;
    if (hasc && hasc !== "NA") gadmAUByHASC.set(hasc, f);
  }

  // ----- Join: GB L1 constituent countries -----
  // GADM's England has GID_1=GBR.1_1 but NAME_1=NA; the other three are clean.
  const gbNations = readGeoJSON(NATIONS_GB_PATH);
  const gadmGBByCode = new Map();
  for (const f of gbNations.features) {
    if (f.properties.GID_1 === "GBR.1_1") gadmGBByCode.set("ENG", f);
    else if (f.properties.GID_1 === "GBR.2_1") gadmGBByCode.set("NIR", f);
    else if (f.properties.GID_1 === "GBR.3_1") gadmGBByCode.set("SCO", f);
    else if (f.properties.GID_1 === "GBR.4_1") gadmGBByCode.set("WAL", f);
  }

  // ----- Join: countries (rest of world only) -----
  const countries = readGeoJSON(COUNTRIES_PATH);
  const gadmCountryByISO = new Map();
  for (const f of countries.features) {
    const a2 = f.properties.ISO_A2;
    if (a2) gadmCountryByISO.set(a2, f);
  }

  // Build outputs
  const polygons = { type: "FeatureCollection", features: [] };
  const centroids = { type: "FeatureCollection", features: [] };
  let unjoined = 0;
  const unjoinedDetails = [];

  function emit(agg, feature, regionLabel) {
    if (!feature) { unjoined += 1; unjoinedDetails.push(`${agg.country}:${agg.level}:${agg.id}`); return; }
    const props = {
      region: regionLabel,
      id: agg.id,
      country: agg.country,
      level: agg.level,
      total: agg.total,
      a_total: agg.a_total,
      a_counts: agg.a_counts,
      a_dominant: agg.a_dominant,
      a_dominant_pct: agg.a_dominant_pct,
    };
    // Polygons at 3-decimal precision + Douglas–Peucker simplification.
    // Country polygons get a coarser tolerance (we view them at globe zoom),
    // sub-national polygons get a tighter one.
    const tol =
      agg.level === "country" ? 0.03 :
      agg.level === "county" || agg.level === "division" ? 0.005 :
      0.01;
    polygons.features.push({ type: "Feature", geometry: quantizeGeometry(feature.geometry, 3, tol), properties: props });
    const c = featureCentroid(feature);
    if (c) {
      centroids.features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: c },
        properties: props,
      });
    }
  }

  for (const agg of aggregates.values()) {
    if (agg.level === "county") {
      const meta = fipsMeta.get(agg.id);
      if (!meta) {
        unjoined += 1;
        unjoinedDetails.push(`${agg.country}:${agg.level}:${agg.id} (no FIPS meta)`);
        continue;
      }
      const feature = gadmCountyByKey.get(`${stateKey(meta.stateName)}|${meta.countyKey}`);
      const label = feature
        ? `${gadmStateName(feature.properties.NAME_2)}${feature.properties.ENGTYPE_2 === "IndependentCity" ? "" : " " + (feature.properties.ENGTYPE_2 || "County")}, ${meta.stateUsps}`
        : `${meta.namelsad}, ${meta.stateUsps}`;
      emit(agg, feature, label);
    } else if (agg.level === "province") {
      const f = gadmProvByISO.get(agg.id);
      const label = f ? gadmStateName(f.properties.NAME_1) : agg.id;
      emit(agg, f, label);
    } else if (agg.level === "division") {
      const f = gadmCADivByGID.get(agg.id);
      const label = f
        ? `${gadmStateName(f.properties.NAME_2)}, ${gadmStateName(f.properties.NAME_1)}`
        : agg.id;
      emit(agg, f, label);
    } else if (agg.level === "state") {
      const f = gadmMxByISO.get(agg.id);
      const label = f ? gadmStateName(f.properties.NAME_1) : agg.id;
      emit(agg, f, label);
    } else if (agg.level === "de_state") {
      const f = gadmDEByHASC.get(agg.id);
      const label = f ? f.properties.NAME_1 : agg.id;
      emit(agg, f, label);
    } else if (agg.level === "au_state") {
      const f = gadmAUByHASC.get(agg.id);
      const label = f ? gadmStateName(f.properties.NAME_1) : agg.id;
      emit(agg, f, label);
    } else if (agg.level === "gb_nation") {
      const f = gadmGBByCode.get(agg.id);
      emit(agg, f, GB_LABEL[agg.id] || agg.id);
    } else if (agg.level === "country") {
      const f = gadmCountryByISO.get(agg.id);
      const iso2obj = iso.whereAlpha2(agg.id);
      const label = f?.properties?.NAME || iso2obj?.country || agg.id;
      emit(agg, f, label);
    }
  }

  // Layer ordering: Mapbox draws features in the order they appear in the
  // source. Larger polygons (countries, provinces) need to render *before*
  // the smaller ones that sit inside them so the smaller polygons paint on
  // top. Specifically: in CA, an unresolved-city respondent gets routed to
  // the province (level=province), and that province polygon overlaps every
  // census-division polygon in the same province — so divisions must paint
  // last.
  const LEVEL_PAINT_ORDER = {
    country: 0,
    province: 1,
    gb_nation: 1,
    de_state: 1,
    au_state: 1,
    state: 1,        // MX states
    division: 2,
    county: 2,
  };
  polygons.features.sort(
    (a, b) =>
      (LEVEL_PAINT_ORDER[a.properties.level] ?? 1) -
      (LEVEL_PAINT_ORDER[b.properties.level] ?? 1),
  );

  // Sort totals
  const aTotals = Object.entries(teamCounts)
    .map(([short_name, count]) => ({ short_name, count }))
    .sort((a, b) => b.count - a.count);

  const uniqueRegions = polygons.features.length;
  const totalRows = responses.length;

  const totals = {
    meta: {
      total_rows: totalRows,
      valid_rows: validRows,
      skipped_bad_country: skipped.badCountry,
      skipped_no_region:
        skipped.usNoZip +
        skipped.usBadZip +
        skipped.caNoLevel +
        skipped.mxNoState +
        skipped.deNoState +
        skipped.auNoState +
        skipped.other,
      skipped_breakdown: skipped,
      unique_regions: uniqueRegions,
      a_responses: validRows,
      a_categories: aTotals.length,
      by_country: byCountry,
    },
    a: aTotals,
  };

  fs.writeFileSync(path.join(OUT, "regions_polygons.geojson"), JSON.stringify(polygons));
  fs.writeFileSync(path.join(OUT, "regions_centroids.geojson"), JSON.stringify(centroids));
  fs.writeFileSync(path.join(OUT, "totals.json"), JSON.stringify(totals, null, 2));

  console.log(`Preprocess complete.`);
  console.log(`  rows: ${totalRows}, valid: ${validRows}, dropped: ${totalRows - validRows}`);
  console.log(`  skipped:`, skipped);
  console.log(`  regions: ${uniqueRegions} (polygons: ${polygons.features.length}, centroids: ${centroids.features.length})`);
  console.log(`  unjoined aggregates: ${unjoined}`);
  if (unjoined && process.env.VERBOSE) {
    console.log("  unjoined keys:", unjoinedDetails.slice(0, 30));
  }
  console.log(`  by_country (top 10):`, Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 10));
  console.log(`  team totals (top 5):`, aTotals.slice(0, 5));
}

main();
