import { BASEMAPS, SURVEY_URL } from "../../config.js";
import TeamDropdown from "../../components/TeamDropdown.jsx";
import { RUST_BELT_TEAMS } from "../constants.js";
import { MIN_N } from "../margin.js";
import SegmentedToggle from "./SegmentedToggle.jsx";
import useInitialOpen from "./useInitialOpen.js";

export default function RustBeltControls({
  categories, sunTotals, rates, measure, onMeasure,
  unit, onUnit, showLowN, onShowLowN, basemap, onBasemap,
  accentColor, countiesReady,
}) {
  const [open, setOpen] = useInitialOpen();
  const blocTeams = categories.filter((c) => RUST_BELT_TEAMS.includes(c.short_name));

  return (
    <div
      className="pointer-events-auto rounded-lg bg-white/95 shadow-lg backdrop-blur overflow-hidden"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-sm font-semibold">Rust Belt in the Sun Belt</span>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-3 px-3 pb-3">
          <SegmentedToggle
            label="Unit"
            value={unit}
            onChange={onUnit}
            options={[
              { value: "states", label: "States" },
              {
                value: "counties", label: "Counties", disabled: !countiesReady,
                title: countiesReady ? undefined : "Loading county boundaries…",
              },
            ]}
          />

          <TeamDropdown
            teams={blocTeams}
            /* Rank by SUN BELT presence, not national — this app's question. */
            totals={sunTotals}
            selected={measure}
            onSelect={onMeasure}
            label="Measure"
            placeholder="All Rust Belt (9 teams)"
            renderMeta={(t) => {
              const r = rates?.[t.short_name];
              if (!r) return null;
              return (
                <span
                  className="tabular-nums text-[11px] text-gray-400"
                  title={`${r.sun} of ${r.national} ${t.short_name} fans nationally live in the Sun Belt`}
                >
                  {Math.round(r.rate * 100)}% out
                </span>
              );
            }}
          />

          {unit === "counties" ? (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={showLowN}
                     onChange={(e) => onShowLowN(e.target.checked)} />
              Show low-sample counties (n &lt; {MIN_N})
            </label>
          ) : null}

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
  );
}
