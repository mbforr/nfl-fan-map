# NFL Fan Map — Insights

Findings from the two analytical apps: **the walkthrough** (`/walkthrough.html`) and
**Rust Belt in the Sun Belt** (`/rustbelt.html`).

**Every number below was recomputed from the current data on 2026-09-08**
(`new_data_0901.csv` → 44,699 rows → **44,244 placed on the map** across 2,365
regions and 152 countries). The walkthrough's own on-screen copy is still frozen at
the May-era figures (it says "29,081 fans", "Packers 12.3%"); where the story has
moved, that's called out.

---

## Part 1 — The walkthrough

### 1. The data lied, and it's measurable

The Packers lead the survey at **10.13%** (4,481 of 44,244) — but that lead is an
artifact. On **19–21 May 2026** the Packers' official Instagram engaged with the
survey and responses detonated:

| Date | Responses | Packers | Packers share |
|---|---|---|---|
| 19 May | 2,136 | 846 | **39.6%** |
| 20 May | 1,575 | 679 | **43.1%** |
| 21 May | 694 | 266 | **38.3%** |
| 22 May | 389 | 83 | 21.3% |

On a normal day the Packers run ~6%. For three days they ran **six to seven times**
that. A smaller aftershock recurs on 10–11 June (28%, 34%).

> The spike has since been **diluted, not removed**: the Packers' all-time share has
> drifted 12.3% → 10.13% as 15,000 more responses arrived. The bias is still in there.

### 2. Strip the spike and the real leaderboard is a dead heat

Using only responses **before 19 May** (n = 18,306):

| Rank | Team | Pre-spike share |
|---|---|---|
| 1= | **Seattle Seahawks** | **6.50%** |
| 1= | **Green Bay Packers** | **6.50%** |
| 3 | Philadelphia Eagles | 5.68% |
| 4 | Buffalo Bills | 5.42% |
| 5 | New England Patriots | 5.33% |

The Seahawks and Packers are tied to the second decimal — **1,189 responses each**.
Seattle matching Green Bay from a single-team market is the 12th-Man effect, measured.

*(The clean-data leaderboard has shifted since May: the Eagles have since surged to
#2 all-time at 7.03%, and the Broncos to #5.)*

### 3. The diaspora index — who lives where they root

Share of a team's **US** fans living in the team's home state:

| Most scattered | | Most rooted | |
|---|---|---|---|
| Las Vegas Raiders | **5.5%** | Houston Texans | **71.0%** |
| Washington Commanders | 17.2% | Los Angeles Rams | 58.3% |
| New York Jets | 21.0% | Cleveland Browns | 52.7% |
| Kansas City Chiefs | 22.3% | Detroit Lions | 51.7% |
| New York Giants | 22.7% | Indianapolis Colts | 51.5% |

The Raiders are the most stateless franchise in the league — **59 of 1,066** US fans
live in Nevada. That's the permanent shadow of Oakland → Las Vegas. The Texans, a
1999 expansion team that never moved, are the mirror image.

### 4. The map goes global

152 countries. Top team by country:

| Country | n | Top team | Share |
|---|---|---|---|
| Canada | 2,298 | **Buffalo Bills** | 15.3% |
| United Kingdom | 1,306 | Philadelphia Eagles | 7.7% |
| Spain | 881 | New England Patriots | 8.4% |
| Mexico | 837 | **Denver Broncos** | 18.2% |
| Germany | 799 | Seattle Seahawks | 8.4% |
| Australia | 763 | Buffalo Bills | 7.1% |
| Brazil | 363 | Green Bay Packers | 13.5% |

Two genuine border effects: **Bills Mafia North** (Buffalo is 90 minutes from
Toronto) and **Denver in Mexico** at 18.2% — the strongest single-team grip of any
large market outside the US.

### 5. Nearest stadium ≠ your team

If fandom were pure geography, everyone would support their closest team. Assign every
US fan to their nearest of the 30 stadium locations (Giants/Jets and Rams/Chargers
share venues) and only **11,809 of 33,653 — 35.1% — match.**

| Weakest territories | Match | Strongest | Match |
|---|---|---|---|
| Raiders (Las Vegas) | **11.7%** | Packers | **71.2%** |
| Cardinals (Phoenix) | 12.2% | Eagles | 61.2% |
| Titans (Nashville) | 20.5% | Steelers | 57.7% |
| Buccaneers (Tampa) | 20.5% | Bills | 57.2% |
| Commanders (DC/MD) | 22.7% | Browns | 56.5% |

Geography explains about a third of NFL fandom. The rest is history, television, and
migration. Note the pattern: **every weak territory is a Sun Belt market, every strong
one is a cold-weather industrial city** — which is the whole premise of Part 2.

### 6. Moran's I — fandom clusters, and by how much

Global Moran's I on US counties (Queen ∪ KNN(4) contiguity, 9,999 permutations,
empirical-Bayes adjusted team share). All 32 teams are significant at Bonferroni.

| Tightest | I | Loosest | I |
|---|---|---|---|
| Detroit Lions | **0.700** | Arizona Cardinals | 0.191 |
| New England Patriots | 0.654 | Miami Dolphins | 0.186 |
| Minnesota Vikings | 0.595 | Los Angeles Rams | **0.118** |
| Seattle Seahawks | 0.521 | Los Angeles Chargers | 0.113 |

Response density itself clusters hard: **I = 0.421, z = 31.4**, with 547 of 2,181
counties statistically significant.

The ordering is a migration story, not a popularity one. The Lions and Patriots are
regionally sealed; the Rams and Chargers are diffuse because Southern California is
made of people from somewhere else.

---

## Part 2 — Rust Belt in the Sun Belt

**The bloc (9):** Packers, Bears, Colts, Lions, Bills, Bengals, Browns, Steelers, Eagles.
**The Sun Belt (16):** AL AR AZ CA FL GA LA MS NM NV NC OK SC TN TX UT.
Nine have home teams; seven have none.

### The headline

Across the Sun Belt: **12,718 responses, of which 4,079 — 32.1% — support a Rust Belt
team.** Against the *combined* home teams of those states (3,496), the transplant bloc
**leads in 12 of 16.**

Nearly a third of all NFL fandom in the American South and Southwest is imported from
nine cold-weather cities.

### State by state

| State | Rust Belt | Home team(s) | Margin |
|---|---|---|---|
| Arizona | 226 | 103 (Cardinals) | **+37** |
| Tennessee | 240 | 151 (Titans) | **+23** |
| Nevada | 74 | 59 (Raiders) | +11 |
| North Carolina | 417 | 371 (Panthers) | +6 |
| Georgia | 262 | 241 (Falcons) | +4 |
| Texas | 600 | 694 (Cowboys, Texans) | −7 |
| California | 882 | 1,027 (49ers, Rams, Chargers) | −8 |
| Florida | 543 | 634 (Jaguars, Dolphins, Bucs) | −8 |
| Louisiana | 44 | 216 (Saints) | **−66** |

*Margin = (Rust Belt − home) / (Rust Belt + home). −100 = home shutout, +100 = bloc shutout.*

**The three biggest Sun Belt states are dead heats.** In California, Florida and Texas
the nine imported teams are within 8 points of *every local franchise combined*.

**Arizona has been annexed.** The Rust Belt bloc more than doubles the Cardinals in
their own state.

**Louisiana is the only fortress.** The Saints take 71% of their state's responses and
hold the bloc to 14.5% — the sole state outside the 25–41% band every other one sits in.

### The seven states with no NFL team

AL, AR, MS, NM, OK, SC and UT have no franchise, so there's nothing to score against —
they're shown as a separate hatched class rather than being counted as blowout wins.
They're deep Rust Belt territory anyway: **South Carolina 41%, Arkansas 38%, Oklahoma
36%, Utah 34%.**

### Which teams travel

| Team | Sun Belt fans | Export rate |
|---|---|---|
| Green Bay Packers | **1,056** | 23.6% |
| Pittsburgh Steelers | 756 | **26.7%** |
| Philadelphia Eagles | 667 | 21.4% |
| Buffalo Bills | 543 | 21.0% |
| Chicago Bears | 308 | 18.9% |
| Cincinnati Bengals | 242 | 16.9% |
| Detroit Lions | 217 | 16.2% |
| Cleveland Browns | 199 | 16.9% |
| Indianapolis Colts | 91 | 16.0% |

*Export rate = share of that team's entire national fanbase now living in the Sun Belt.*

The Packers send the most people; **the Steelers send the largest fraction of
themselves** — more than one in four Steelers fans nationally now lives in the Sun
Belt. Steel-town out-migration in one number.

The Colts barely register (91). Indianapolis never emptied out the way Pittsburgh,
Buffalo and Cleveland did.

### County level

Zooming in, the transplant pockets are specific and legible:

- **Los Angeles County is a perfect tie — 225 Rust Belt vs 223 for the Rams, Chargers
  and 49ers combined.**
- **Maricopa County (Phoenix): 149 vs 73** — Rust Belt doubles the Cardinals in the
  state's largest county.
- **Travis County (Austin) +31**, **Wake County (Raleigh) +22**.
- **Mecklenburg County (Charlotte) −23** — the Panthers do hold their own city.

By metro core county, Rust Belt share of *all* responses:

| Nashville 42% · San Antonio 42% · Austin 41% · Orlando 39% · **Phoenix 38%** |
|---|
| Tampa 37% · Raleigh 35% · Dallas 34% · Atlanta 33% · Charlotte 30% |

### A caveat worth keeping

County-level data is thin: the median Sun Belt county has just **2** head-to-head
responses, and 39% of them would read as a total shutout purely because one side is
zero. The app therefore only scores counties with **≥5** combined responses (201 of
them) and greys out the rest. The state-level numbers are not affected.

---

## Method notes

- Source: `data/responses.csv` (44,699 rows, 11 May – 1 Sep 2026), aggregated by
  `scripts/preprocess.js` into `public/data/regions_polygons.geojson`.
- Home-state assignments follow `analysis/src/lookups.py` (`TEAM_HOME_STATE`), which
  places the Giants and Jets in **NJ** and the Commanders in **MD** — by stadium, not
  by market.
- Moran's I comes from `analysis/src/15_county_lisa.py`. It uses a **Queen ∪ KNN(4)**
  weights graph, because the county layer only contains the 2,181 counties that
  received a response: plain Queen contiguity sees 37 false "islands" and 61
  disconnected components across that punctured set.
- The survey is an Instagram convenience sample, not a random one. Response *density*
  tracks where the account's audience is, so "fan density" should be read as
  "respondent density".
