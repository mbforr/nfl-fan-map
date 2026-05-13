import { useEffect, useState } from "react";
import SegmentedToggle from "./SegmentedToggle.jsx";
import TeamDropdown from "./TeamDropdown.jsx";
import Faceoff from "./Faceoff.jsx";
import { BASEMAPS, GROUP, PROJECT_NAME, SURVEY_URL } from "../config.js";

function useInitialOpen() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = (e) => setOpen(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return [open, setOpen];
}

export default function Controls({
  categories,
  totals,
  centroids,
  selectedTeam,
  onSelectTeam,
  viewMode,
  onViewMode,
  basemap,
  onBasemap,
  accentColor,
  faceoffActive,
  faceoffA,
  faceoffB,
  onFaceoffActivate,
  onFaceoffExit,
  onFaceoffA,
  onFaceoffB,
}) {
  const [open, setOpen] = useInitialOpen();
  const accentStyle = accentColor
    ? { borderTopColor: accentColor, borderTopWidth: "3px" }
    : {};

  return (
    <div className="pointer-events-none absolute top-4 left-4 z-10 w-[min(20rem,calc(100vw-2rem))]">
      <div
        className="pointer-events-auto rounded-lg bg-white/95 shadow-lg backdrop-blur"
        style={accentStyle}
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-4 py-3"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-sm font-semibold text-gray-900">{PROJECT_NAME}</span>
          <span className="text-gray-500">{open ? "▴" : "▾"}</span>
        </button>
        {open && (
          <div className="flex flex-col gap-3 px-4 pb-4">
            <SegmentedToggle
              label="View"
              value={viewMode}
              options={[
                { value: "polygons", label: "Polygons" },
                { value: "centroids", label: "Centroids" },
                { value: "pois", label: "Stadiums" },
              ]}
              onChange={onViewMode}
            />
            {faceoffActive ? (
              <Faceoff
                categories={categories}
                totals={totals}
                centroids={centroids}
                group={GROUP}
                a={faceoffA}
                b={faceoffB}
                onChangeA={onFaceoffA}
                onChangeB={onFaceoffB}
                onExit={onFaceoffExit}
              />
            ) : (
              <>
                <TeamDropdown
                  teams={categories}
                  totals={totals}
                  selected={selectedTeam}
                  onSelect={onSelectTeam}
                  label="Team"
                  placeholder="All teams (choropleth)"
                />
                <button
                  type="button"
                  onClick={onFaceoffActivate}
                  className="self-start text-xs font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
                >
                  Start a face-off →
                </button>
              </>
            )}
            <SegmentedToggle
              label="Basemap"
              value={basemap}
              options={Object.entries(BASEMAPS).map(([k, v]) => ({ value: k, label: v.label }))}
              onChange={onBasemap}
            />
            <a
              href={SURVEY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 hover:border-gray-300 hover:bg-white"
            >
              Add your response
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
