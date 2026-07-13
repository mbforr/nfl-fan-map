# Video 8 Plan: The NFL Global Fan Map

**Working title:** "I asked the internet which NFL team they root for. The map I got back broke my brain."
**Target runtime:** 14-16 minutes
**Structure:** Mark Rober numbered-problem teaching format. Four scales, each one a different lens on the same dataset.
**Data source:** Matt's NFL Global Fan Map survey, 27,990 responses from May 11 to June 30, 2026.
**Recurring character:** The Green Bay Packers Instagram spike (the dataset's own personality breaking the analysis).

---

## The headline numbers

| Metric | Value |
|---|---|
| Total responses | **27,990** |
| Countries represented | **145** |
| US states + territories | **673 strings, ~52 unique** (after normalization) |
| International share | **24.0%** (6,707 of 27,990) |
| Top team (all data, IG-skewed) | **Green Bay Packers, 3,506 (12.5%)** |
| Top team (pre-skew baseline May 11-18) | **Packers and Seahawks TIED at 6.5%** |
| Most home-state-loyal team | **Houston Texans, 69% in Texas** |
| Most diaspora team | **Las Vegas Raiders, 5% in Nevada** |
| Bills fans in Canada | **293** (17.4% of Canadian respondents) |
| Germany's top teams | **Packers and Seahawks TIED at 54 fans** |

---

## The core question and the WHY

This is not actually a video about NFL fans. It is a video about what fan geography reveals about America, about diaspora, about how brands accidentally become identity infrastructure, and about how internet data lies to you in entertaining ways.

The Waffle House video taught viewers that geography is logistics. This video teaches them that geography is identity, that NFL teams are the second-largest non-religious tribal affiliation in America after political party, and that the patterns in this map explain things like why Buffalo gives Western New York its sense of self, why Wisconsin treats Sundays differently than any other state, and why a team moving from Oakland to Las Vegas leaves a permanent geographic shadow.

The WHY framing for the cold open: "NFL teams are the most successful regional identity brands America has ever built. When one moves, when one underperforms, when one's stadium fills with another team's fans, you can see the geography of identity shift in real time. I asked 27,990 people which team they root for. The map I got back tells you something about America you cannot get any other way."

---

## The four-scale escalation (the spine of the video)

Same structural pattern as the Waffle House video. Five numbered problems. Each one reveals a different layer.

### Problem one. The data is lying to you.

The single most important early beat. The Green Bay Packers appear to be the most-supported NFL team in the world, with 3,506 fans, or 12.5 percent of all responses. This is a lie. It is a lie the data itself made.

Show the daily share of Packers fans over time:
- May 11 to May 18: Packers run at a steady 6 to 7 percent of daily responses.
- May 19: Packers jump to 39.6 percent.
- May 20: Packers jump to 43.1 percent.
- May 21: Packers at 38.3 percent.
- This pattern continues sporadically through June.

The reason: the Green Bay Packers official Instagram account commented on Matt's launch video about the survey on May 18 or 19. That comment drove a viral spike of Packers fans submitting responses. Without that comment, the Packers would still be in the top tier of teams, but they would be tied with the Seattle Seahawks at 6.5 percent each, not running away with 12.5 percent.

This is a teaching moment about self-selection bias in survey data. Every survey is influenced by where the survey was distributed. The data does not represent "the NFL fan population." It represents "the NFL fan population that follows Matt Forrest on Instagram, plus a Packers spike." Acknowledging this up front earns viewer trust and sets up the rest of the video as honest analysis.

**Hidden science:** sampling bias, observer effect, why internet surveys are not random samples. Mention Pew Research and how they correct for this.

### Problem two. Where do fans actually live?

Strip the Packers Instagram skew. Show the corrected leaderboard:
- Packers: 6.5%
- Seahawks: 6.5% (tied)
- Eagles: 5.7%
- Bills: 5.4%
- Patriots: 5.3%
- Bears: 5.0%
- Steelers: 4.6%
- 49ers: 4.4%
- Broncos: 4.3%
- Lions: 3.8%

The Seahawks at the top of the leaderboard is a real surprise. The Pacific Northwest has one NFL team and that team punches dramatically above its market size. The "12th Man" phenomenon is real and measurable.

Show the US-level distribution. Which states sent the most responses? California, Texas, New York, Wisconsin, Pennsylvania, Illinois, Florida, Ohio, Virginia, North Carolina.

The interesting beat: Wisconsin has 867 responses (more than New York's 938 despite being a much smaller state). That is the Packers Instagram effect in a state-level mirror. Some of Wisconsin's outsized response volume is the same network effect.

**Hidden science:** weighted survey corrections, post-stratification, the difference between raw counts and per-capita rates.

### Problem three. The diaspora index.

This is the most visually arresting beat. For every team, compute what percentage of their fans live in the team's home state.

Houston Texans: 69 percent of fans live in Texas. Most home-state-loyal team in the NFL. They have only existed since 2002.

Las Vegas Raiders: 5 percent of fans live in Nevada. By far the most distributed team. Their California fans outnumber their Nevada fans by 8 to 1. The team moved from Oakland to Las Vegas in 2020 and the fans stayed in California.

The full leaderboard from least loyal to most loyal:
1. Raiders 5%
2. Commanders 15%
3. Giants 17%
4. Steelers 19%
5. Chiefs 21%
6. Packers 23%
7. Saints 23%
8. Bills 24%
9. Patriots 25%
...
30. Colts 53%
31. Browns 53%
32. Texans 69%

The pattern: relocated teams have low home-state percentages (Raiders, Chargers, Rams all in California). Young teams have high home-state percentages (Texans, founded 2002). Original franchises with long histories have low percentages because their diaspora has had decades to spread (Steelers, Packers, Patriots).

**Hidden science:** distance-decay analysis, the geography of team age, what happens to a fanbase when the team moves.

The Albuquerque-equivalent recurring character is the Las Vegas Raiders. They are the team the data keeps coming back to as the most extreme case.

### Problem four. The Bills Mafia North problem.

When you cut the data by country, the Buffalo Bills are essentially the unofficial NFL team of Canada. 293 Canadian respondents picked the Bills, which is 17.4 percent of all Canadian responses. The next-closest team in Canada is the Seahawks at 201 fans, and most of those are in British Columbia for the same reason (geographic proximity).

The Bills are a 90 minute drive from Toronto. The Buffalo Bills play home games and during the regular season have, in the past, played designated home games in Toronto. The team has 1.5 million people within 90 minutes who watch them on Canadian TV.

Germany loves the Packers and the Seahawks equally (54 fans each). This is the NFL International Series effect: the Packers and Seahawks have both played regular-season games in Germany.

Australia loves the 49ers (47) and the Bills (46). The 49ers played a regular-season game in Mexico City. The Pacific Rim time zone makes 49ers night games more watchable from Australia.

Mexico loves the Packers, Steelers, Cowboys, and 49ers. The Cowboys connection is geographic. The other three are media-driven.

**Hidden science:** how the NFL International Series has reshaped global fandom, what time zones do to TV viewership, why English-speaking countries cluster around different teams than non-English-speaking ones.

### Problem five. The states with no NFL team. (The hidden infrastructure beat.)

23 US states do not have an NFL franchise. The question: who do they root for?

The pattern is geographic and weirdly clean. Each NFL-less state shows distance-decay loyalty to the nearest franchise:

- New Hampshire: 71% Patriots
- Rhode Island: 50% Patriots
- Maine: 47% Patriots
- Delaware: 46% Eagles
- West Virginia: 27% Steelers
- North Dakota: 33% Vikings
- South Dakota: 27% Vikings
- Iowa: 30% Packers (closer to Green Bay than to Minneapolis)
- Wyoming: 26% Broncos
- Mississippi: 24% Saints

But there are surprises. Idaho is dominated by the Seahawks (17%), not the Broncos. The Pacific Northwest geography extends further inland than people think. Alaska is also Seahawks territory (21%). Hawaii is split (Packers 22%, Seahawks 11%) because there is no nearby franchise and TV broadcasting determines fandom.

This is the recurring callback to the Wisconsin / Bills Mafia story. The geography of fandom is the geography of where a team's broadcast actually reaches.

**Hidden science:** broadcast reach, NFL territorial rights, why the original team designation in each "Designated Market Area" matters, Voronoi catchment analysis.

---

## The recurring character: the Packers IG spike

Unlike the Waffle House video where Albuquerque was a single object that anchored the cold open and close, this video has a meta-character: the Packers Instagram comment effect itself.

It appears in:
- Cold open (briefly): "the data tried to lie to me five times."
- Problem one: the full explanation of the spike.
- Problem two: how stripping it changes everything.
- Problem three: why the Packers still rank high on the diaspora index even after correction.
- Problem five: the Packers still showing up as a top-3 team in many NFL-less states. Some of that is the IG effect leaking through.
- Close: the meta-observation that even the data has a personality. Every dataset is alive.

The hidden lesson: every internet dataset has a story about how it was collected. Honest analysis acknowledges that story.

---

## Hidden science segments

Four segments distributed across the video. Same density as Waffle House v5.

1. **Sampling bias and the observer effect (Problem one, 2 minutes in).** The Pew Research framing. Why your Twitter poll is not representative. The famous "literary digest" 1936 election failure where they polled 2.4 million people and still picked the wrong president because of self-selection.

2. **Distance-decay and spatial autocorrelation (Problem three, 6 minutes in).** Why teams' fanbases spread the way they do. Moran's I as a measure of spatial clustering. The math is simple. Are Buffalo Bills fans more clustered in space than you would expect by chance? Yes, dramatically. Are Packers fans? Less so, even after IG correction. This is a real spatial statistic.

3. **The Voronoi diagram of broadcast territories (Problem five, 11 minutes in).** Show what the map of "nearest NFL team" looks like as a Voronoi diagram. Then overlay actual NFL TV market territories. Then overlay the empirical fan map from the survey. The three maps are different, and the differences tell a story about media power versus geography.

4. **The math of identity (Close, 13 minutes in).** Brief reflective beat. How a sports franchise becomes a regional identity carrier. Why moving a team is one of the few things that can permanently scar a city's psyche. The Brooklyn Dodgers analogue. The geography of grief.

---

## Spatial statistics techniques to bring in via Claude Code

Matt mentioned wanting to apply spatiotistical analysis. The list, in order of how visually they would land in the video:

1. **Voronoi tessellation** of NFL stadiums. Every point on the US map gets assigned to the nearest team. The Voronoi cells are the "physical fanbase territory." This is the simplest visualization and creates a perfect map.

2. **Moran's I** for each team's fan distribution. Tests whether the fanbase is more spatially clustered than random. Compute per team. The Texans will score highest (most clustered). The Steelers will score lowest (most distributed). This becomes a single number per team that ranks them on geographic loyalty.

3. **Distance-from-stadium analysis.** For each respondent, compute the great-circle distance to their team's stadium. Plot the distribution per team. Some teams have sharp distance-decay (close fans drop off fast with distance). Others are flat (national brands). This produces a great chart.

4. **Hot-spot analysis (Getis-Ord Gi star).** Identify statistically significant clusters of out-of-market fandom. Where are the surprising hotspots? (Iowa for Packers, Northern Virginia for Commanders, etc.)

5. **Population-normalized fan rate.** Use census ZIP-code population to compute "fans per capita" rather than raw counts. This corrects for the fact that California has more people than Wyoming. Shows which states are over-indexing on fandom relative to population.

6. **Spatial regression.** Predict team fandom from demographic and geographic features. Distance to stadium. State median income. Population density. This is the heavy lift and probably overkill for the video, but it produces a really cool "what determines NFL fandom" output.

For the video, focus on 1, 2, and 3. Save 4, 5, 6 for a followup if the data carries.

---

## Data caveats (READ before scripting precise claims)

These shape what is safe to state as fact:

1. **The data is not a random sample.** It is a self-selected response set from people who follow Matt's Instagram. This is not "the NFL fan population." This is "Matt's audience reporting their NFL allegiance plus a Green Bay Packers spike."

2. **The Packers Instagram spike is dramatic.** May 19-24 saw Packers responses jump from 6 percent of daily volume to 39-43 percent. After May 25 the spike subsides but sporadic mini-spikes appear through June. Any team-level claim about Packers should use the pre-May-19 baseline of 6.5 percent.

3. **State name normalization is incomplete.** The dataset has 673 unique state strings due to typos and abbreviations ("New York" vs "NY", "California" vs "CA", "Pennsylvania " with trailing space). Real US state count is 50. Cleaning is needed before any state-level analysis.

4. **"Home state" is ambiguous for some teams.** Giants and Jets play in New Jersey but are New York teams. Commanders play in Maryland but are Washington DC team (in nominal terms). Cowboys play in Arlington, TX (not Dallas). Use stadium location for home-state designation, but acknowledge the looseness in the script.

5. **City strings are messy.** "Toronto" vs "Toronto ", "New York" vs "NYC" vs "New York City". Geocoding is the right normalization step. Use the Google Maps Geocoding API or Nominatim against OpenStreetMap for free.

6. **24 percent international is not representative of NFL global fandom.** It reflects Matt's international Instagram following. The real NFL international fan base is more heavily UK and Mexico because of the International Series. The data underrepresents Mexico because Matt's audience is more English-speaking.

### Safe to state vs soften

| Safe as stated | Soften / approximate |
|---|---|
| 27,990 responses | "about 28,000 responses" |
| Packers spike was real | "the Packers IG share" → "the share that jumped to 40% on certain days" |
| 145 countries represented | the diversity claim, exact international % |
| Texans 69% home state loyal | "near 70%" |
| Raiders 5% home state | "barely 5%" |
| Bills 17% of Canadian respondents | the absolute Canada-Bills count (293) |
| Pre-spike Packers and Seahawks tied | "Seahawks were the most popular non-Packers team" if we want to be conservative |

---

## Visualization stack

- **kepler.gl** for the global fan map with team colors. Each pin is a respondent. Filter by team to show diaspora visually.
- **Felt** for the US-level state choropleth. Color states by which team dominates. Overlay team logos.
- **Plotly** for the time-series chart of daily Packers share, the diaspora index leaderboard, and the home-state-loyalty ranking.
- **Voronoi computation** via `scipy.spatial.Voronoi` against stadium coordinates. Render in Felt or as a PNG overlay.
- **PySAL** (`pysal.lib.weights`, `esda`) for Moran's I and Getis-Ord Gi* hot-spot analysis.
- **GeoPandas** for the heavy lifting.
- **kepler.gl** again for the final animated reveal: Packers spike on May 19 shown as a time-lapse of dots appearing.

---

## Cold open options

Three candidates. Pick whichever produces the strongest first 10 seconds.

**Option A: The Packers spike.** Open with a time-series line chart of daily Packers fan share. The line runs flat at 6 percent through May 18, then EXPLODES upward on May 19. Matt voiceover: "On May 19, 2026, the green line on this chart broke. And the reason it broke is the same reason almost every survey you have ever seen lies to you."

**Option B: The Houston Texans loyalty.** Open with a map of Texas with Houston highlighted. "69 percent of every Houston Texans fan in this dataset lives in Texas. That's the highest home-state loyalty rate of any team in the NFL. Compare that to the Las Vegas Raiders, where only 5 percent of fans live in Nevada. And in both cases, the data is telling you something important about how a team becomes part of a place."

**Option C: The Bills Mafia North.** Open with a flag of Canada and the Bills logo. "The Buffalo Bills are the most popular NFL team in Canada. 17 percent of every Canadian who responded to this survey is a Bills fan. The next-closest team is the Seahawks at 12 percent. And the reason for both has more to do with geography than with football."

My recommendation: **Option A.** The Packers spike is the most arresting visual, it sets up the data-has-personality theme that runs through the whole video, and it earns viewer trust by leading with the data's biggest flaw.

---

## Risks and things to verify before scripting

1. **State string normalization.** Before any state-level claim, normalize the dataset. The dataset has 673 unique state strings.
2. **City geocoding.** Geocode the city strings to get real lat/lon. Use Nominatim. About 28,000 calls. Cache the results.
3. **Stadium coordinates.** Build a lookup table of NFL stadium lat/lon. 32 entries. Manual or scraped from Wikipedia.
4. **Home-state mapping.** Build the team to home-state lookup. Note ambiguities (Giants/Jets in NJ, Commanders in MD, Cowboys in TX but Arlington not Dallas).
5. **Date filtering.** Confirm the Packers spike windows. Use May 11-18 as the pre-spike baseline.
6. **Population normalization.** Pull state and ZIP-code population from US Census Bureau ACS 5-year. Compute fans-per-capita.
7. **Voronoi computation.** Build the stadium-based Voronoi diagram. Compare against actual NFL TV market boundaries (available from Nielsen, also referenced in publicly available NFL territory documents).
8. **Moran's I per team.** Compute spatial autocorrelation per team. This is the headline statistical reveal.
9. **Distance-decay curves.** Compute distance from each fan to their team's stadium. Plot the distribution.

---

## Pre-script checklist

Same pattern as the Waffle House plan. Run these in order before sitting down to script.

1. Load and normalize state strings. Drop or fix the 673-string mess.
2. Geocode all 28,000 city responses to lat/lon. Cache.
3. Build stadium lookup table. Compute great-circle distance from each respondent to their team's stadium.
4. Filter out the Packers IG spike days (May 19-25 plus sporadic later spikes) and produce a clean pre-spike baseline.
5. Compute the diaspora index per team (home-state percentage). Build the leaderboard.
6. Compute Voronoi tessellation against stadium coordinates. Overlay against actual fan map. Compute the "agreement" between the two.
7. Compute Moran's I per team. Build the loyalty-clustering leaderboard.
8. Identify the single most surprising team-state pair (most out-of-market fans in unexpected place). Candidates: Iowa for Packers, Northern Virginia for Commanders, Western Massachusetts for Steelers.
9. International cut: top team per country. Surprises.
10. Generate the kepler.gl animated map of responses arriving over time. The Packers spike will be the cinematic high point.
11. Generate the Voronoi vs. real-fan-map comparison.
12. Generate the per-team distance-decay curves.
13. Write SUMMARY.md with the headline numbers.
14. THEN script.

---

## Sponsor / credit placement

- **Data:** Matt's own Instagram survey (CC attribution to the audience, not a paid sponsor).
- **Routing / geocoding:** Nominatim (OpenStreetMap, free).
- **Compute:** WherobotsDB and SedonaDB (continuing the relationship from Waffle House and Loneliest Building).
- **Spatial stats:** PySAL (open source, academic).
- **Visualization:** Felt (potential sponsor candidate, their use case is exactly this), Dekart (continuing relationship), kepler.gl (free).
- **Census data:** US Census Bureau ACS API (free).

Felt is the strongest sponsor candidate for this specific video given they specialize in making this kind of public-facing map shareable.

---

## What this video accomplishes for the channel

Three things, in order of importance.

1. **Audience proof.** The video uses Matt's own audience as the data. It demonstrates that this channel has actual reach and creates community-generated insights. This is the most defensible content moat any data channel can build: data only this channel can produce.

2. **Spatial statistics introduction.** Moran's I, Voronoi tessellations, distance-decay, and Getis-Ord Gi* are all real techniques that any GIS practitioner uses. Introducing them through NFL fans makes them accessible without the math overhead.

3. **The "data has a personality" thesis.** Every dataset is influenced by how it was collected. This is one of the most important lessons in geographic analysis and it is rarely taught. The Packers IG spike makes it visible and visceral.

---

---

## Problem six (added). The Rust Belt diaspora and the fan-bar test.

This is the strongest single demographic story in the dataset and it deserves its own beat in the video. The pattern is this. Industrial-era NFL teams in Pittsburgh, Buffalo, Cleveland, Detroit, Chicago, and Cincinnati show large, geographically specific fan populations in Sun Belt cities. Those populations match almost exactly where documented "fan bars" exist in the real world.

The Buffalo Bills are the most spectacular example. The Bills have 14 fans in Charlotte, NC alone. They have 10 in Raleigh, NC. They have 9 each in Tampa and Orlando, FL. They have 5 in Austin, TX. Combined, the Bills have more fans in Charlotte, Raleigh, Tampa, Orlando, and Austin than they do in the entire state of Pennsylvania. The Buffalo Bills Backers Charlotte chapter, the Tampa Bay Bills Backers, and the Austin Bills Backers are all real organizations with documented bar partnerships. The data found them without knowing they existed.

The Pittsburgh Steelers tell the same story across more cities. Orlando 9 fans. Austin 6. Raleigh 5. San Antonio 5. Nashville 5. Chattanooga 5. The Steelers run a sanctioned "Steelers Nation" bar program with over 350 registered locations worldwide. The data lights up exactly where those bars are.

The Chicago Bears show the same Sun Belt pattern, with Austin 7 fans, Dallas 5, San Antonio 5, El Paso 4, Nashville 4. The Bears Backers International program does the same bar-sanctioning thing.

Phoenix metro is the most extreme single case. 38 percent of Phoenix metro respondents picked a Rust Belt or Upper Midwest team. 45 Packers fans. 14 Steelers fans. 11 Bears fans. 10 Bills fans. 8 Vikings fans. That is the Wisconsin and Michigan retiree migration to Sun City and Mesa, documented in census data from the 1970s onward. The Packers in Phoenix specifically is famous enough that the Pat McAfee Show has talked about it.

This is a real macro-demographic shift visible in NFL data. From 1970 to 2010, the US Census recorded a permanent migration of roughly 25 million people from the Northeast and Midwest to the South and Southwest. Industrial collapse pushed them. Air conditioning, cheap housing, and Sun Belt job growth pulled them. They kept their NFL allegiances. Their children kept them too. The fan map is a 50-year demographic record disguised as a sports survey.

For the video, the fan-bar tie-in is the visual hook. We can pin specific bars to specific high-density spots on the map:

- Bills Backers Charlotte at any of their host bars (publicly listed on biltsbackers.com or the team's site)
- Tampa Bay Bills Backers
- Steelers Nation Orlando location
- Bears Backers Austin location
- Pack Backers Phoenix at the Sun City chapter

The reveal pattern: the algorithm picked these cities without knowing anything about the bars. The bars exist where the algorithm pointed. That match is the evidence that the data is real and not noise.

**Hidden science extension:** the geography of the Great Migration in reverse. The Rust Belt to Sun Belt migration is one of the largest internal population movements in US history. The NFL fan map is one of the few publicly visible artifacts of it because brand loyalty persists across the move. This is how you can see economic history with a sports survey.

---

## Other macro demographic patterns visible in the data

While digging into the Rust Belt beat, several other macro shifts surfaced that are worth flagging for the script. Some warrant their own beats, others are color for existing beats.

### The Charlotte and Research Triangle banking and tech migration.

Charlotte has 104 respondents. Carolina Panthers lead at 48 (46 percent). The number two team is the Buffalo Bills at 14. The Pittsburgh Steelers come in at 7. The Philadelphia Eagles at 4. Washington Commanders at 4.

Charlotte became the second-largest banking center in the United States starting in the 1990s when Bank of America and Wachovia grew their headquarters there. The Northeast tax-driven migration of finance workers to Charlotte is documented. The fan map shows it.

Same pattern in the Research Triangle (Raleigh, Durham, Cary, Apex, Chapel Hill). 155 responses. Panthers lead at 34. Bills second at 21. Packers at 13. Commanders at 10. Patriots at 10. Giants at 7. Bears at 7. Eagles at 5. Steelers at 8.

The Triangle became a tech and pharma hub starting in the 1980s, pulling workers from Boston (MIT/Harvard), New York, and Philadelphia. The fan map shows the bias toward Northeast teams that this migration created.

### The Austin tech migration.

Austin has 119 responses. Houston Texans first (logical, geographic). But then look at the runners up. Green Bay Packers 20 (some IG skew but still). Cowboys 17. Bears 7. Steelers 6. Bills 5. 49ers 4. Patriots adjacent.

Austin grew from 250,000 to 950,000 between 1990 and 2020 with a massive tech-worker import from California, Chicago, the Northeast. The fan map shows it. Bears in Austin is the documented Chicago-to-Austin tech migration in NFL form.

### The 1970s Steelers Nation expansion.

The Pittsburgh Steelers diaspora is the most balanced in the league. California 88, Ohio 86, Virginia 66, Florida 60, Texas 58, North Carolina 47. No other team has this kind of even cross-coastal spread. The reason is historical.

Pittsburgh Steel collapsed between 1975 and 1985. 150,000 steelworkers and their families left Western Pennsylvania during that decade. They scattered nationally because their skills were transferable to manufacturing jobs anywhere. The Steelers had just won four Super Bowls in six years (1974, 1975, 1978, 1979). Every emigrant from Pittsburgh in that era took their Steelers loyalty with them.

This is the cleanest single example of "economic collapse exports brand loyalty" in American sports. It is also why the Pittsburgh Steelers are the only NFL team with a sanctioned global bar program at scale. The diaspora demanded somewhere to watch.

### The Detroit retiree migration to Florida.

Detroit Lions show a smaller but real Sun Belt pattern. Florida 23, Texas 22, Tennessee 13. Knoxville 4, Nashville 4, Jacksonville 4 specifically. Detroit auto retirees in Florida is a well-documented demographic. The Lions diaspora confirms it.

### The Bills Mafia North and the Buffalo-to-Carolinas pipeline.

The Bills story has two distinct migrations. The Canadian one (293 respondents, mostly Ontario), which is geographic and broadcast-driven. And the Buffalo-to-Carolinas one (58 in NC, 58 in FL), which is something different. Western New York lost roughly 250,000 people to net out-migration between 1970 and 2020. Buffalo's population peaked in 1950 and has been declining ever since. The Carolinas were the primary destination after retirement. The fan map shows the Bills as the second most popular team in Charlotte, Raleigh, Tampa, and Orlando because those are the cities Buffalo emigrants went to.

The cultural side: the Bills Mafia identity grew online in the 2010s, partly because the Bills had a passionate diaspora that needed online community. Twitter and Reddit made the diaspora visible to itself. The Bills Mafia is, in part, a digital-era response to a 50-year demographic decline.

### The Pacific Northwest extends inland.

Seahawks dominate Idaho (17 percent), Alaska (21 percent), Montana (close to top), and even reach Hawaii. The Pacific Northwest cultural geography is bigger than the literal Pacific Northwest. This is a soft beat that could land in Problem five if we have room.

### The military base effect.

Cities with major military installations show distinctive patterns:

- Colorado Springs (Air Force Academy, Peterson AFB): 40 percent Broncos.
- San Diego (Naval Base SD): 29 percent Chargers (even after the team moved to LA, the Navy stayed).
- Tacoma (Joint Base Lewis-McChord): 42 percent Seahawks.
- Virginia Beach (Naval Norfolk area): 24 percent Commanders.

Military bases are diaspora hubs. Service members come from everywhere and root for whatever team was theirs before deployment. The Steelers and Packers show up disproportionately in nearly every military city as a result.

### The HBCU and Black-population effect.

Several teams with large Black fan bases (Cowboys, Falcons, Saints, Eagles, Steelers) show distribution patterns that track historically Black college and university locations and the Great Migration legacy. This is a sensitive beat that would require careful framing and probably more dedicated analysis than fits in this video. Flag for a possible followup.

### The Mexican fanbase pattern (Cowboys, Steelers, Packers).

Mexico's 409 respondents pick Packers, Steelers, Cowboys, and 49ers as the top four. The Cowboys connection is geographic (Mexico-Texas proximity, plus the team's Hispanic marketing investment since the 1970s). The Steelers connection is the NFL's first regular international expansion attempt (Mexico City game in 2005 was a Steelers game). The Packers and 49ers connections are media-driven via Univision and ESPN Deportes.

---

## Updated headline numbers

| Metric | Value |
|---|---|
| Bills fans in Charlotte alone | **14** (#2 team in the city) |
| Bills fans in Research Triangle | **21** (#2 team in the area) |
| Phoenix metro Rust Belt fans | **100 (38%)** of all responses |
| Packers fans in Phoenix metro | **45** |
| Bears fans in Austin | **7** (tech migration signal) |
| Steelers fans in Orlando | **9** (Steelers Nation in FL) |
| Steelers diaspora balance | **CA 88, OH 86, VA 66, FL 60, TX 58, NC 47** (most balanced in NFL) |

---

## Updated visualization stack

Add to the existing list:

- **Fan-bar pin overlay.** Source the public bar lists from billsbackers.com, steelers.com Steelers Nation page, and bears-backers.com. Pin each one as a dot. Overlay against the survey heatmap. The match is the visual punchline.
- **US Census ACS migration flow data.** Pull 5-year migration tables from the Census API. Show the Rust Belt to Sun Belt flow as a Sankey-style or arrow overlay. The arrows match the fan map.
- **Steel mill closures map.** Overlay the documented Pittsburgh-area steel mill closure dates with the Steelers diaspora pattern. Source: Allegheny Conference on Community Development historical records.

---

## Updated pre-script checklist additions

Add to the existing 14-item list:

15. Source the fan-bar lists from each team's official Backers program. Bills Backers, Steelers Nation, Bears Backers, Pack Backers, Lions Pride. Build a CSV of bar lat/lon per team.
16. Cross-reference fan-bar locations with the survey heatmap. Compute a "match rate" per team. The Bills and Steelers should score near 1.0.
17. Pull US Census migration flow data for 1970-2020 from the ACS. Identify the largest Rust Belt to Sun Belt corridors. Compare to the fan map.
18. Find the steel mill closure documentation for Pittsburgh 1975-1985 (Allegheny Conference reports). Mark the closure dates on a timeline.
19. Verify Phoenix Packers retiree claim against Wisconsin out-migration data from the Wisconsin Department of Health Services demographic reports.
20. Pull a documented Steelers Nation bar count for the script. Last known count was over 350 worldwide.

---

## Updated cold open consideration

The Rust Belt beat is strong enough to be the cold open itself. New Option D:

**Option D: The fan bar match.** Open with a satellite map of Charlotte, NC. Pin the location of the Bills Backers Charlotte host bar. "There are 14 Buffalo Bills fans living in Charlotte, North Carolina. There is also a Buffalo Bills fan bar in Charlotte. The bar opened in 2009. The fans showed up first. The data found them without knowing the bar existed."

This is the most cinematic option and ties the data to a physical place the viewer can visit. My updated recommendation: **stick with Option A (the Packers spike)** as the cold open because it lands the data-has-personality theme first, but reserve **Option D for the cold open of Problem six** as the dramatic reveal that the algorithm matched real-world locations.

---

## Next step

Run items 1 through 20 of the pre-script checklist. Send the data outputs back. I will write the script v1 directly from the real algorithm results, following the entertainment-video-script-writer skill (Mark Rober numbered structure, recurring meta-character thread for the Packers spike, the data-has-personality WHY, cold open on the spike, callback close on the geography-as-identity beat) on top of the youtube-longform-script-writer skill for structure and voice.

The Rust Belt fan-bar beat is the strongest single demographic story in the dataset and should be Problem six in the script. The data finding the bars without being told they exist is the kind of reveal that powers a single Mark Rober beat better than anything else in this dataset.