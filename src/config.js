export const PROJECT_NAME = "NFL Fan Map";
export const POI_LABEL = "Stadiums";
export const POI_SINGULAR = "Stadium";
export const SURVEY_URL = import.meta.env.VITE_SURVEY_URL || "#";

// Single-axis survey: group is always "a".
export const GROUP = "a";

export const CENTROID_RADIUS_SCALE = 2.5;
export const CENTROID_RADIUS_MIN = 3;
export const CENTROID_RADIUS_MAX = 22;
export const NO_DATA_COLOR = "#CCCCCC";
export const CONTESTED_COLOR = "#808080";
export const TIE_COLOR = "#6b7280";

export const BASEMAPS = {
  standard: { label: "Standard", style: "mapbox://styles/mapbox/standard" },
  light: { label: "Light", style: "mapbox://styles/mapbox/light-v11" },
};
export const DEFAULT_BASEMAP = "standard";

export const INITIAL_VIEW = {
  center: [-96.5, 39.0],
  zoom: 3.6,
  minZoom: 1.5,
  maxZoom: 17,
};
