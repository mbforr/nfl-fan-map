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
//   DE  → Bundesland          (GADM DEU L1, joined by HASC_1)
//   AU  → state/territory     (GADM AUS L1, joined by HASC_1)
//   ES  → autonomous community (GADM ESP L1, joined by HASC_1)
//   GB  → constituent country / English L2 division
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
const STATES_US_PATH = path.join(DATA, "states_us.geojson");
const PROVINCES_PATH = path.join(DATA, "provinces_ca.geojson");
const DIVISIONS_CA_PATH = path.join(DATA, "divisions_ca.geojson");
const STATES_PATH = path.join(DATA, "states_mx.geojson");
const STATES_DE_PATH = path.join(DATA, "states_de.geojson");
const STATES_AU_PATH = path.join(DATA, "states_au.geojson");
const STATES_ES_PATH = path.join(DATA, "states_es.geojson");
const NATIONS_GB_PATH = path.join(DATA, "nations_gb.geojson");
const DIVISIONS_GB_PATH = path.join(DATA, "divisions_gb.geojson");
const COUNTRIES_PATH = path.join(DATA, "countries_world.geojson");
const CA_GEONAMES_PATH = path.join(DATA, "_raw/CA.txt");
const GB_GEONAMES_PATH = path.join(DATA, "_raw/GB.txt");
const US_GEONAMES_PATH = path.join(DATA, "_raw/US.txt");

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

const USPS_TO_STATE_FIPS = Object.fromEntries(
  Object.entries(STATE_FIPS_TO_USPS).map(([fips, usps]) => [usps, fips]));
const USPS_SET = new Set(Object.values(STATE_FIPS_TO_USPS));
const STATE_NAME_TO_USPS = Object.fromEntries(
  Object.entries(FIPS_TO_STATE).map(([fips, name]) =>
    [name.toLowerCase(), STATE_FIPS_TO_USPS[fips]]));
// Common free-text abbreviations the survey produced (beyond full name / USPS).
const US_STATE_ALIASES = {
  "calif": "CA", "cali": "CA", "penn": "PA", "penna": "PA", "mass": "MA",
  "tex": "TX", "fla": "FL", "ill": "IL", "conn": "CT", "wash": "WA",
  "washington dc": "DC", "washington, dc": "DC", "d.c.": "DC", "dc": "DC",
};

// Free-text US state → 2-letter USPS. Handles full names, USPS codes, "D.C.",
// trailing punctuation/whitespace, and a few common abbreviations. Returns null
// when nothing resolves (row is then counted as unresolvable).
function normalizeUSState(raw) {
  if (!raw) return null;
  let t = String(raw).normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .trim().replace(/\s+/g, " ");
  if (!t) return null;
  const up = t.toUpperCase();
  if (up.length === 2 && USPS_SET.has(up)) return up;
  const low = t.toLowerCase().replace(/\.$/, "");
  if (US_STATE_ALIASES[low]) return US_STATE_ALIASES[low];
  if (STATE_NAME_TO_USPS[low]) return STATE_NAME_TO_USPS[low];
  if (low.includes("washington") && /\bd\.?c\.?\b/.test(low)) return "DC";
  return null;
}

// Pull a bare 5-digit ZIP out of a messy postal field, e.g.
// "Current: 23188, growing up: 23508" → "23188". Not adjacent to other digits
// so we don't grab 5 of a 9-digit string's tail.
function salvageEmbeddedZip(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(?<!\d)(\d{5})(?!\d)/);
  return m ? m[1] : null;
}

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

// ---------------------------------------------------------------------
// Spain autonomous communities (17 + Ceuta/Melilla). Values are GADM
// HASC_1 codes (ES.MD, ES.CT, …). Respondents overwhelmingly type a
// *province* (Barcelona, Málaga, Salamanca) or city rather than the
// community, so the lookup folds all 50 provinces + major cities up into
// their community. Keys are accent-stripped lowercase (see normalizeESState).
const ES_STATE = {
  // Andalucía
  "andalucia": "ES.AN", "andalusia": "ES.AN", "almeria": "ES.AN", "cadiz": "ES.AN",
  "cordoba": "ES.AN", "granada": "ES.AN", "huelva": "ES.AN", "jaen": "ES.AN",
  "malaga": "ES.AN", "sevilla": "ES.AN", "seville": "ES.AN",
  // Aragón
  "aragon": "ES.AR", "huesca": "ES.AR", "teruel": "ES.AR", "zaragoza": "ES.AR", "saragossa": "ES.AR",
  // Principado de Asturias
  "asturias": "ES.AS", "principado de asturias": "ES.AS", "oviedo": "ES.AS", "gijon": "ES.AS", "aviles": "ES.AS",
  // Cantabria
  "cantabria": "ES.CB", "santander": "ES.CB",
  // Castilla y León
  "castilla y leon": "ES.CL", "castilla leon": "ES.CL", "castile and leon": "ES.CL",
  "avila": "ES.CL", "burgos": "ES.CL", "leon": "ES.CL", "palencia": "ES.CL",
  "salamanca": "ES.CL", "segovia": "ES.CL", "soria": "ES.CL", "valladolid": "ES.CL", "zamora": "ES.CL",
  // Castilla-La Mancha
  "castilla-la mancha": "ES.CM", "castilla la mancha": "ES.CM", "castile-la mancha": "ES.CM", "castille-la mancha": "ES.CM",
  "albacete": "ES.CM", "ciudad real": "ES.CM", "cuenca": "ES.CM", "guadalajara": "ES.CM", "toledo": "ES.CM",
  // Cataluña
  "cataluna": "ES.CT", "catalunya": "ES.CT", "catalonia": "ES.CT", "barcelona": "ES.CT",
  "girona": "ES.CT", "gerona": "ES.CT", "lleida": "ES.CT", "lerida": "ES.CT", "tarragona": "ES.CT",
  // Comunidad de Madrid
  "madrid": "ES.MD", "comunidad de madrid": "ES.MD", "community of madrid": "ES.MD",
  // Comunidad Valenciana
  "comunidad valenciana": "ES.VC", "valencian community": "ES.VC", "valencia": "ES.VC",
  "alicante": "ES.VC", "alacant": "ES.VC", "castellon": "ES.VC", "castello de la plana": "ES.VC",
  // Extremadura
  "extremadura": "ES.EX", "badajoz": "ES.EX", "caceres": "ES.EX", "merida": "ES.EX",
  // Galicia
  "galicia": "ES.GA", "a coruna": "ES.GA", "coruna": "ES.GA", "la coruna": "ES.GA",
  "lugo": "ES.GA", "ourense": "ES.GA", "orense": "ES.GA", "pontevedra": "ES.GA", "vigo": "ES.GA",
  // Islas Baleares
  "islas baleares": "ES.PM", "baleares": "ES.PM", "balearic islands": "ES.PM", "illes balears": "ES.PM",
  "palma": "ES.PM", "mallorca": "ES.PM", "majorca": "ES.PM", "ibiza": "ES.PM", "menorca": "ES.PM",
  // Islas Canarias
  "islas canarias": "ES.CN", "canarias": "ES.CN", "canary islands": "ES.CN", "las palmas": "ES.CN",
  "santa cruz de tenerife": "ES.CN", "tenerife": "ES.CN", "tf": "ES.CN", "gran canaria": "ES.CN", "fuerteventura": "ES.CN",
  // La Rioja
  "la rioja": "ES.LO", "rioja": "ES.LO", "logrono": "ES.LO",
  // Comunidad Foral de Navarra
  "navarra": "ES.NA", "navarre": "ES.NA", "comunidad foral de navarra": "ES.NA", "pamplona": "ES.NA", "iruna": "ES.NA",
  // País Vasco
  "pais vasco": "ES.PV", "basque country": "ES.PV", "euskadi": "ES.PV", "alava": "ES.PV",
  "araba": "ES.PV", "vitoria": "ES.PV", "guipuzcoa": "ES.PV", "gipuzkoa": "ES.PV",
  "san sebastian": "ES.PV", "donostia": "ES.PV", "vizcaya": "ES.PV", "bizkaia": "ES.PV", "bilbao": "ES.PV",
  // Región de Murcia
  "murcia": "ES.MU", "region de murcia": "ES.MU", "cartagena": "ES.MU",
  // Ceuta y Melilla
  "ceuta": "ES.ML", "melilla": "ES.ML", "ceuta y melilla": "ES.ML",
};

// Ordered substring matchers — tried when the exact-key lookup misses. Catches
// compound entries ("madrid, spain"), city names, and island provinces.
const ES_SUBSTRING = [
  [/madrid/, "ES.MD"],
  [/barcelona|catalu|catalo|girona|gerona|tarragona|lleida|lerida/, "ES.CT"],
  [/valencia|alicante|castello|alacant/, "ES.VC"],
  [/andaluc|andalus|malaga|sevill|cadiz|granada|cordoba|huelva|jaen|almeria/, "ES.AN"],
  [/galicia|coruna|pontevedra|ourense|orense|vigo|lugo/, "ES.GA"],
  [/pais vasc|basque|euskadi|euskal|vizcaya|bizkaia|bilbao|guipuzcoa|gipuzkoa|donostia|gasteiz|vitoria|alava|araba/, "ES.PV"],
  [/asturias|oviedo|gijon/, "ES.AS"],
  [/murcia|cartagena/, "ES.MU"],
  [/aragon|zaragoza|huesca|teruel/, "ES.AR"],
  [/castilla y leon|castilla leon|salamanca|valladolid|burgos|\bleon\b|segovia|zamora|palencia|soria|avila/, "ES.CL"],
  [/castil\w*.?la mancha|albacete|toledo|cuenca|guadalajara|ciudad real/, "ES.CM"],
  [/extremadura|badajoz|caceres|merida/, "ES.EX"],
  [/canaria|tenerife|las palmas|fuerteventura|lanzarote|la palma|gomera|hierro/, "ES.CN"],
  [/balear|mallorca|majorca|ibiza|menorca|palma/, "ES.PM"],
  [/navarra|navarre|pamplona/, "ES.NA"],
  [/la rioja|rioja|logrono/, "ES.LO"],
  [/cantabria|santander/, "ES.CB"],
  [/ceuta|melilla/, "ES.ML"],
];

// Strip diacritics so "Andalucía"/"Málaga" match the ASCII keys above.
function deaccent(s) {
  return String(s || "").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Clean display names for the popup, keyed by HASC_1.
const ES_LABEL = {
  "ES.AN": "Andalucía", "ES.AR": "Aragón", "ES.AS": "Asturias", "ES.CB": "Cantabria",
  "ES.CL": "Castilla y León", "ES.CM": "Castilla-La Mancha", "ES.CT": "Cataluña",
  "ES.MD": "Comunidad de Madrid", "ES.VC": "Comunidad Valenciana", "ES.EX": "Extremadura",
  "ES.GA": "Galicia", "ES.PM": "Islas Baleares", "ES.CN": "Islas Canarias",
  "ES.LO": "La Rioja", "ES.NA": "Navarra", "ES.PV": "País Vasco", "ES.MU": "Región de Murcia",
  "ES.ML": "Ceuta y Melilla",
};

function normalizeESState(s) {
  const k = deaccent(norm(s));
  if (!k) return null;
  if (ES_STATE[k]) return ES_STATE[k];
  for (const [re, code] of ES_SUBSTRING) if (re.test(k)) return code;
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

// Independent cities (Baltimore, St. Louis, and Virginia's ~38) are separate
// FIPS from a same-named county but GADM ships only ONE "Baltimore" / "Roanoke"
// / "St. Louis" L2 polygon. Because normCountyName strips both "County" and
// " city", the city FIPS and county FIPS collide on the same GADM feature and
// emit as two overlapping same-label polygons. Coalesce each independent-city
// FIPS into its same-named county FIPS so they aggregate as one region.
// Derived from the crosswalk (no hardcoded FIPS): within a state, any group of
// FIPS sharing a normalized county name is a name-collision; the canonical id
// is the entry NOT ending in " city" (the actual county/parish/borough).
function loadIndependentCityRemap() {
  const lines = fs.readFileSync(CROSSWALK_PATH, "utf8").split(/\r?\n/);
  const byKey = new Map(); // `${stateFips}|${countyKey}` → [{ fips, namelsad }]
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("|");
    const fips = cols[9];
    const namelsad = cols[10];
    if (!fips || seen.has(fips)) continue;
    seen.add(fips);
    const ck = normCountyName(namelsad);
    if (!ck) continue;
    const key = `${fips.slice(0, 2)}|${ck}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ fips, namelsad });
  }
  const remap = new Map(); // cityFips → countyFips
  for (const entries of byKey.values()) {
    if (entries.length < 2) continue;
    const county = entries.find((e) => !/\scity$/.test(e.namelsad)) || entries[0];
    for (const e of entries) {
      if (e.fips !== county.fips) remap.set(e.fips, county.fips);
    }
  }
  return remap;
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

function loadGeoNames(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const txt = fs.readFileSync(filePath, "utf8");
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
    const admin2 = cols[11];        // US: 3-digit county FIPS (unused for CA/GB)
    const pop = parseInt(cols[14], 10) || 0;
    const entry = { name, asciiname: ascii, lat, lng, admin1, admin2, pop };
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

function lookupCity(idx, cityRaw, preferredAdmin = null) {
  if (!idx) return null;
  const key = norm(cityRaw);
  if (!key) return null;
  const cands = idx.get(key);
  if (!cands || !cands.length) return null;
  let best = null;
  if (preferredAdmin) {
    for (const c of cands) {
      if (c.admin1 !== preferredAdmin) continue;
      if (!best || c.pop > best.pop) best = c;
    }
  }
  // No admin match (or none requested): fall back to most-populous candidate.
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

// Geodesic ring area in m² (spherical excess — the same formula @turf/area uses).
// ringArea() above is a planar shoelace in *square degrees*, which is fine for
// picking the largest ring but meaningless as an area: a degree of longitude is
// ~111 km at the equator and ~0 at the poles.
function ringAreaGeodesic(ring) {
  const R = 6378137;
  const rad = (d) => (d * Math.PI) / 180;
  let t = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    t += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
  }
  return Math.abs((t * R * R) / 2);
}

// Polygon/MultiPolygon area in km²: outer ring minus its holes, summed over parts.
function geometryAreaKm2(g) {
  if (!g) return 0;
  const polyArea = (rings) => {
    if (!rings || !rings.length) return 0;
    let a = ringAreaGeodesic(rings[0]);
    for (let i = 1; i < rings.length; i++) a -= ringAreaGeodesic(rings[i]);
    return Math.max(0, a);
  };
  let m2 = 0;
  if (g.type === "Polygon") m2 = polyArea(g.coordinates);
  else if (g.type === "MultiPolygon") for (const poly of g.coordinates) m2 += polyArea(poly);
  else return 0;
  return m2 / 1e6;
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
  const cityToCountyFips = loadIndependentCityRemap();
  const caCities = loadGeoNames(CA_GEONAMES_PATH);
  const gbCities = loadGeoNames(GB_GEONAMES_PATH);
  const usCities = loadGeoNames(US_GEONAMES_PATH);

  // Pre-index CA L2 polygons by bbox so we can PIP-test efficiently.
  const caDivisions = readGeoJSON(DIVISIONS_CA_PATH);
  const caDivIndex = caDivisions.features.map((f) => ({ f, bbox: bbox(f.geometry) }));

  // GB L2 divisions, but only England — Scotland/Wales/NI stay at L1.
  const gbDivisions = readGeoJSON(DIVISIONS_GB_PATH);
  const gbDivIndex = gbDivisions.features
    .filter((f) => f.properties.NAME_1 === "England")
    .map((f) => ({ f, bbox: bbox(f.geometry) }));

  function resolveCALevel2(row) {
    if (!caCities) return null;
    const provCode = normalizeCAProvince(row[COL_REGION]);
    const hit = lookupCity(caCities, row[COL_CITY], provCode ? CA_PROVINCE_TO_GN[provCode] : null);
    if (!hit) return null;
    const pt = [hit.lng, hit.lat];
    for (const { f, bbox: bb } of caDivIndex) {
      if (pt[0] < bb[0] || pt[0] > bb[2] || pt[1] < bb[1] || pt[1] > bb[3]) continue;
      if (pointInGeometry(pt, f.geometry)) return f.properties.GID_2;
    }
    return null;
  }

  // US fallback for rows with no usable ZIP: city + state → county FIPS via the
  // GeoNames gazetteer (admin1 = USPS state, admin2 = 3-digit county FIPS). The
  // state must match the resolved city's state (no cross-state guessing), which
  // disambiguates the many like-named towns (Nashville TN vs Nashville NC …).
  function resolveUSCountyByCity(row) {
    if (!usCities) return null;
    const st = normalizeUSState(row[COL_REGION]);
    if (!st) return null;
    const hit = lookupCity(usCities, row[COL_CITY], st);
    if (!hit || hit.admin1 !== st || !hit.admin2) return null;
    const sf = USPS_TO_STATE_FIPS[st];
    if (!sf) return null;
    return sf + String(hit.admin2).padStart(3, "0");
  }

  function resolveEnglandLevel2(row) {
    if (!gbCities) return null;
    // City field for UK respondents is the strongest signal. The survey's
    // region field often has the same name (Surrey, Kent, …); both go
    // through the city index since GeoNames includes places-of-counties.
    const candidates = [row[COL_CITY], row[COL_REGION]];
    for (const raw of candidates) {
      const hit = lookupCity(gbCities, raw);
      if (!hit) continue;
      const pt = [hit.lng, hit.lat];
      for (const { f, bbox: bb } of gbDivIndex) {
        if (pt[0] < bb[0] || pt[0] > bb[2] || pt[1] < bb[1] || pt[1] > bb[3]) continue;
        if (pointInGeometry(pt, f.geometry)) return f.properties.GID_2;
      }
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
    esNoState: 0,
    other: 0,
  };
  const recovered = { byCity: 0, byEmbeddedZip: 0 }; // US rows saved from the drop pile
  const byCountry = {};
  let validRows = 0;
  let teamCounts = {};

  for (const row of responses) {
    const country = normalizeCountry(row[COL_COUNTRY]);
    if (!country) { skipped.badCountry += 1; continue; }

    let level = null;
    let id = null;
    if (country === "US") {
      // 1) ZIP as given, then a ZIP salvaged from a messy postal field.
      const zip = padZip(row[COL_ZIP]) || salvageEmbeddedZip(row[COL_ZIP]);
      let fips = zip ? zipToFips.get(zip) || null : null;
      if (fips && !padZip(row[COL_ZIP])) recovered.byEmbeddedZip += 1;
      // 2) Fallback: city + state → county via the gazetteer.
      if (!fips) {
        fips = resolveUSCountyByCity(row);
        if (fips) recovered.byCity += 1;
      }
      if (!fips) {
        if (!zip) skipped.usNoZip += 1; else skipped.usBadZip += 1;
        continue;
      }
      level = "county";
      id = cityToCountyFips.get(fips) || fips; // fold independent cities into their county
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
    } else if (country === "ES") {
      // Region field is the strongest signal (province or community name);
      // fall back to the city field so an empty region still resolves.
      const s = normalizeESState(row[COL_REGION]) || normalizeESState(row[COL_CITY]);
      if (!s) { skipped.esNoState += 1; continue; }
      level = "es_state";
      id = s;
    } else if (country === "GB") {
      // Roll the UK up to its four constituent nations (England / Scotland /
      // Wales / Northern Ireland) — the logical unit for this survey's volume.
      // English L2 divisions were too granular, so England is no longer split.
      level = "gb_nation";
      id = normalizeGBNation(row[COL_REGION], row[COL_CITY]);
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

  // ----- Sub-national rollup by response volume -----
  // Outside the US, only show a sub-national boundary if it clears a response
  // threshold; sparser regions roll up to the next-coarser level, cascading to
  // the country. (US counties are always shown.) This stops thin-data areas
  // from fragmenting into dozens of 1–2 response polygons.
  const SUBNAT_MIN = 30; // must exceed this many responses to stand alone

  // CA census division (GID_2) → province ISO, read straight off the division
  // feature's own province name (NAME_1).
  const caDivToProv = new Map();
  for (const f of caDivisions.features) {
    const prov = normalizeCAProvince(f.properties.NAME_1);
    if (prov) caDivToProv.set(f.properties.GID_2, prov);
  }

  function rollupParent(agg) {
    if (agg.country === "US") return null;
    switch (agg.level) {
      case "division": { // CA census division → province (→ country)
        const prov = caDivToProv.get(agg.id);
        return prov
          ? { country: "CA", level: "province", id: prov }
          : { country: "CA", level: "country", id: "CA" };
      }
      case "province":   // CA
      case "de_state":
      case "au_state":
        return { country: agg.country, level: "country", id: agg.country };
      // GB nations, MX states, and ES autonomous communities are always shown
      // in full — never rolled up, so no whole-country remainder polygon.
      default:
        return null;     // county (US), country, gb_nation, state (MX), es_state
    }
  }

  function mergeAgg(parent, src) {
    const key = `${parent.country}:${parent.level}:${parent.id}`;
    let p = aggregates.get(key);
    if (!p) {
      p = { country: parent.country, level: parent.level, id: parent.id, total: 0, a_counts: {} };
      aggregates.set(key, p);
    }
    p.total += src.total;
    for (const [t, n] of Object.entries(src.a_counts)) p.a_counts[t] = (p.a_counts[t] || 0) + n;
  }

  // Cascade finest → coarsest so a level's total already includes anything
  // rolled into it before we test whether it clears the threshold itself.
  let rolledUp = 0;
  for (const lvl of ["division", "province", "gb_nation", "de_state", "au_state", "state", "es_state"]) {
    for (const [key, agg] of [...aggregates]) {
      if (agg.level !== lvl || agg.total > SUBNAT_MIN) continue;
      const parent = rollupParent(agg);
      if (!parent) continue;
      mergeAgg(parent, agg);
      aggregates.delete(key);
      rolledUp += 1;
    }
  }
  console.log(`  sub-national regions rolled up (≤${SUBNAT_MIN} responses): ${rolledUp}`);

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

  // ----- Join: ES L1 autonomous communities (by HASC_1 code) -----
  const esStates = readGeoJSON(STATES_ES_PATH);
  const gadmESByHASC = new Map();
  for (const f of esStates.features) {
    const hasc = f.properties.HASC_1;
    if (hasc && hasc !== "NA") gadmESByHASC.set(hasc, f);
  }

  // ----- Join: GB L2 English unitary authorities / counties -----
  const gadmGBDivByGID = new Map();
  for (const f of gbDivisions.features) {
    const gid = f.properties.GID_2;
    if (gid) gadmGBDivByGID.set(gid, f);
  }

  // GADM ships 85-ish English L2 features with NAME_2 = "NA". Rather than
  // maintain a hand-built HASC → label table (error-prone — easy to swap
  // Greater London with Gateshead), derive the popup label from GeoNames:
  // find the most-populous populated place inside each polygon and use that.
  // A few HASC codes name a county that's better known than its largest town
  // (Watford-as-Hertfordshire, High-Wycombe-as-Buckinghamshire). Verified by
  // bbox-center sanity check at write time; safer to keep this small.
  const GB_HASC_OVERRIDES = {
    "GB.HT": "Hertfordshire",
    "GB.BU": "Buckinghamshire",
    "GB.GL": "Greater London",
  };
  const gbDivisionLabelCache = new Map();
  function gbDivisionLabel(f) {
    const gid = f.properties.GID_2;
    if (gbDivisionLabelCache.has(gid)) return gbDivisionLabelCache.get(gid);
    const name2 = f.properties.NAME_2;
    const override = GB_HASC_OVERRIDES[f.properties.HASC_2];
    let label = override || null;
    if (!label && name2 && name2 !== "NA") label = gadmStateName(name2);
    else if (!label && gbCities) {
      const b = bbox(f.geometry);
      let best = null;
      // Walk the GeoNames index; pick the most-populous PPL whose point falls
      // inside this polygon. It's O(N*M) but only runs ~85 times for the few
      // English L2 features that surface in the output.
      for (const arr of gbCities.values()) {
        for (const c of arr) {
          if (!c.lat || !c.lng) continue;
          if (c.lng < b[0] || c.lng > b[2] || c.lat < b[1] || c.lat > b[3]) continue;
          if (best && c.pop <= best.pop) continue;
          if (!pointInGeometry([c.lng, c.lat], f.geometry)) continue;
          best = c;
        }
      }
      if (best) label = best.name || best.asciiname;
    }
    if (!label) label = f.properties.HASC_2 || gid;
    gbDivisionLabelCache.set(gid, label);
    return label;
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
  // GADM ships some countries (India, China, Pakistan, …) as multiple L0
  // features representing disputed territorial claims. The downloader writes
  // them as separate entries, so a naive Map.set overwrites everything but
  // the *last* sub-feature — typically a tiny border patch. Merge all
  // features for the same ISO_A2 into a single MultiPolygon.
  const countries = readGeoJSON(COUNTRIES_PATH);
  const gadmCountryByISO = new Map();
  function pushPolys(g, out) {
    if (!g) return;
    if (g.type === "Polygon") out.push(g.coordinates);
    else if (g.type === "MultiPolygon") for (const p of g.coordinates) out.push(p);
  }
  for (const f of countries.features) {
    const a2 = f.properties.ISO_A2;
    if (!a2) continue;
    const existing = gadmCountryByISO.get(a2);
    if (!existing) {
      gadmCountryByISO.set(a2, {
        type: "Feature",
        geometry: f.geometry.type === "MultiPolygon"
          ? f.geometry
          : { type: "MultiPolygon", coordinates: [f.geometry.coordinates] },
        properties: f.properties,
      });
    } else {
      const polys = [];
      pushPolys(existing.geometry, polys);
      pushPolys(f.geometry, polys);
      existing.geometry = { type: "MultiPolygon", coordinates: polys };
    }
  }

  // CA is excluded from countries_world (it ships as L1 tiers), but the rollup
  // can produce a Canada-level aggregate (provinces below threshold), so
  // synthesize its L0 outline by merging the province features already loaded.
  // (MX no longer rolls up — every Mexican state is shown — so it needs none.)
  function synthCountry(fc, iso, name) {
    const polys = [];
    for (const f of fc.features) pushPolys(f.geometry, polys);
    return {
      type: "Feature",
      geometry: { type: "MultiPolygon", coordinates: polys },
      properties: { ISO_A2: iso, NAME: name },
    };
  }
  if (!gadmCountryByISO.has("CA")) gadmCountryByISO.set("CA", synthCountry(provinces, "CA", "Canada"));

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
      // Measured on the raw GADM geometry, before the quantize/simplify below —
      // area must not inherit the 0.005°–0.03° simplification error.
      area_km2: Math.round(geometryAreaKm2(feature.geometry)),
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
      agg.level === "county" || agg.level === "division" || agg.level === "gb_division" ? 0.005 :
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
    } else if (agg.level === "es_state") {
      const f = gadmESByHASC.get(agg.id);
      // GADM concatenates the Spanish NAME_1 ("CastillayLeón"); use a clean
      // display table keyed by HASC instead.
      const label = ES_LABEL[agg.id] || (f ? gadmStateName(f.properties.NAME_1) : agg.id);
      emit(agg, f, label);
    } else if (agg.level === "gb_nation") {
      const f = gadmGBByCode.get(agg.id);
      emit(agg, f, GB_LABEL[agg.id] || agg.id);
    } else if (agg.level === "gb_division") {
      const f = gadmGBDivByGID.get(agg.id);
      const label = f ? `${gbDivisionLabel(f)}, England` : agg.id;
      emit(agg, f, label);
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
    es_state: 1,        // ES autonomous communities
    state: 1,           // MX states
    division: 2,        // CA census divisions
    gb_division: 2,     // English unitary authorities / counties
    county: 2,
  };
  polygons.features.sort(
    (a, b) =>
      (LEVEL_PAINT_ORDER[a.properties.level] ?? 1) -
      (LEVEL_PAINT_ORDER[b.properties.level] ?? 1),
  );

  // ----- US state tier -----
  // A SEPARATE collection, deliberately not merged into regions_polygons: 51
  // state polygons dropped into that file would paint over the entire county
  // choropleth (and LEVEL_PAINT_ORDER has no entry for them).
  //
  // Aggregated from the pre-join `aggregates` map rather than the emitted
  // county features, so the state totals reconcile exactly to totals.json.
  // Ten county FIPS never join GADM by name (nine Alaska census areas that
  // GADM 4.1 predates, plus Oglala Lakota SD) — the state polygon still covers
  // that ground, so their responses belong in the state count.
  const stateBuckets = new Map(); // "04" → { total, a_counts }
  let territoryTotal = 0; // PR (72), Guam (66), … — US rows with no state to sit in
  for (const agg of aggregates.values()) {
    if (agg.country !== "US" || agg.level !== "county") continue;
    const fips = String(agg.id).slice(0, 2);
    if (!FIPS_TO_STATE[fips]) { territoryTotal += agg.total; continue; }
    let b = stateBuckets.get(fips);
    if (!b) { b = { total: 0, a_counts: {} }; stateBuckets.set(fips, b); }
    b.total += agg.total;
    for (const [t, n] of Object.entries(agg.a_counts)) {
      b.a_counts[t] = (b.a_counts[t] || 0) + n;
    }
  }

  const statesSrc = readGeoJSON(STATES_US_PATH);
  const gadmStateByKey = new Map();
  for (const f of statesSrc.features) {
    gadmStateByKey.set(stateKey(f.properties.NAME_1), f);
  }

  // State polygons are only ever viewed at national zoom, where a sub-2 km
  // islet is well under a pixel. Alaska ships 4,151 parts (mostly Aleutian
  // specks) and would be half the file on its own. Drop parts whose bbox
  // diagonal is under 2× the simplify tolerance — comfortably below the
  // Florida Keys (~7 km) and the Channel Islands (~35 km), which stay.
  function dropTinyParts(geom, minDiagDeg) {
    if (!geom || geom.type !== "MultiPolygon") return geom;
    const kept = geom.coordinates.filter((poly) => {
      const ring = poly[0];
      if (!ring || ring.length < 4) return false;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of ring) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return Math.hypot(x1 - x0, y1 - y0) >= minDiagDeg;
    });
    // Never return an empty geometry — keep the largest part as a floor.
    if (!kept.length) {
      let best = null, bestLen = -1;
      for (const poly of geom.coordinates) {
        if (poly[0] && poly[0].length > bestLen) { bestLen = poly[0].length; best = poly; }
      }
      return best ? { type: "MultiPolygon", coordinates: [best] } : geom;
    }
    return { type: "MultiPolygon", coordinates: kept };
  }

  const statePolys = { type: "FeatureCollection", features: [] };
  let stateSum = 0;
  for (const [fips, name] of Object.entries(FIPS_TO_STATE)) {
    // stateKey() strips non-alphanumerics, so GADM's concatenated "NewYork" /
    // "DistrictofColumbia" match without needing gadmStateName() — which is
    // wrong for DC anyway ("Districtof Columbia": it only splits lower→upper).
    const feature = gadmStateByKey.get(stateKey(name));
    if (!feature) {
      console.warn(`  WARN: no GADM L1 polygon for ${fips} ${name}`);
      continue;
    }
    const b = stateBuckets.get(fips) || { total: 0, a_counts: {} };
    const dom = dominantTeam(b.a_counts);
    stateSum += b.total;
    // Area and centroid come off the RAW geometry, before simplification.
    const c = featureCentroid(feature);
    statePolys.features.push({
      type: "Feature",
      geometry: dropTinyParts(quantizeGeometry(feature.geometry, 3, 0.01), 0.02),
      properties: {
        region: name,                 // alias of `name` so shared popup code works
        name,
        id: fips,                     // zero-padded 2-char string; county id.slice(0,2)
        usps: STATE_FIPS_TO_USPS[fips],
        country: "US",
        level: "us_state",            // NOT "state" — MX already uses that
        total: b.total,
        area_km2: Math.round(geometryAreaKm2(feature.geometry)),
        // Centroid of the largest ring: Alaska spans the antimeridian, so a
        // bbox-based fitBounds would zoom to the whole planet. Ship a point.
        cx: c ? c[0] : null,
        cy: c ? c[1] : null,
        a_total: b.total,
        a_counts: b.a_counts,
        a_dominant: dom.team,
        a_dominant_pct: Number(dom.pct.toFixed(4)),
      },
    });
  }

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
        skipped.esNoState +
        skipped.other,
      skipped_breakdown: skipped,
      recovered_us: recovered,
      unique_regions: uniqueRegions,
      a_responses: validRows,
      a_categories: aTotals.length,
      by_country: byCountry,
    },
    a: aTotals,
  };

  fs.writeFileSync(path.join(OUT, "regions_polygons.geojson"), JSON.stringify(polygons));
  fs.writeFileSync(path.join(OUT, "regions_centroids.geojson"), JSON.stringify(centroids));
  fs.writeFileSync(path.join(OUT, "states_polygons.geojson"), JSON.stringify(statePolys));
  fs.writeFileSync(path.join(OUT, "totals.json"), JSON.stringify(totals, null, 2));

  console.log(`Preprocess complete.`);
  console.log(`  rows: ${totalRows}, valid: ${validRows}, dropped: ${totalRows - validRows}`);
  console.log(`  skipped:`, skipped);
  console.log(`  recovered US (city+state / embedded zip):`, recovered);
  console.log(`  regions: ${uniqueRegions} (polygons: ${polygons.features.length}, centroids: ${centroids.features.length})`);
  console.log(
    `  us states: ${statePolys.features.length} features, sum ${stateSum}` +
    ` + ${territoryTotal} territory (PR/GU/…) = ${stateSum + territoryTotal}` +
    ` vs by_country.US ${byCountry.US || 0}`,
  );
  console.log(`  unjoined aggregates: ${unjoined}`);
  if (unjoined && process.env.VERBOSE) {
    console.log("  unjoined keys:", unjoinedDetails.slice(0, 30));
  }
  console.log(`  by_country (top 10):`, Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 10));
  console.log(`  team totals (top 5):`, aTotals.slice(0, 5));
}

main();
