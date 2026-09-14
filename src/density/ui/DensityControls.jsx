import { BASEMAPS, PROJECT_NAME, SURVEY_URL } from "../../config.js";
import TeamDropdown from "../../components/TeamDropdown.jsx";
import SegmentedToggle from "./SegmentedToggle.jsx";
import useInitialOpen from "./useInitialOpen.js";

export default function DensityControls({
  categories, totals, measure, onMeasure,
  view, onView, scope, onScope,
  perArea, onPerArea, confidence, onConfidence,
  showNS, onShowNS, basemap, onBasemap,
  accentColor, polygonsReady, statFor,
}) {
  const [open, setOpen] = useInitialOpen();
  const isMoran = view === "moran";
  const isWorld = scope === "world";

  // Each row carries its global Moran's I — a quick read on how geographically
  // concentrated that fanbase is, which is often the reason you're picking it.
  const renderMeta = (t) => {
    const s = statFor?.(t.short_name);
    if (!s) return null;
    const hot = s.counts?.HH ?? 0;
    return (
      <span
        className="tabular-nums text-[11px] text-gray-400"
        title={`Global Moran's I ${s.moran_i.toFixed(3)} · ${hot} hotspot counties`}
      >
        I {s.moran_i.toFixed(2)}
      </span>
    );
  };

  return (
    <div className="pointer-events-none absolute top-4 left-4 z-10 w-[min(20rem,calc(100vw-2rem))]">
      <div
        className="pointer-events-auto rounded-lg bg-white/95 shadow-lg backdrop-blur overflow-hidden"
        style={accentColor ? { borderTop: `3px solid ${accentColor}` } : undefined}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="text-sm font-semibold">{PROJECT_NAME} · Density</span>
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </button>

        {open ? (
          <div className="flex flex-col gap-3 px-3 pb-3">
            <SegmentedToggle
              label="View"
              value={view}
              onChange={onView}
              options={[
                { value: "choropleth", label: "Choropleth", disabled: !polygonsReady,
                  title: polygonsReady ? undefined : "Loading boundaries…" },
                { value: "circles", label: "Circles" },
                { value: "moran", label: "Moran's I",
                  disabled: isWorld || !polygonsReady,
                  title: isWorld
                    ? "Moran's I is computed on US counties only"
                    : polygonsReady ? undefined : "Loading boundaries…" },
              ]}
            />

            <TeamDropdown
              teams={categories}
              totals={totals}
              selected={measure}
              onSelect={onMeasure}
              label="Measure"
              placeholder="All responses"
              renderMeta={renderMeta}
            />

            <SegmentedToggle
              label="Scope"
              value={scope}
              onChange={onScope}
              options={[
                { value: "us", label: "United States" },
                { value: "world", label: "Worldwide", disabled: isMoran,
                  title: isMoran ? "Switch out of Moran's I to change scope" : undefined },
              ]}
            />

            {isMoran ? (
              <>
                <SegmentedToggle
                  label="Confidence"
                  value={confidence}
                  onChange={onConfidence}
                  options={[
                    { value: "standard", label: "p < 0.05" },
                    { value: "fdr", label: "FDR" },
                  ]}
                />
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={showNS}
                         onChange={(e) => onShowNS(e.target.checked)} />
                  Show non-significant counties
                </label>
              </>
            ) : (
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={perArea}
                       onChange={(e) => onPerArea(e.target.checked)} />
                Per 1,000 km² (area-normalised)
              </label>
            )}

            <SegmentedToggle
              label="Basemap"
              value={basemap}
              onChange={onBasemap}
              options={Object.entries(BASEMAPS).map(([k, v]) => ({ value: k, label: v.label }))}
            />

            {SURVEY_URL && SURVEY_URL !== "#" ? (
              <a href={SURVEY_URL} target="_blank" rel="noreferrer"
                 className="text-xs text-blue-600 hover:underline">
                Add your response →
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
