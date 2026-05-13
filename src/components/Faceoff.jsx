import { useMemo } from "react";
import TeamDropdown from "./TeamDropdown.jsx";

function compute(centroids, group, a, b) {
  const out = { aWins: 0, bWins: 0, tied: 0, aExclusive: 0, bExclusive: 0, overlap: 0, aTotal: 0, bTotal: 0 };
  if (!centroids || !a || !b) return out;
  const key = `${group}_counts`;
  for (const f of centroids.features) {
    const c = f.properties[key];
    if (!c) continue;
    const ac = c[a] || 0;
    const bc = c[b] || 0;
    if (ac === 0 && bc === 0) continue;
    out.aTotal += ac;
    out.bTotal += bc;
    if (ac > 0 && bc === 0) out.aExclusive += 1;
    if (bc > 0 && ac === 0) out.bExclusive += 1;
    if (ac > 0 && bc > 0) out.overlap += 1;
    if (ac > bc) out.aWins += 1;
    else if (bc > ac) out.bWins += 1;
    else out.tied += 1;
  }
  return out;
}

export default function Faceoff({
  categories,
  totals,
  centroids,
  group,
  a,
  b,
  onChangeA,
  onChangeB,
  onExit,
}) {
  const score = useMemo(() => compute(centroids, group, a, b), [centroids, group, a, b]);
  const both = a && b;
  const aMeta = categories.find((c) => c.short_name === a) || null;
  const bMeta = categories.find((c) => c.short_name === b) || null;

  const teamsForA = a || b ? categories.filter((c) => c.short_name !== b) : categories;
  const teamsForB = a || b ? categories.filter((c) => c.short_name !== a) : categories;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Face-off</span>
        <button
          type="button"
          onClick={onExit}
          className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2"
        >
          Exit
        </button>
      </div>

      <TeamDropdown
        teams={teamsForA}
        totals={totals}
        selected={a}
        onSelect={onChangeA}
        label="Team A"
        placeholder="Pick team A…"
      />
      <TeamDropdown
        teams={teamsForB}
        totals={totals}
        selected={b}
        onSelect={onChangeB}
        label="Team B"
        placeholder="Pick team B…"
      />

      {both && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
          <Row meta={aMeta} stats={score} side="a" leads={score.aWins > score.bWins} />
          <div className="my-1 h-px bg-gray-200" />
          <Row meta={bMeta} stats={score} side="b" leads={score.bWins > score.aWins} />
          <div className="mt-2 flex justify-between text-gray-600">
            <span>Overlap regions</span>
            <span className="tabular-nums">{score.overlap.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span title="Regions where A and B have identical counts">Tied regions</span>
            <span className="tabular-nums">{score.tied.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ meta, stats, side, leads }) {
  if (!meta) return null;
  const wins = side === "a" ? stats.aWins : stats.bWins;
  const exclusive = side === "a" ? stats.aExclusive : stats.bExclusive;
  const total = side === "a" ? stats.aTotal : stats.bTotal;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-sm shrink-0"
          style={{ background: meta.primary_color }}
        />
        <span className="font-medium truncate">{meta.short_name}</span>
        {leads && (
          <span
            className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
            style={{ background: meta.primary_color }}
          >
            Leads
          </span>
        )}
      </div>
      <div className="pl-5 text-gray-600">
        <span className="tabular-nums">{wins.toLocaleString()}</span> regions won ·{" "}
        <span className="tabular-nums" title="Regions where this team has responses but the other doesn't">
          {exclusive.toLocaleString()}
        </span>{" "}
        uncontested · <span className="tabular-nums">{total.toLocaleString()}</span> responses
      </div>
    </div>
  );
}
