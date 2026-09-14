import { LISA_BLURBS, LISA_COLORS, LISA_LABELS, LISA_ORDER } from "../lisa.js";
import { formatValue, niceTicks, tPos } from "../scale.js";
import useInitialOpen from "./useInitialOpen.js";

export default function ScaleLegend({
  view, measure, measureLabel, scale, ramp, perArea, scope, lisaGroups, showNS,
}) {
  const [open, setOpen] = useInitialOpen();
  const isMoran = view === "moran";

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 w-[min(18rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-lg bg-white/95 shadow-lg backdrop-blur overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            {isMoran ? "Cluster type" : "Legend"}
          </span>
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </button>

        {open ? (
          <div className="px-3 pb-3">
            {isMoran ? (
              <LisaKey groups={lisaGroups} showNS={showNS} />
            ) : (
              <RampKey
                measureLabel={measureLabel}
                scale={scale}
                ramp={ramp}
                perArea={perArea}
                scope={scope}
                view={view}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LisaKey({ groups, showNS }) {
  const rows = LISA_ORDER.filter((k) => groups.counts[k] > 0);
  return (
    <div className="space-y-1.5">
      {rows.length === 0 ? (
        <div className="text-xs text-gray-500">No significant clusters at this threshold.</div>
      ) : rows.map((k) => (
        <div key={k} className="flex items-start gap-2">
          <span className="mt-0.5 inline-block h-3 w-3 rounded-sm shrink-0"
                style={{ background: LISA_COLORS[k] }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium">{LISA_LABELS[k]}</span>
              <span className="text-xs tabular-nums text-gray-500">{groups.counts[k]}</span>
            </div>
            <div className="text-[10px] leading-tight text-gray-500">{LISA_BLURBS[k]}</div>
          </div>
        </div>
      ))}
      {showNS ? (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: LISA_COLORS.NS }} />
          <span className="text-xs text-gray-500">Not significant</span>
        </div>
      ) : null}
      <p className="pt-1 text-[10px] leading-snug text-gray-400 border-t border-gray-100 mt-1">
        Local Moran&rsquo;s I on each county&rsquo;s share of local responses.
      </p>
    </div>
  );
}

function RampKey({ measureLabel, scale, ramp, perArea, scope, view }) {
  if (!scale || scale.empty) {
    return <div className="text-xs text-gray-500">No responses in this scope.</div>;
  }
  const ticks = niceTicks(scale.vHi, perArea);
  const gradient = `linear-gradient(to right, ${ramp.join(", ")})`;
  const unit = perArea ? " per 1,000 km²" : "";

  return (
    <div>
      <div className="text-xs font-medium mb-1.5">{measureLabel}{unit}</div>

      {/* Stops are evenly spaced in normalized space, so a plain CSS gradient
          matches the map exactly (the paint uses sRGB `interpolate`). */}
      <div className="h-3 w-full rounded" style={{ background: gradient }} />
      <div className="relative h-4 mt-0.5">
        {ticks.map((v, i) => {
          const left = tPos(v, scale.vHi) * 100;
          const last = i === ticks.length - 1;
          return (
            <span key={v}
                  className="absolute text-[10px] tabular-nums text-gray-500 -translate-x-1/2"
                  style={{ left: `${Math.min(97, Math.max(3, left))}%` }}>
              {last ? "≥" : ""}{formatValue(v, perArea)}
            </span>
          );
        })}
      </div>

      {view === "circles" ? (
        <div className="mt-2 flex items-end gap-3">
          {[scale.vHi / 16, scale.vHi / 4, scale.vHi].map((v, i) => {
            const r = Math.max(3, Math.min(22, (22 / Math.sqrt(scale.vHi)) * Math.sqrt(v)));
            return (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className="rounded-full border border-white"
                      style={{ width: r * 2, height: r * 2, background: ramp[ramp.length - 2] }} />
                <span className="text-[10px] tabular-nums text-gray-500">
                  {formatValue(v, perArea)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="mt-2 pt-1.5 border-t border-gray-100 text-[10px] leading-snug text-gray-400">
        {scale.n.toLocaleString()} regions with data · median {formatValue(scale.median, perArea)} ·
        max {formatValue(scale.trueMax, perArea)}
        {scale.trueMaxRegion ? ` (${scale.trueMaxRegion})` : ""}.
        Regions with no responses are unshaded.
        {scope === "world" ? " Mixed administrative levels — compare with care." : ""}
      </p>
    </div>
  );
}
