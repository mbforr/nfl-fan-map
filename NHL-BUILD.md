# NHL Fan Map: Build Spec

One-file spec for the NHL fan map. It is the NFL build with three changes: a state-first
geography, a black and silver skin, and a new stories layer. Read this whole file before
writing code. The NFL template's `MAP.md`, `UI.md`, `DATA.md` and `BOUNDARY-DATA.md` remain
the long-form reference for any code detail not spelled out here.

Figures are from the first survey export: 10,925 responses, Oct 3 to Oct 7 2026, 100
countries, all 32 teams. Recompute them when a new export lands.

---

## 0. Repo setup

This build can live in its own repo. Nothing at runtime depends on the NFL repo. A plain
`git clone` of `nfl-fan-map` is not enough, because the boundary inputs are gitignored.

**Copy from `nfl-fan-map`:**

| What | Paths | Why |
|---|---|---|
| App code | `src/`, `index.html`, `contested.html`, `package.json`, `package-lock.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `vercel.json`, `.gitignore`, `.env.example` | The app shell, panels, map logic and the hexagon app that the Hexes view starts from |
| Pipeline | `scripts/` (all four files) | `preprocess.js`, `h3-contest.js`, `seed-categories.py`, `download-boundaries.js` |
| Reference docs | `CLAUDE.md`, `MAP.md`, `UI.md`, `DATA.md`, `BOUNDARY-DATA.md`, this file | The spec leans on them |
| Boundaries (gitignored, copy by hand) | `data/*.geojson` (12 files, about 85 MB), `data/zip_county_crosswalk.txt` | Sport-agnostic geography |
| Gazetteers (gitignored, copy by hand) | `data/_raw/US_postal.txt`, `data/_raw/US.txt` (307 MB), `data/_raw/CA.txt`, `data/_raw/GB.txt` | ZIP centroids for hexagons, and the city lookups `preprocess.js` uses to recover rows with no ZIP |

**Leave behind:** `public/data/*` (NFL outputs, regenerated here), `data/responses.csv` and the
root `data.csv` / `new_data_*.csv` exports (NFL responses), `analysis/` (Packers spike, Rust
Belt and LISA work), `src/walkthrough`, `src/rustbelt`, `src/density` and their HTML entry
points, the GADM archives in `data/_raw/` (re-downloadable), `.git`, `node_modules`, `dist`,
`.env`.

**Add new:**

- `data/responses.csv`: the Tally export. It holds private stories, so it must stay gitignored.
- `.env`: `VITE_MAPBOX_TOKEN` and `VITE_SURVEY_URL=https://tally.so/r/aQ7RRW`. Add the new
  deploy domain to the Mapbox token's URL restrictions.
- Country polygons: `data/countries_world.geojson` only ships countries seen in the NFL
  survey. 26 countries in the NHL export are missing from it (74 rows), including Latvia (19),
  Hong Kong (8), Croatia (7) and Trinidad and Tobago (6). Add them with `download:boundaries`.
- GeoNames Canadian postal file (`CA.zip` from the GeoNames postal export) for postal
  centroids. It is not in the NFL repo.
- Update `vite.config.js` and `tailwind.config.js` inputs to drop the entry points left behind.

---

## 1. What the app does

Static Vite + React 18 SPA, Mapbox GL JS 3.8 with globe projection, Tailwind,
`@turf/great-circle` for arcs, `h3-js` for hexagons, Node preprocessing, Python category seed.

Carried over unchanged from the NFL build:

1. Dominant choropleth: each region filled with its leading team's color.
2. Single-team filter with great-circle arcs from each region centroid to the team's arena.
3. Face-off: two teams head to head with a scoreboard. Priority stays face-off, then single
   team, then dominant.
4. Top five in view, recomputed on `moveend`.
5. Arenas view at 55 degrees pitch with labels.

New in this build:

| Part | NFL map | NHL map |
|---|---|---|
| Mode | None | Fans / Stories. Stories dims the fan layers and shows the story layer |
| View toggle | Polygons / Centroids / Stadiums | Regions / Hexes / Points / Arenas |
| Color by | Team only | Team in v1. Phase 2 adds "How they became fans" and "Played growing up" as groups B and C through the template's group toggle |
| Right panel | Top five teams in view | Same in Fans mode. Stories in view in Stories mode |
| Legend | Top ten teams or the selected team | Same, plus a one-line share-spike note |
| Counter | Responses and regions | Responses, regions and countries |
| Basemap | Standard or Light, labels hidden | Dark by default, Light as the alternative, labels hidden |
| Opening view | Center on the US, zoom 3.6 | Center near the US and Canada border, about zoom 3.2, so all seven Canadian teams are in frame |
| Survey button | "Add your response" | "Put me on the map" |

---

## 2. Domain decisions

- **Project name:** "NHL Fan Map". POI label "Arenas", singular "Arena".
- **Categories:** the 32 NHL teams. `short_name` must match the survey verbatim, including
  "Utah Mammoth". `group` carries the division as metadata only.
- **Single-axis in v1:** `GROUP = "a"`. The two extra lenses reuse the `b_` and a new `c_`
  prefix later.
- **Unofficial:** no NHL shield or team logos, color swatches only. Controls footer reads
  "Independent project. Not affiliated with the NHL."

### Why these choices (first-batch findings)

| Finding | Numbers | Design consequence |
|---|---|---|
| A quarter of fans are outside North America | US 52.6%, Canada 21.4%, elsewhere 26.0% (UK 715, Australia 501, Germany 226) | Globe view and country polygons matter from day one |
| The Sharks lead on international, player-driven fans | 13.7% overall. 55% of their fans live outside the US and Canada, 13% in California. Daily share rose from 9% on Oct 3 to 19% on Oct 5 | Arcs are the showpiece. The leaderboard needs a spike note |
| North America inherits, the rest of the world chooses | Grew up in the area: US 46%, Canada 41%, elsewhere 3%. A specific player: elsewhere 38% | The "how they became fans" lens |
| Canada plays | Played growing up: Canada 59%, US 25%, elsewhere 17% | The "played growing up" lens |
| County data is thin | 1,003 US counties have a response, 274 have 5+, 37 have 25+ | US opens on states, counties on zoom |
| ZIP good, postal weaker | US ZIP usable 88% (5,034 of 5,747). Canada province 98%, postal code 65% | Hexes and places work in the US now. Canada needs a city fallback |
| Most stories can be shown | 6,253 stories. 5,583 shareable (2,595 with credit, 2,988 anonymous). 670 private | Stories layer has volume. Consent is three-way |
| Stories happen in arenas and living rooms | Of 5,856 with a location: arena 31%, at home 19%, place name only 46% | Arenas are story hubs. At-home stories attach to a region |

This is a social media sample. Density shows where respondents are, not where fans are.

---

## 3. Style

| Token | Value | Used for |
|---|---|---|
| Ground | `#000000` | Page behind the map, loading state |
| Panel | `#111214` at 95% opacity | Every floating card, popup and story card |
| Border | `#4A4F52` | Card edges, segmented toggles, inputs |
| Accent | `#A2AAAD` | Section labels, active toggle, survey button fill with black text |
| Text | `#FFFFFF` | Primary text |
| Secondary text | `#C9CED0` | Counts, captions, attribution |
| Display type | Barlow Condensed 600 and 700, uppercase | Panel titles, section labels, story category |
| Body type | Barlow 400, 500, 600 | Everything else |
| Corners | 8px cards, 4px controls | Matches the survey |

Rules:

- **`map_color` per team.** Teams whose primary color is black or dark navy (Bruins, Kings,
  Penguins and others) vanish on a dark basemap. Fills, circles and arcs read `map_color`.
  Swatches keep `primary_color`.
- **Outline color.** Region and hexagon outlines change from white to the ground color.
- **Popups.** `.mapboxgl-popup-content` and its tip take the panel color and border.
- **Panel classes.** Replace `bg-white/95` with the panel token and add the border. Replace
  the `gray-*` text classes with the text tokens.

Layout is unchanged: Controls top-left, Counter top-right, In view panel upper-right, Legend
bottom-right. The story card sits bottom-left on desktop and is a bottom sheet on mobile.
On mobile, Controls and Legend start collapsed and Counter and the In view panel are hidden.

---

## 4. Data layers

Each view has a minimum count so thin data never paints a winner.

| View | Geometry | Question | Minimum to color |
|---|---|---|---|
| Regions | Boundaries | Who leads here? | US county: 5. Sub-national outside the US: more than 30 (`SUBNAT_MIN`) |
| Hexes | H3 cells | Where do markets split inside a metro or across a border? | 10 to color, 5 to draw grey |
| Points | Sized circles | How many fans are here? | 3 per place |
| Arenas | 32 points | Where is home ice? | None |

### 4a. Boundaries

| Country | Level | Notes |
|---|---|---|
| US | State below zoom 5, county from zoom 5 | Resolve the state from the state field, not from county rollups, so the 699 US rows with no ZIP still count. Counties under 5 responses draw neutral grey |
| Canada | Province, and census division where it clears 30 | Province resolves for 2,291 of 2,342 rows once a typo map is added ("british colombia" appears 19 times) |
| UK | Four nations | 715 responses. The region field mixes nations, counties and cities, so assign by city as the NFL pipeline does |
| Australia | State | 501 responses, clean names plus "NSW" |
| Germany | State where it clears 30, else country | Only Bavaria clears 30 so far |
| Everywhere else | Country | Finland (137) and Sweden (103) are next in line for a sub-national tier |

Two fill layers do the US hand-off: `states_polygons.geojson` with `maxzoom: 5`, and the
county features of `regions_polygons.geojson` with `minzoom: 5`. Every other level draws at
all zooms. No resolution toggle.

### 4b. Hexagons

Equal-area cells show what boundaries cannot: splits inside New York, Los Angeles and the
Bay Area, and markets that cross the border such as Buffalo and Toronto.

- **Point per response:** US ZIP centroid, then Canadian postal centroid by its first three
  characters, then city centroid. The city fallback is allowed at resolutions 3 and 4 only.
- **Color:** leading team's `map_color`, opacity by its share. Cells with 5 to 9 responses
  draw grey.
- **Scoring:** keep the `h3-contest.js` entropy score (with the Miller-Madow correction) so a
  "Contested" option can recolor the same cells later.
- **Scope:** US and Canada in v1.

| H3 resolution | Cell area | Shown | US cells with 10+ | Fans covered | US cells with 25+ | Fans covered |
|---|---|---|---|---|---|---|
| 3 | About 12,400 km2 | Below zoom 5 | 113 | 81% | 54 | 62% |
| 4 | About 1,770 km2 | Zoom 5 and up | 118 | 56% | 38 | 33% |
| 5 | About 250 km2 | Held back | 72 | 23% | 8 | 6% |

Counts are from the 5,034 US responses placed by ZIP. Turn on resolution 5 once 50 cells
clear 25 responses.

### 4c. Points

- **Region centroids** below zoom 5: radius by `sqrt(total)`, color by leading team.
- **Place circles** from zoom 5, from `places_points.geojson`: one feature per city or ZIP
  cluster with the same count properties. A place needs 3 responses. Smaller ones stay in
  their region centroid.
- **No dot per respondent** at any zoom.
- **Arenas** keep the tilted view. In Stories mode they double as story hubs.

### 4d. Outputs in `public/data`

| File | Status | Holds |
|---|---|---|
| `regions_polygons.geojson`, `regions_centroids.geojson` | Same contract | Every level except US state, with `a_counts`, `a_dominant` |
| `states_polygons.geojson` | Exists in the NFL build | US states, resolved from the state field |
| `h3_cells.json` | Adapted from `h3_contest.json` | Resolutions 3 and 4, US and Canada |
| `places_points.geojson` | New | Place circles with 3+ responses |
| `category_a.json` | Same, plus `map_color` | 32 teams and arenas |
| `category_b.json`, `category_c.json` | New, phase 2 | How they became fans (6 answers plus Other), played growing up (4 answers) |
| `totals.json` | Same, plus daily team shares | Leaderboard, counts, spike series |
| `stories_index.geojson`, `stories/<team>.json` | New | Section 5 |

### 4e. Survey columns

Read by configured name, verbatim from the Tally export:

| Column | Notes |
|---|---|
| `Who is your favorite NHL team?` | 32 values, matches `short_name` |
| `How did you become a fan of this team?` | 6 fixed answers. 1,850 write-ins map to "Other" |
| `Country` | Dropdown, 100 values so far |
| `State, province, or region` | Free text, 1,494 distinct strings. Needs normalization maps |
| `City or town` | Free text |
| `ZIP or postal code` | Optional. Use the existing five-digit salvage |
| `Did you play hockey growing up?` | 4 answers |
| `Where did you grow up?` | Free text, optional. Not used in v1 |
| `What is your favorite hockey story?` | Optional. Section 5 |
| `Where did that story happen?` | Optional. Section 5 |
| `Can I share your story in a video or on the map?` | The consent field. Section 5 |
| `First name or handle, if you want credit` | Only shown to "go for it" respondents |
| `Submission ID`, `Respondent ID`, `Submitted at` | Never published |

---

## 5. Stories

### 5a. The consent gate

A story reaches the map only if its row says yes, and the build fails if that is ever untrue.

```
survey row with a story
  -> sharing answer is "Yes, go for it" or "Yes, but keep it anonymous"?
       no, blank or unknown -> not published (670 so far)
       yes -> strip identity (new id, credit rule)
            -> flagged for content?
                 yes -> human review -> approved: continue / rejected: not published
                 no  -> continue
            -> write story files -> build test -> on the map
```

- **Allowlist, not a blocklist.** Any value the script does not recognize is dropped.
- **Credit only with "go for it".** Copy the name or handle only for those rows (2,068 of
  2,595 left one). Anonymous rows publish with no name even if one was typed.
- **Nothing identifying travels with a story.** New sequential id. Never the Tally submission
  or respondent id, a ZIP, a city of residence or a timestamp. Home appears only as a state,
  province or country.
- **Content gate.** Hold for a human look: profanity (58 shareable stories), a death or
  illness in the family (90), drinking or arrests (15), contact details or handles in the
  text (9). Roughly 170 so far. The rest publish automatically.
- **Removals.** A private `data/story_blocklist.txt` of submission ids pulls a story at the
  next build. Every story card carries a "Report or remove" link.
- **Build test.** After writing the story files, read them back and assert that every story
  traces to a yes row and that no private story's text appears in any output. Exit non-zero
  on failure.
- **Raw export stays private.** It holds all 6,253 stories. Gitignored `data/` only.

### 5b. Placement

Each story has two locations: where it happened, which places the pin, and where the teller
lives, shown only as a region.

| "Where did that story happen" answer | Shareable stories | Placed at | `precision` |
|---|---|---|---|
| A named arena or rink | 1,470 | That arena, from a gazetteer of current and former buildings | `arena` |
| Another place: a city, school, pond or bar | 2,619 | City centroid when recognized, else the teller's region | `city` or `region` |
| At home: living room, couch, TV | 998 | No pin. Listed under the teller's region | `region` |
| "An arena" with no name | 195 | No pin. Listed under the teller's region | `region` |
| Blank | 301 | No pin. Listed under the teller's region | `region` |

Up to 4,089 pinned stories and about 1,500 region stories from 5,583. Stories under 40
characters (591) count in totals and lists but get no pin.

### 5c. Stories mode

- Fan layers dim to about 25% opacity.
- **Arena hubs:** a silver circle per arena sized by story count, with the number on it.
  Click opens that arena's stories.
- **City pins:** Mapbox clustering. Single pins colored by moment.
- **Region stories:** no pin. A count in the region popup and rows in the list.
- **Team filter** applies to stories as well as fans.
- **Memory arc:** selecting a story draws a great-circle arc from the teller's region
  centroid to where it happened, reusing `buildTeamArcs`.
- **Stories in view panel:** stories inside the viewport, recomputed on `moveend`, with
  moment chips as filters. Row = first line, team swatch, place.
- **Story card:** moment label, team, story verbatim (first 600 characters, then "Read
  more"), attribution, place, previous and next, report link.
- **Attribution:** with credit "Sam, Ontario". Anonymous "A Canadiens fan in Ontario". If the
  teller's region has fewer than 5 respondents, show the country only.
- **Deep link:** `?story=<id>` opens a story directly.

### 5d. Story files

`stories_index.geojson` holds one light point per story. Region stories sit at the region
centroid and are filtered out of the pin layer. Text loads on demand from
`stories/<team>.json`, keyed by story id.

```json
{
  "id": "s_00412",
  "team": "Montreal Canadiens",
  "moment": "first_game",
  "with": ["family"],
  "place_type": "arena",
  "precision": "arena",
  "place_name": "Bell Centre",
  "home_region": "CA-QC",
  "home_label": "Quebec",
  "credit": null,
  "lang": "en"
}
```

Illustrative values, not a real response.

### 5e. Categories

Three facets, because 52% of stories match more than one theme.

**Moment** is the primary category: one per story, sets pin color and the legend.

| Moment | Share of 6,253 | Covers |
|---|---|---|
| `big_game` | 32% | Playoff runs, Cup wins, overtime winners. Heartbreak (4%) is a mood tag here |
| `first_game` | 20% | The first time in the building |
| `playing` | 19% | Own teams, ponds, coaching, learning to skate |
| `becoming_a_fan` | 11% | The Olympics, a video game, a show, a friend's pitch |
| `meeting_a_player` | 7% | Autographs, a puck over the glass, warm-ups |
| `road_trip` | 5% | Traveling to see a team |
| `funny_and_wild` | 5% | Fights, mascots, things going wrong |
| `other` | 14% matched nothing | Catch-all until reviewed |

Shares come from a keyword pass and overlap. When several match, the most specific wins:
meeting a player, first game, road trip, playing, becoming a fan, funny and wild, big game.

**Filters:**

| Facet | Values | First-batch size |
|---|---|---|
| `with` | family, friends and partners, on my own | Family 34%, friends and partners 14% |
| `place_type` | arena, at home, somewhere else | Arena 28%, at home 19% of shareable stories with a location |
| `mood` | joy, heartbreak, in memory | Heartbreak 4%, in memory 1%. "In memory" always goes to review |

**Tagging:**

1. Keyword rules for a first pass (covers 86%).
2. A model pass over shareable stories only, assigning moment, with, place type, mood,
   review flags and a title of up to eight words, from fixed lists.
3. A hand check of 200 stories. Corrections go to a private `data/story_labels.csv` keyed by
   submission id so they survive every new export.

Eight moment colors live in `config.js`, chosen to stay apart on the dark basemap. Pins carry
a black ring so they separate from team fills.

---

## 6. Implementation order

1. **Set up the repo** per section 0. `npm install`, confirm the NFL app still runs before
   changing anything.
2. **Config:** project name, POI labels, survey URL, opening view in `config.js`.
3. **Seed teams:** `seed-categories.py` with 32 teams, colors, `map_color` and arena
   coordinates.
4. **Preprocess:** NHL column names, the state-from-field tier, thresholds, daily team shares
   in `totals.json`. Check the summary's skipped counts.
5. **Reskin:** tokens, Barlow, dark basemap, popups, footer.
6. **Hexes and places:** adapt `h3-contest.js`, add the places script, wire the zoom
   hand-offs and the four-way view toggle.
7. **Stories pipeline:** consent allowlist, placement, tags, labels file, build test.
8. **Stories mode:** hubs, pins, list panel, story card, memory arcs, deep link.
9. **Phase 2:** the two extra "color by" lenses.

The fan map can ship after step 6. Stories are steps 7 and 8.

---

## 7. Open decisions

- [ ] Leaderboard: raw shares with a spike note, or also a spike-adjusted ranking as the NFL
      walkthrough does?
- [ ] Who reviews the roughly 170 flagged stories before launch, and do family-loss stories
      show by default?
- [ ] Tagging: is a model pass over shareable stories acceptable, or keywords plus hand review
      only?
- [ ] Anonymous attribution: "A Canadiens fan in Ontario", or the team alone?
- [ ] Non-English stories, including French from Canadiens fans: original only, or add a
      translation line?
- [ ] Survey wording: the story-location placeholder suggests "a living room", now the top
      answer (254). Keep it, or change it and accept a break in the series?
