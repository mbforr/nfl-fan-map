#!/usr/bin/env python3
"""Emit public/data/category_a.json — 32 NFL teams + primary color + stadium POI.

Colors are the team's canonical primary brand color (NFL.com / Wikipedia).
Stadium coordinates are the team's primary home venue.
short_name matches the verbatim string used in the survey response column.
"""
import json
import os
import sys

# Survey responses use the full official team name verbatim, e.g.
# "Tampa Bay Buccaneers". Keep short_name aligned with that string so the
# preprocess join works without a normalization table.
TEAMS = [
    # AFC East
    {"short_name": "Buffalo Bills",          "name": "Buffalo Bills",          "group": "AFC East",  "primary_color": "#00338D", "secondary_color": "#C60C30",
     "poi": {"name": "Highmark Stadium",        "lat": 42.7738, "lng": -78.7868}},
    {"short_name": "Miami Dolphins",         "name": "Miami Dolphins",         "group": "AFC East",  "primary_color": "#008E97", "secondary_color": "#FC4C02",
     "poi": {"name": "Hard Rock Stadium",       "lat": 25.9580, "lng": -80.2389}},
    {"short_name": "New England Patriots",   "name": "New England Patriots",   "group": "AFC East",  "primary_color": "#002244", "secondary_color": "#C60C30",
     "poi": {"name": "Gillette Stadium",        "lat": 42.0909, "lng": -71.2643}},
    {"short_name": "New York Jets",          "name": "New York Jets",          "group": "AFC East",  "primary_color": "#125740", "secondary_color": "#000000",
     "poi": {"name": "MetLife Stadium",         "lat": 40.8136, "lng": -74.0744}},
    # AFC North
    {"short_name": "Baltimore Ravens",       "name": "Baltimore Ravens",       "group": "AFC North", "primary_color": "#241773", "secondary_color": "#9E7C0C",
     "poi": {"name": "M&T Bank Stadium",        "lat": 39.2780, "lng": -76.6227}},
    {"short_name": "Cincinnati Bengals",     "name": "Cincinnati Bengals",     "group": "AFC North", "primary_color": "#FB4F14", "secondary_color": "#000000",
     "poi": {"name": "Paycor Stadium",          "lat": 39.0954, "lng": -84.5160}},
    {"short_name": "Cleveland Browns",       "name": "Cleveland Browns",       "group": "AFC North", "primary_color": "#311D00", "secondary_color": "#FF3C00",
     "poi": {"name": "Cleveland Browns Stadium","lat": 41.5061, "lng": -81.6995}},
    {"short_name": "Pittsburgh Steelers",    "name": "Pittsburgh Steelers",    "group": "AFC North", "primary_color": "#FFB612", "secondary_color": "#101820",
     "poi": {"name": "Acrisure Stadium",        "lat": 40.4468, "lng": -80.0158}},
    # AFC South
    {"short_name": "Houston Texans",         "name": "Houston Texans",         "group": "AFC South", "primary_color": "#03202F", "secondary_color": "#A71930",
     "poi": {"name": "NRG Stadium",             "lat": 29.6847, "lng": -95.4107}},
    {"short_name": "Indianapolis Colts",     "name": "Indianapolis Colts",     "group": "AFC South", "primary_color": "#002C5F", "secondary_color": "#A2AAAD",
     "poi": {"name": "Lucas Oil Stadium",       "lat": 39.7601, "lng": -86.1639}},
    {"short_name": "Jacksonville Jaguars",   "name": "Jacksonville Jaguars",   "group": "AFC South", "primary_color": "#101820", "secondary_color": "#D7A22A",
     "poi": {"name": "EverBank Stadium",        "lat": 30.3239, "lng": -81.6373}},
    {"short_name": "Tennessee Titans",       "name": "Tennessee Titans",       "group": "AFC South", "primary_color": "#0C2340", "secondary_color": "#4B92DB",
     "poi": {"name": "Nissan Stadium",          "lat": 36.1665, "lng": -86.7713}},
    # AFC West
    {"short_name": "Denver Broncos",         "name": "Denver Broncos",         "group": "AFC West",  "primary_color": "#FB4F14", "secondary_color": "#002244",
     "poi": {"name": "Empower Field at Mile High","lat": 39.7439,"lng": -105.0201}},
    {"short_name": "Kansas City Chiefs",     "name": "Kansas City Chiefs",     "group": "AFC West",  "primary_color": "#E31837", "secondary_color": "#FFB81C",
     "poi": {"name": "GEHA Field at Arrowhead", "lat": 39.0489, "lng": -94.4839}},
    {"short_name": "Las Vegas Raiders",      "name": "Las Vegas Raiders",      "group": "AFC West",  "primary_color": "#000000", "secondary_color": "#A5ACAF",
     "poi": {"name": "Allegiant Stadium",       "lat": 36.0909, "lng": -115.1830}},
    {"short_name": "Los Angeles Chargers",   "name": "Los Angeles Chargers",   "group": "AFC West",  "primary_color": "#0080C6", "secondary_color": "#FFC20E",
     "poi": {"name": "SoFi Stadium",            "lat": 33.9534, "lng": -118.3387}},
    # NFC East
    {"short_name": "Dallas Cowboys",         "name": "Dallas Cowboys",         "group": "NFC East",  "primary_color": "#003594", "secondary_color": "#869397",
     "poi": {"name": "AT&T Stadium",            "lat": 32.7473, "lng": -97.0945}},
    {"short_name": "New York Giants",        "name": "New York Giants",        "group": "NFC East",  "primary_color": "#0B2265", "secondary_color": "#A71930",
     "poi": {"name": "MetLife Stadium",         "lat": 40.8136, "lng": -74.0744}},
    {"short_name": "Philadelphia Eagles",    "name": "Philadelphia Eagles",    "group": "NFC East",  "primary_color": "#004C54", "secondary_color": "#A5ACAF",
     "poi": {"name": "Lincoln Financial Field", "lat": 39.9008, "lng": -75.1675}},
    {"short_name": "Washington Commanders",  "name": "Washington Commanders",  "group": "NFC East",  "primary_color": "#5A1414", "secondary_color": "#FFB612",
     "poi": {"name": "Northwest Stadium",       "lat": 38.9077, "lng": -76.8645}},
    # NFC North
    {"short_name": "Chicago Bears",          "name": "Chicago Bears",          "group": "NFC North", "primary_color": "#0B162A", "secondary_color": "#C83803",
     "poi": {"name": "Soldier Field",           "lat": 41.8623, "lng": -87.6167}},
    {"short_name": "Detroit Lions",          "name": "Detroit Lions",          "group": "NFC North", "primary_color": "#0076B6", "secondary_color": "#B0B7BC",
     "poi": {"name": "Ford Field",              "lat": 42.3400, "lng": -83.0456}},
    {"short_name": "Green Bay Packers",      "name": "Green Bay Packers",      "group": "NFC North", "primary_color": "#203731", "secondary_color": "#FFB612",
     "poi": {"name": "Lambeau Field",           "lat": 44.5013, "lng": -88.0622}},
    {"short_name": "Minnesota Vikings",      "name": "Minnesota Vikings",      "group": "NFC North", "primary_color": "#4F2683", "secondary_color": "#FFC62F",
     "poi": {"name": "U.S. Bank Stadium",       "lat": 44.9737, "lng": -93.2576}},
    # NFC South
    {"short_name": "Atlanta Falcons",        "name": "Atlanta Falcons",        "group": "NFC South", "primary_color": "#A71930", "secondary_color": "#000000",
     "poi": {"name": "Mercedes-Benz Stadium",   "lat": 33.7553, "lng": -84.4006}},
    {"short_name": "Carolina Panthers",      "name": "Carolina Panthers",      "group": "NFC South", "primary_color": "#0085CA", "secondary_color": "#101820",
     "poi": {"name": "Bank of America Stadium", "lat": 35.2258, "lng": -80.8528}},
    {"short_name": "New Orleans Saints",     "name": "New Orleans Saints",     "group": "NFC South", "primary_color": "#D3BC8D", "secondary_color": "#101820",
     "poi": {"name": "Caesars Superdome",       "lat": 29.9509, "lng": -90.0815}},
    {"short_name": "Tampa Bay Buccaneers",   "name": "Tampa Bay Buccaneers",   "group": "NFC South", "primary_color": "#D50A0A", "secondary_color": "#34302B",
     "poi": {"name": "Raymond James Stadium",   "lat": 27.9759, "lng": -82.5033}},
    # NFC West
    {"short_name": "Arizona Cardinals",      "name": "Arizona Cardinals",      "group": "NFC West",  "primary_color": "#97233F", "secondary_color": "#000000",
     "poi": {"name": "State Farm Stadium",      "lat": 33.5276, "lng": -112.2626}},
    {"short_name": "Los Angeles Rams",       "name": "Los Angeles Rams",       "group": "NFC West",  "primary_color": "#003594", "secondary_color": "#FFA300",
     "poi": {"name": "SoFi Stadium",            "lat": 33.9534, "lng": -118.3387}},
    {"short_name": "San Francisco 49ers",    "name": "San Francisco 49ers",    "group": "NFC West",  "primary_color": "#AA0000", "secondary_color": "#B3995D",
     "poi": {"name": "Levi's Stadium",          "lat": 37.4030, "lng": -121.9700}},
    {"short_name": "Seattle Seahawks",       "name": "Seattle Seahawks",       "group": "NFC West",  "primary_color": "#002244", "secondary_color": "#69BE28",
     "poi": {"name": "Lumen Field",             "lat": 47.5952, "lng": -122.3316}},
]


def main() -> None:
    out = os.path.join(os.path.dirname(__file__), "..", "public", "data", "category_a.json")
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as fp:
        json.dump(TEAMS, fp, indent=2)
    sys.stderr.write(f"Wrote {len(TEAMS)} teams → {out}\n")


if __name__ == "__main__":
    main()
