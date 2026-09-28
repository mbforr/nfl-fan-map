import { breakdown, colorAt, normalize, one, pct } from "../contest.js";

function Stack({ cell, colorOf }) {
  const { head, rest } = breakdown(cell, colorOf, 6);
  return (
    <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-sm bg-gray-100">
      {head.map((r) => (
        <span
          key={r.team}
          title={`${r.team} — ${r.n} (${pct(r.share)})`}
          style={{ background: r.color, width: `${r.share * 100}%` }}
        />
      ))}
      {rest ? <span style={{ background: "#e5e7eb", width: `${(rest / cell.n) * 100}%` }} /> : null}
    </div>
  );
}

function Card({ kind, cell, domain, colorOf, onGo }) {
  if (!cell) return null;
  const contested = kind === "contested";
  return (
    <button
      type="button"
      onClick={() => onGo(cell)}
      className="w-full rounded-md border border-gray-200 px-2.5 py-2 text-left transition-colors hover:bg-gray-50"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: colorAt(normalize(cell.contest, domain)) }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {contested ? "Most contested" : "Most uniform"}
        </span>
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold">{cell.label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-lg font-semibold tabular-nums leading-none">
          {one(cell.effective)}
        </span>
        <span className="text-[11px] text-gray-500">effective teams</span>
      </div>
      <Stack cell={cell} colorOf={colorOf} />
      <div className="mt-1 text-[11px] text-gray-500">
        {cell.n} responses · {cell.distinct} teams ·{" "}
        <span className="text-gray-700">{cell.top_team}</span> {pct(cell.top_share)}
      </div>
    </button>
  );
}

export default function ExtremesPanel({ mostContested, mostUniform, domain, scored, colorOf, onGo }) {
  return (
    <div className="pointer-events-none absolute top-20 right-4 z-10 hidden w-72 md:block">
      <div className="pointer-events-auto rounded-lg bg-white/95 p-2.5 shadow-lg backdrop-blur">
        <div className="mb-2 px-0.5 text-xs text-gray-500">
          {scored.length} hexagons scored — the two ends of the range
        </div>
        <div className="space-y-2">
          <Card kind="contested" cell={mostContested} domain={domain} colorOf={colorOf} onGo={onGo} />
          <Card kind="uniform" cell={mostUniform} domain={domain} colorOf={colorOf} onGo={onGo} />
        </div>
      </div>
    </div>
  );
}
