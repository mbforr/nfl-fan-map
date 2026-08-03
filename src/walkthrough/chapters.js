// Walkthrough chapters, one per beat of the video. Data-only: Story.jsx reads
// `layer` to drive the map and `panel` to pick which mini-visual to render.
// Narrative text is drawn from analysis/Video8_NFL_Fan_Map_PLAN.md + SUMMARY.md.

export const CHAPTERS = [
  {
    id: "intro",
    tag: "The survey",
    title: "29,081 fans, one map",
    blurb:
      "An Instagram survey asked people one question — which NFL team do you root for? — plus where they live. This is every answer that could be placed on the map. Each region is colored by its most-popular team.",
    layer: { kind: "dominant" },
    camera: { center: [-96.5, 39.0], zoom: 3.6, pitch: 0 },
    panel: "intro",
  },
  {
    id: "spike",
    tag: "Problem 1",
    title: "The data is lying to you",
    blurb:
      "The Packers look like the most-supported team on Earth — 12.3% of all responses. That's a lie the data told itself: on May 18 the Packers' official Instagram commented on the survey, and responses exploded to ~40% for three days. Watch the green line break.",
    layer: { kind: "team", team: "Green Bay Packers" },
    camera: { center: [-90, 43], zoom: 4.2, pitch: 0 },
    panel: "spike",
  },
  {
    id: "corrected",
    tag: "Problem 2",
    title: "Where do fans actually live?",
    blurb:
      "Strip the spike (use only May 11–18, before the comment) and the real leaderboard appears: the Packers and Seahawks are tied at 6.5%. Seattle punching above a one-team market is the 12th-Man effect, measured.",
    layer: { kind: "dominant" },
    camera: { center: [-96.5, 39.0], zoom: 3.6, pitch: 0 },
    panel: "leaderboard",
  },
  {
    id: "diaspora",
    tag: "Problem 3",
    title: "The diaspora index",
    blurb:
      "For every team, what share of its fans live in its home state? The Raiders are the most scattered in the NFL — barely 5% in Nevada — a permanent shadow of the Oakland→Las Vegas move. The arcs run from every Raiders fan back to Allegiant Stadium.",
    layer: { kind: "team", team: "Las Vegas Raiders" },
    camera: { center: [-108, 38], zoom: 3.4, pitch: 0 },
    panel: "diaspora",
  },
  {
    id: "international",
    tag: "Problem 4",
    title: "Bills Mafia North & the world",
    blurb:
      "Cut the data by country and the map goes global. The Bills are effectively Canada's team (17% of Canadian fans). Germany splits between the Seahawks and Packers; Australia loves the 49ers. Each country is colored by its top team.",
    layer: { kind: "country" },
    camera: { center: [-30, 25], zoom: 1.7, pitch: 0 },
    panel: "international",
  },
  {
    id: "voronoi",
    tag: "Problem 5",
    title: "Nearest stadium ≠ your team",
    blurb:
      "If fandom were pure geography, everyone would root for their closest stadium. This is that map — every point assigned to its nearest team. Only 33% of fans actually match. The Raiders' cell is the worst: just 8% of the people living closest to Las Vegas are Raiders fans.",
    layer: { kind: "voronoi" },
    camera: { center: [-96.5, 39.0], zoom: 3.7, pitch: 0 },
    panel: "voronoi",
  },
  {
    id: "rust",
    tag: "Problem 6",
    title: "The Rust Belt diaspora",
    blurb:
      "Industrial-era teams show large, specific fan clusters in Sun Belt cities — the fingerprint of the 50-year Rust-Belt-to-Sun-Belt migration. Phoenix is the extreme: 38% of its responses are Rust Belt or Upper-Midwest teams. Circles are sized by Rust Belt fans per metro.",
    layer: { kind: "rust" },
    camera: { center: [-92, 31.5], zoom: 4.2, pitch: 0 },
    panel: "rust",
  },
  {
    id: "moran",
    tag: "Hidden science",
    title: "Moran's I — where fanbases cluster",
    blurb:
      "Moran's I asks whether a team's fans clump together more than chance. This is the local view (LISA): red dots are statistically significant hotspots — a region strong for the team, surrounded by others that are too. Orange/blue are outliers. Switch teams to compare a tight fanbase (Bills) with a scattered one (Cowboys).",
    layer: { kind: "lisa", team: "Buffalo Bills" },
    camera: { center: [-96.5, 39.0], zoom: 3.6, pitch: 0 },
    panel: "moran",
  },
];
