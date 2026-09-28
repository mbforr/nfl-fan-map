import { LOW_N_COLOR } from "../contestedMap.js";
import { RAMP, effectiveOf, one } from "../contest.js";

export default function ContestLegend({ domain, teams, minN, lowN }) {
  if (domain.empty) return null;
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 w-[min(18rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-lg bg-white/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur">
        <div className="font-semibold text-gray-700">How split is the fanbase?</div>
        <div
          className="mt-1.5 h-2.5 w-full rounded-sm"
          style={{ background: `linear-gradient(to right, ${RAMP.join(", ")})` }}
        />
        <div className="mt-1 flex justify-between text-[11px] text-gray-600">
          <span className="tabular-nums">{one(effectiveOf(domain.lo, teams))} teams</span>
          <span className="tabular-nums">{one(effectiveOf(domain.hi, teams))} teams</span>
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-wide text-gray-400">
          <span>one team owns it</span>
          <span>wide open</span>
        </div>

        <div className="mt-2 border-t border-gray-100 pt-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ background: LOW_N_COLOR }}
            />
            <span className="text-[11px] text-gray-600">
              Under {minN} responses — not scored ({lowN} hexagons)
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
            Effective teams is <span className="italic">e</span><sup>H</sup> over the team mix, so
            a hexagon split evenly five ways scores 5 no matter how the other {teams - 5} place.
          </p>
        </div>
      </div>
    </div>
  );
}
