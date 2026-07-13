"""Hand-coded reference tables for the analysis layer.

These are the domain lookups the pipeline outputs don't carry: each team's
"home state", the FIPS<->state maps for county->state rollups, and the
metro->county-FIPS map for the Rust Belt cross-tab.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Team -> home state (2-letter USPS).
#
# Rule (per Video8 plan §"Home-state mapping"): home state = the state the
# team's CURRENT stadium sits in. Documented ambiguities kept as comments:
#   * Giants & Jets play at MetLife in East Rutherford, NJ but are NY-market.
#     -> NJ by the stadium rule. This lowers their NY-based home-state %.
#   * Commanders play in Landover, MD but are the "Washington" (DC) team. -> MD.
#   * Cowboys play in Arlington, TX (not Dallas) -> TX (same state, no effect).
#   * Raiders (Oakland->Las Vegas 2020) -> NV; Chargers & Rams -> CA. Relocations
#     are exactly why their home-state % is low (the diaspora stayed behind).
# Keys are category_a.json `short_name` values (full team names).
# ---------------------------------------------------------------------------
TEAM_HOME_STATE: dict[str, str] = {
    # AFC East
    "Buffalo Bills": "NY",
    "Miami Dolphins": "FL",
    "New England Patriots": "MA",
    "New York Jets": "NJ",          # NY-market, NJ stadium
    # AFC North
    "Baltimore Ravens": "MD",
    "Cincinnati Bengals": "OH",
    "Cleveland Browns": "OH",
    "Pittsburgh Steelers": "PA",
    # AFC South
    "Houston Texans": "TX",
    "Indianapolis Colts": "IN",
    "Jacksonville Jaguars": "FL",
    "Tennessee Titans": "TN",
    # AFC West
    "Denver Broncos": "CO",
    "Kansas City Chiefs": "MO",
    "Las Vegas Raiders": "NV",      # relocated from Oakland, CA (2020)
    "Los Angeles Chargers": "CA",   # relocated from San Diego, CA (2017)
    # NFC East
    "Dallas Cowboys": "TX",         # stadium in Arlington, TX
    "New York Giants": "NJ",        # NY-market, NJ stadium
    "Philadelphia Eagles": "PA",
    "Washington Commanders": "MD",  # DC team, MD stadium
    # NFC North
    "Chicago Bears": "IL",
    "Detroit Lions": "MI",
    "Green Bay Packers": "WI",
    "Minnesota Vikings": "MN",
    # NFC South
    "Atlanta Falcons": "GA",
    "Carolina Panthers": "NC",
    "New Orleans Saints": "LA",
    "Tampa Bay Buccaneers": "FL",
    # NFC West
    "Arizona Cardinals": "AZ",
    "Los Angeles Rams": "CA",       # relocated from St. Louis, MO (2016)
    "San Francisco 49ers": "CA",
    "Seattle Seahawks": "WA",
}

# The industrial-era teams whose Sun Belt diaspora is the Problem-six beat.
RUST_BELT_TEAMS: list[str] = [
    "Pittsburgh Steelers", "Cleveland Browns", "Detroit Lions",
    "Chicago Bears", "Buffalo Bills", "Cincinnati Bengals",
    "Green Bay Packers", "Minnesota Vikings",
]

# Sun Belt destination metros -> the county FIPS (regions `id`) of their core
# county. Exact-id joins replace the spec's fragile county-name substring match.
SUN_BELT_METRO_FIPS: dict[str, str] = {
    "Charlotte": "37119",     # Mecklenburg County, NC
    "Raleigh": "37183",       # Wake County, NC
    "Tampa": "12057",         # Hillsborough County, FL
    "Orlando": "12095",       # Orange County, FL
    "Phoenix": "04013",       # Maricopa County, AZ
    "Austin": "48453",        # Travis County, TX
    "Nashville": "47037",     # Davidson County, TN
    "Atlanta": "13121",       # Fulton County, GA
    "Dallas": "48113",        # Dallas County, TX
    "Houston": "48201",       # Harris County, TX
    "Las Vegas": "32003",     # Clark County, NV
    "San Antonio": "48029",   # Bexar County, TX
    "Jacksonville": "12031",  # Duval County, FL
    "Miami": "12086",         # Miami-Dade County, FL
}

# State FIPS (2-digit) -> USPS abbreviation (50 states + DC).
FIPS_TO_STATE: dict[str, str] = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY",
}
STATE_TO_FIPS: dict[str, str] = {v: k for k, v in FIPS_TO_STATE.items()}
