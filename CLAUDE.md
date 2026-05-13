# Choropleth Survey Map — App Template

You're being asked to build an interactive map app for a categorical-survey dataset keyed by US ZIP code. This folder captures the design and interactivity of an existing app of this kind (originally built for a college-football fan survey). When the user prompts you with the new data they want to visualize, you build the same app shape against their data.

**Read this file first**, then `DATA.md`, `MAP.md`, `UI.md` as you need them.

---

## What the app does

A static React + Mapbox app that visualizes "category → US geography" survey data. Picture a Google Form asking "What's your favorite X?" with a zip-code field, where X is anything categorical and the answer set has ~50–200 distinct values that each have a recognizable color (sports teams, political candidates, beverage brands, streaming services, etc.).

Core interactions, in order of importance:

1. **Choropleth ("dominant" view)** — each zip/county filled with the color of the top category there
2. **Single-category filter** — pick one category to see only its territory + great-circle arcs from each zip to a "home" location (a POI per category, e.g. a stadium/HQ/birthplace — null is OK, arcs gracefully no-op)
3. **Face-off** — two-category head-to-head. Each contested zip is colored by which one has more responses, plus a scoreboard panel showing zips won / uncontested / overlap / tied
4. **POI view** — oblique tilt (~55° pitch) with a colored circle + label per POI for the active category set
5. **Top-N in viewport** — sidebar listing the top 5 categories within current map bounds, recomputed on `moveend`
6. **Resolution toggle** — switch polygon view between zip-level and county-level (county is the readable default for national zoom; zip for detail)
7. **(Optional) Two parallel datasets** — if the survey has primary/secondary axes (e.g. FBS/FCS in the original), the app has a Group toggle (A/B) that swaps between two parallel category sets. Skip this if your data is single-axis

---

## What the user provides

When you're prompted to build a new instance of this app, the user gives you:

1. **Survey CSV** — at minimum a zip column + 1–2 category columns. Path goes to `data/responses.csv`
2. **Domain decisions:**
   - Project name + survey topic (drives all UI text)
   - Whether the data is single-axis or two-axis (`group_a` only, or `group_a` + `group_b`)
   - What "POI" means in this domain (stadium → headquarters / hometown / studio / etc.) — or "none" if N/A
   - Whether they want arcs (skip if no POI per category)
3. **Category metadata** — the ~50–200 distinct values that appear in the survey, each with a primary color. They may give you:
   - A hardcoded dict (preferred for stable categories like sports teams, political parties)
   - A CSV with `short_name, primary_color, …`
   - A reference URL to scrape
4. **POI coordinates** (if applicable) — per category, the lat/lng of the "home" point for arc origins. Often comes from a public dataset (e.g. Wikipedia-derived CSV)
5. **Mapbox token** for the deploy

Confirm any of these that are ambiguous before writing code.

---

## Tech stack

- **Vite + React 18** (no SSR, static SPA)
- **Mapbox GL JS 3.8** with the Standard style + globe projection
- **Tailwind CSS** for all styling
- **@turf/great-circle** for arc generation
- **Node + csv-parse** for the preprocessing pipeline
- **Python** for the category-metadata seeding script (it's mostly a giant hardcoded dict)

Stick to these unless the user explicitly asks for something different. The Mapbox layer / expression patterns assume Standard style + the `slot: "middle"` slot API.

---

## What stays the same vs. what changes per build

**Stays the same** (DO NOT redesign):
- Vite + Tailwind project structure
- Mapbox layer architecture: 5 sources (zip-polygons, zip-centroids, county-polygons, arcs, pois) → fill + outline + circle + line + symbol layers, all in `slot: "middle"`
- Expression patterns for dominant / single-team / face-off coloring (see MAP.md)
- Component composition: `App` orchestrator → `Controls` + `Counter` + `ViewportTop` + `Legend`, with `Faceoff` inside `Controls`
- Mobile responsiveness rules (Counter + ViewportTop hidden on `< md`, Legend + Controls collapse on mobile)
- State priority: face-off > single-category > dominant
- gitignore strategy: `/data/` private (raw CSV, raw Census shapefiles); `public/data/*` tracked (aggregates only)

**Changes per build:**
- Survey CSV column names (preprocess script knows which to read)
- Group names — `"a"/"b"` or single-group; the rest of the codebase keys off `${group}_dominant`, `${group}_counts` etc.
- Category metadata (the hardcoded dict in `seed-categories.py` or wherever)
- POI keyword in UI labels (Stadiums → Venues / Headquarters / etc.)
- Project title, survey-link CTA, page metadata

---

## Implementation order

When the user prompts you with new data:

1. **Confirm the data shape and domain** (CSV columns, single vs two axis, POI presence, project name)
2. **Scaffold the project** — easiest path is to fork the reference repo. Otherwise: `npm create vite@latest`, install deps from this template, copy `tailwind.config.js` + `postcss.config.js` patterns
3. **Drop raw inputs into `data/`** — responses.csv, plus optionally a category-metadata CSV or POI-coordinate CSV the user has provided
4. **Run the Census downloads once** — `npm run download-zcta` (large, ~145 MB) and `npm run download-counties` (~30 MB). These are domain-agnostic so the scripts don't change
5. **Build the seed scripts** — `seed-categories.py` (and optionally `seed-pois.py`) from the user's metadata source. See DATA.md
6. **Build preprocess.js** — aggregates responses.csv → `public/data/*.geojson`. The shape is fixed; only the column names + group names vary. See DATA.md
7. **Build map.js, App.jsx, and the UI components** following MAP.md and UI.md
8. **Manually test each feature in this order** (skip whichever the user opted out of): dominant choropleth → single-category filter (+ arcs) → face-off → POI tilt view → resolution toggle → mobile layout
9. **Wire deploy** — `.gitignore` per DATA.md; commit `public/data/*` aggregates; deploy to Vercel with `VITE_MAPBOX_TOKEN` in the env settings

---

## Files in this template

- `CLAUDE.md` — you are here. Orientation + implementation order
- `DATA.md` — data contract (CSV input, aggregate outputs, seed scripts, preprocessing pipeline, .gitignore)
- `MAP.md` — Mapbox setup, sources, layers, color/filter expressions, arcs, tilt, popups, basemap-swap rebuild
- `UI.md` — component composition, state model, panel positions, responsive behavior, color tokens

---

## Naming conventions used in this template

The original app had college-football-specific terms. The template generalizes them:

| Original code | Template term | Why |
|---|---|---|
| `team` | `category` | The categorical axis of the survey |
| `short_name` | `short_name` (kept) | Stable identifier matching the CSV string |
| `fbs` / `fcs` | `a` / `b` (group prefix) | The two parallel datasets, if two-axis |
| `stadium` | `poi` | "Point of interest" — the home location per category |
| "Top FBS nationally" | "Top categories nationally" | The UI label text varies per domain |

In actual code for the new build, you can pick more domain-appropriate names (e.g., for a music-artist survey: `artist`, `home_venue`, `genre_pop`/`genre_rock`). The shapes stay identical.
