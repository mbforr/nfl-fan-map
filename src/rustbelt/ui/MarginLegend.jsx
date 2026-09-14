import { DIVERGING, LOW_N_COLOR, MIN_N, NO_HOME_COLOR, divergingTicks, formatMargin, tDiv }
  from "../margin.js";
import useInitialOpen from "./useInitialOpen.js";

export default function MarginLegend({ unit, measureLabel, showLowN }) {
  const [open, setOpen] = useInitialOpen();
  const ticks = divergingTicks();

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 w-[min(19rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-lg bg-white/95 shadow-lg backdrop-blur overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Head-to-head
          </span>
          <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
        </button>

        {open ? (
          <div className="px-3 pb-3">
            <div className="mb-1.5 text-xs font-medium">
              {measureLabel} <span className="text-gray-400">vs home teams</span>
            </div>

            {/* Stops are evenly spaced in normalized space, so this CSS gradient
                matches the map's sRGB `interpolate` exactly. */}
            <div
              className="h-3 w-full rounded"
              style={{ background: `linear-gradient(to right, ${DIVERGING.join(", ")})` }}
            />
            <div className="relative h-4 mt-0.5">
              {ticks.map((m) => (
                <span
                  key={m}
                  className="absolute text-[10px] tabular-nums text-gray-500 -translate-x-1/2"
                  style={{ left: `${Math.min(97, Math.max(3, tDiv(m) * 100))}%` }}
                >
                  {formatMargin(m)}
                </span>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>Home teams lead</span>
              <span>Rust Belt leads</span>
            </div>

            <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm shrink-0"
                  style={{
                    backgroundImage:
                      `repeating-linear-gradient(45deg, ${NO_HOME_COLOR} 0 2px, #faf6f1 2px 4px)`,
                  }}
                />
                <span className="text-[11px] text-gray-600">
                  No NFL home team — no contest to score
                </span>
              </div>
              {unit === "counties" ? (
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm shrink-0"
                        style={{ background: LOW_N_COLOR }} />
                  <span className="text-[11px] text-gray-600">
                    Fewer than {MIN_N} head-to-head responses
                    {showLowN ? " (shown in colour)" : ""}
                  </span>
                </div>
              ) : null}
            </div>

            <p className="mt-2 text-[10px] leading-snug text-gray-400">
              Spacing is square-root, so small margins are expanded. ±100 = a shutout.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
