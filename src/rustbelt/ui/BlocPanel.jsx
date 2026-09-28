import { useState } from "react";
import { NO_HOME_COLOR, colorAt, formatMargin, tDiv } from "../margin.js";
import { RUST_BELT_TEAMS, teamNick } from "../constants.js";
import SegmentedToggle from "./SegmentedToggle.jsx";
import useInitialOpen from "./useInitialOpen.js";

const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * The "individually AND as one team" half of the app: the map shows margin, this
 * shows the counts behind it — per team and per state, one click apart.
 */
export default function BlocPanel({
  belt, blocShare, rates, measure, onMeasure, colorOf, selectedFips, onSelectState,
}) {
  const [open, setOpen] = useInitialOpen();
  const [tab, setTab] = useState("teams");
  const [sortBy, setSortBy] = useState("count");
  if (!belt) return null;

  const { rollup, byFips } = belt;
  const label = measure || "Rust Belt";

  return (
    <div className="pointer-events-auto rounded-lg bg-white/95 shadow-lg backdrop-blur overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          The bloc
        </span>
        <span className="text-gray-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="px-3 pb-3">
          <p className="text-xs leading-snug text-gray-700">
            <b className="tabular-nums">{rollup.rb.toLocaleString()}</b> {label} vs{" "}
            <b className="tabular-nums">{rollup.home.toLocaleString()}</b> home-team responses
            across 16 Sun Belt states — leads in{" "}
            <b className="tabular-nums">{rollup.leads} of {rollup.states}</b>.
          </p>

          <div className="mt-2">
            {/* "By team"/"By state" rather than "Teams"/"States" — the Unit
                toggle directly above already owns the word "States". */}
            <SegmentedToggle
              label="Break down"
              value={tab}
              onChange={setTab}
              options={[
                { value: "teams", label: "By team" },
                { value: "states", label: "By state" },
              ]}
            />
          </div>

          {tab === "teams" ? (
            <TeamList
              rates={rates} sunByTeam={rollup.sunByTeam} measure={measure}
              onMeasure={onMeasure} colorOf={colorOf} sortBy={sortBy} setSortBy={setSortBy}
            />
          ) : (
            <StateList
              byFips={byFips} selectedFips={selectedFips} onSelectState={onSelectState}
            />
          )}

          {/* Always describes all 9, never the selected measure. */}
          <p className="mt-2 border-t border-gray-100 pt-1.5 text-[10px] leading-snug text-gray-400">
            All nine Rust Belt teams together take {pct(blocShare ?? rollup.share)} of every
            response across these states, and 25–41% in fifteen of the sixteen. Louisiana is
            the lone exception at 15% — the Saints hold their state like no other home team.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TeamList({ rates, sunByTeam, measure, onMeasure, colorOf, sortBy, setSortBy }) {
  const rows = RUST_BELT_TEAMS.map((t) => ({
    team: t, sun: sunByTeam[t] || 0, rate: rates?.[t]?.rate || 0,
  })).sort((a, b) => (sortBy === "rate" ? b.rate - a.rate : b.sun - a.sun));
  const max = Math.max(1, ...rows.map((r) => r.sun));

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMeasure(null)}
          className={
            "rounded px-1.5 py-0.5 text-[11px] font-medium " +
            (measure ? "text-gray-500 hover:bg-gray-100" : "bg-gray-900 text-white")
          }
        >
          All 9 combined
        </button>
        <button
          type="button"
          onClick={() => setSortBy(sortBy === "count" ? "rate" : "count")}
          className="text-[10px] text-gray-400 hover:text-gray-600"
          title="Export rate = share of that team's national fans living in the Sun Belt"
        >
          sort: {sortBy === "count" ? "Sun Belt count" : "export rate"} ⇅
        </button>
      </div>

      <div className="space-y-0.5">
        {rows.map((r) => {
          const active = measure === r.team;
          return (
            <button
              key={r.team}
              type="button"
              onClick={() => onMeasure(active ? null : r.team)}
              className={
                "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left " +
                (active ? "bg-gray-100" : "hover:bg-gray-50")
              }
            >
              <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: colorOf?.(r.team) || "#9ca3af" }} />
              <span className="w-28 shrink-0 truncate text-[11px]">{teamNick(r.team)}</span>
              <span className="relative h-2 flex-1 rounded bg-gray-100">
                <span className="absolute inset-y-0 left-0 rounded"
                      style={{ width: `${(r.sun / max) * 100}%`,
                               background: colorOf?.(r.team) || "#9ca3af" }} />
              </span>
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums">{r.sun}</span>
              <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-gray-400">
                {pct(r.rate)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StateList({ byFips, selectedFips, onSelectState }) {
  const all = [...byFips.values()];
  const scored = all.filter((s) => !s.noHome).sort((a, b) => b.margin - a.margin);
  const noHome = all.filter((s) => s.noHome).sort((a, b) => b.rb - a.rb);

  const Row = (s) => (
    <button
      key={s.fips}
      type="button"
      onClick={() => onSelectState(s.fips)}
      className={
        "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left " +
        (selectedFips === s.fips ? "bg-gray-100" : "hover:bg-gray-50")
      }
    >
      <span className="w-6 shrink-0 text-[11px] font-medium">{s.usps}</span>
      {s.noHome ? (
        <span className="h-2 flex-1 rounded" style={{ background: NO_HOME_COLOR }} />
      ) : (
        // Centred diverging bar: grows left or right from a midline.
        <span className="relative h-2 flex-1 rounded bg-gray-100">
          <span className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
          <span
            className="absolute inset-y-0 rounded"
            style={{
              background: colorAt(s.margin),
              left: s.margin >= 0 ? "50%" : `${tDiv(s.margin) * 100}%`,
              width: `${Math.abs(tDiv(s.margin) - 0.5) * 100}%`,
            }}
          />
        </span>
      )}
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums">
        {s.noHome ? "—" : formatMargin(s.margin)}
      </span>
      <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-gray-400">
        {s.rb}/{s.home}
      </span>
    </button>
  );

  return (
    <div className="mt-2 space-y-0.5">
      {scored.map(Row)}
      {noHome.length ? (
        <>
          <div className="pt-1.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            No home team
          </div>
          {noHome.map(Row)}
        </>
      ) : null}
    </div>
  );
}
