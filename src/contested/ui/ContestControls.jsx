import { BASEMAPS, PROJECT_NAME, SURVEY_URL } from "../../config.js";
import { RES_LABELS } from "../contest.js";
import SegmentedToggle from "./SegmentedToggle.jsx";
import useInitialOpen from "./useInitialOpen.js";

const RESOLUTIONS = [3, 4, 5];
const MIN_OPTIONS = [25, 50, 100];

export default function ContestControls({
  resolution, onResolution, minN, onMinN, basemap, onBasemap, meta, scored, kept,
}) {
  const [open, setOpen] = useInitialOpen();

  return (
    <div className="pointer-events-none absolute top-4 left-4 z-10 w-[min(20rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto overflow-hidden rounded-lg bg-white/95 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="text-sm font-semibold">{PROJECT_NAME} · Contested ground</span>
          <span className="text-xs text-gray-400">{open ? "▲" : "▼"}</span>
        </button>

        {open ? (
          <div className="flex flex-col gap-3 px-3 pb-3">
            <p className="text-xs leading-snug text-gray-600">
              US responses binned into H3 hexagons and scored by how evenly they split across
              the {meta.teams} teams. Bright means nobody owns it.
            </p>

            <SegmentedToggle
              label="Hexagon size"
              value={resolution}
              onChange={onResolution}
              options={RESOLUTIONS.map((r) => ({
                value: r,
                label: RES_LABELS[r].label,
                title: RES_LABELS[r].blurb,
              }))}
            />
            <div className="-mt-1.5 text-[11px] text-gray-400">{RES_LABELS[resolution].blurb}</div>

            <SegmentedToggle
              label="Minimum responses"
              value={minN}
              onChange={onMinN}
              options={MIN_OPTIONS.map((n) => ({
                value: n,
                label: String(n),
                title: `Score only hexagons with at least ${n} responses`,
              }))}
            />
            <div className="-mt-1.5 text-[11px] text-gray-400">
              {scored} of {kept} hexagons clear it. A thin hexagon looks lopsided by luck alone,
              so raising the floor is the honest way to read the extremes.
            </div>

            <SegmentedToggle
              label="Basemap"
              value={basemap}
              onChange={onBasemap}
              options={Object.entries(BASEMAPS).map(([k, v]) => ({ value: k, label: v.label }))}
            />

            <div className="border-t border-gray-100 pt-2 text-[11px] leading-snug text-gray-400">
              {meta.placed.toLocaleString()} of {meta.us_rows.toLocaleString()} US responses placed
              at their ZIP centroid. US only — elsewhere the survey resolves no finer than a
              province.
              {SURVEY_URL && SURVEY_URL !== "#" ? (
                <>
                  {" "}
                  <a className="text-blue-600 hover:underline" href={SURVEY_URL} target="_blank" rel="noreferrer">
                    Add your team →
                  </a>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
