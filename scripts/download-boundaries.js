// Download GADM level-0 boundaries for every country present in
// data/responses.csv and merge them into data/countries_world.geojson.
//
// US, CA, MX boundaries are downloaded separately by README instructions
// (level 2 / level 1 / level 1 respectively) — this script only handles
// the world tier.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { parse } from "csv-parse/sync";
import iso from "iso-3166-1";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "data/_raw");
const RESPONSES = path.join(ROOT, "data/responses.csv");
const OUT = path.join(ROOT, "data/countries_world.geojson");

const COUNTRY_COL = "Country";

const MANUAL_NAME_TO_ISO2 = new Map([
  ["usa", "US"], ["u.s.", "US"], ["u.s.a.", "US"], ["united states of america", "US"], ["america", "US"],
  ["uk", "GB"], ["england", "GB"], ["great britain", "GB"], ["britain", "GB"], ["scotland", "GB"], ["wales", "GB"],
  ["south korea", "KR"], ["north korea", "KP"], ["czech republic", "CZ"], ["czechia", "CZ"],
  ["russia", "RU"], ["iran", "IR"], ["vietnam", "VN"], ["taiwan", "TW"], ["palestine", "PS"],
  ["ivory coast", "CI"], ["cote d'ivoire", "CI"], ["macedonia", "MK"], ["bolivia", "BO"], ["venezuela", "VE"],
  ["tanzania", "TZ"], ["syria", "SY"], ["laos", "LA"], ["moldova", "MD"], ["brunei", "BN"],
  ["micronesia", "FM"], ["myanmar", "MM"], ["burma", "MM"],
]);

function normalizeCountry(s) {
  if (!s) return null;
  const v = String(s).trim();
  if (!v) return null;
  const manual = MANUAL_NAME_TO_ISO2.get(v.toLowerCase());
  if (manual) return manual;
  return (
    iso.whereCountry(v)?.alpha2 ||
    iso.whereAlpha2(v.toUpperCase())?.alpha2 ||
    iso.whereAlpha3(v.toUpperCase())?.alpha2 ||
    null
  );
}

function iso2to3(a2) {
  const e = iso.whereAlpha2(a2);
  return e?.alpha3 || null;
}

function uniqueCountries() {
  const csv = fs.readFileSync(RESPONSES, "utf8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true });
  const counts = new Map();
  for (const r of rows) {
    const a2 = normalizeCountry(r[COUNTRY_COL]);
    if (!a2) continue;
    counts.set(a2, (counts.get(a2) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function fetchToFile(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

function readZipEntry(buf) {
  // Minimal ZIP reader: handles single-file zips with deflate (the only form
  // GADM uses). Avoids pulling in an extra dep.
  const sig = buf.readUInt32LE(0);
  if (sig !== 0x04034b50) throw new Error("not a zip");
  const compMethod = buf.readUInt16LE(8);
  const compSize = buf.readUInt32LE(18);
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const dataStart = 30 + nameLen + extraLen;
  const data = buf.subarray(dataStart, dataStart + compSize);
  if (compMethod === 0) return data;
  if (compMethod === 8) return zlib.inflateRawSync(data);
  throw new Error(`unsupported zip method ${compMethod}`);
}

async function downloadCountry(iso2) {
  const iso3 = iso2to3(iso2);
  if (!iso3) return { iso2, skipped: "no iso3" };

  const cacheZip = path.join(RAW, `gadm41_${iso3}_0.json.zip`);
  let buf;
  if (fs.existsSync(cacheZip) && fs.statSync(cacheZip).size > 200) {
    buf = fs.readFileSync(cacheZip);
  } else {
    const url = `https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_${iso3}_0.json.zip`;
    try {
      buf = await fetchToFile(url, cacheZip);
    } catch (e) {
      return { iso2, iso3, skipped: `fetch failed: ${e.message}` };
    }
  }

  let inner;
  try {
    inner = readZipEntry(buf);
  } catch (e) {
    return { iso2, iso3, skipped: `unzip failed: ${e.message}` };
  }
  let fc;
  try {
    fc = JSON.parse(inner.toString("utf8"));
  } catch (e) {
    return { iso2, iso3, skipped: `parse failed: ${e.message}` };
  }
  return { iso2, iso3, fc };
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const countries = uniqueCountries();
  console.log(`Discovered ${countries.length} unique countries in survey`);

  const SKIP = new Set(["US", "CA", "MX"]); // sub-national tiers, downloaded separately
  const queue = countries.map(([a2]) => a2).filter((a2) => !SKIP.has(a2));

  const merged = { type: "FeatureCollection", features: [] };
  const errors = [];
  const CONCURRENCY = 8;

  let i = 0;
  async function worker() {
    while (i < queue.length) {
      const my = i++;
      const a2 = queue[my];
      process.stdout.write(`\r[${my + 1}/${queue.length}] ${a2}      `);
      const r = await downloadCountry(a2);
      if (r.skipped) {
        errors.push(r);
        continue;
      }
      for (const f of r.fc.features) {
        merged.features.push({
          type: "Feature",
          geometry: f.geometry,
          properties: {
            ISO_A2: r.iso2,
            ISO_A3: r.iso3,
            NAME: f.properties?.COUNTRY || f.properties?.NAME_0 || r.iso3,
          },
        });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write("\n");

  fs.writeFileSync(OUT, JSON.stringify(merged));
  console.log(`Wrote ${merged.features.length} country features → ${path.relative(ROOT, OUT)}`);

  if (errors.length) {
    console.log(`\nSkipped (${errors.length}):`);
    for (const e of errors) console.log(`  ${e.iso2}/${e.iso3 || "?"}: ${e.skipped}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
