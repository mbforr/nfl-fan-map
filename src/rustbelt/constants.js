// Domain constants for the Rust Belt ⇄ Sun Belt app.
//
// These mirror analysis/src/lookups.py but are DELIBERATELY not identical:
// that file's RUST_BELT_TEAMS is an 8-team list (with the Vikings, without the
// Colts and Eagles) and is depended on by 07_rust_belt.py and the published
// walkthrough — don't "reconcile" the two. This app carries its own 9.

/** The bloc, in rough geographic order. Display order only; panels sort by data. */
export const RUST_BELT_TEAMS = [
  "Green Bay Packers",
  "Chicago Bears",
  "Detroit Lions",
  "Cleveland Browns",
  "Cincinnati Bengals",
  "Indianapolis Colts",
  "Buffalo Bills",
  "Pittsburgh Steelers",
  "Philadelphia Eagles",
];

// Home state = the state the team's CURRENT stadium sits in. Transcribed from
// analysis/src/lookups.py, including its judgement calls:
//   Giants and Jets are NJ (not NY); Commanders are MD (not DC).
// Neither matters inside the Sun Belt, but keep them correct so the derivation
// below stays right if the state list ever grows.
export const TEAM_HOME_STATE = {
  "Buffalo Bills": "NY", "Miami Dolphins": "FL", "New England Patriots": "MA",
  "New York Jets": "NJ", "Baltimore Ravens": "MD", "Cincinnati Bengals": "OH",
  "Cleveland Browns": "OH", "Pittsburgh Steelers": "PA", "Houston Texans": "TX",
  "Indianapolis Colts": "IN", "Jacksonville Jaguars": "FL", "Tennessee Titans": "TN",
  "Denver Broncos": "CO", "Kansas City Chiefs": "MO", "Las Vegas Raiders": "NV",
  "Los Angeles Chargers": "CA", "Dallas Cowboys": "TX", "New York Giants": "NJ",
  "Philadelphia Eagles": "PA", "Washington Commanders": "MD", "Chicago Bears": "IL",
  "Detroit Lions": "MI", "Green Bay Packers": "WI", "Minnesota Vikings": "MN",
  "Atlanta Falcons": "GA", "Carolina Panthers": "NC", "New Orleans Saints": "LA",
  "Tampa Bay Buccaneers": "FL", "Arizona Cardinals": "AZ", "Los Angeles Rams": "CA",
  "San Francisco 49ers": "CA", "Seattle Seahawks": "WA",
};

/** The broad 16-state Sun Belt. `fips` matches states_polygons.geojson `id`. */
export const SUN_BELT = [
  { fips: "01", usps: "AL", name: "Alabama" },
  { fips: "04", usps: "AZ", name: "Arizona" },
  { fips: "05", usps: "AR", name: "Arkansas" },
  { fips: "06", usps: "CA", name: "California" },
  { fips: "12", usps: "FL", name: "Florida" },
  { fips: "13", usps: "GA", name: "Georgia" },
  { fips: "22", usps: "LA", name: "Louisiana" },
  { fips: "28", usps: "MS", name: "Mississippi" },
  { fips: "35", usps: "NM", name: "New Mexico" },
  { fips: "32", usps: "NV", name: "Nevada" },
  { fips: "37", usps: "NC", name: "North Carolina" },
  { fips: "40", usps: "OK", name: "Oklahoma" },
  { fips: "45", usps: "SC", name: "South Carolina" },
  { fips: "47", usps: "TN", name: "Tennessee" },
  { fips: "48", usps: "TX", name: "Texas" },
  { fips: "49", usps: "UT", name: "Utah" },
];

export const SUN_BELT_FIPS = SUN_BELT.map((s) => s.fips);
export const STATE_BY_FIPS = Object.fromEntries(SUN_BELT.map((s) => [s.fips, s]));
export const FIPS_BY_USPS = Object.fromEntries(SUN_BELT.map((s) => [s.usps, s.fips]));

/** usps → home team names, restricted to the Sun Belt. Derived, never hand-listed. */
export const HOME_TEAMS_BY_USPS = (() => {
  const out = Object.fromEntries(SUN_BELT.map((s) => [s.usps, []]));
  for (const [team, usps] of Object.entries(TEAM_HOME_STATE)) {
    if (out[usps]) out[usps].push(team);
  }
  return out;
})();

/** fips → home team names. */
export const HOME_TEAMS_BY_FIPS = Object.fromEntries(
  SUN_BELT.map((s) => [s.fips, HOME_TEAMS_BY_USPS[s.usps]]),
);

/** The Sun Belt states with no NFL franchise — derived, so it can't drift. */
export const NO_HOME_FIPS = SUN_BELT
  .filter((s) => HOME_TEAMS_BY_USPS[s.usps].length === 0)
  .map((s) => s.fips);

export const teamNick = (t) => String(t || "").split(" ").pop();
