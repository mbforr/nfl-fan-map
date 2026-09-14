import { describeMoran } from "../lisa.js";

const fmtP = (p) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

export default function MoranPanel({ variable, measureLabel, meta, confidence, nSignificant }) {
  if (!variable) {
    return (
      <Card>
        <div className="text-xs text-gray-500">No statistic for this measure.</div>
      </Card>
    );
  }
  const w = meta?.weights || {};
  return (
    <Card>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">Global Moran&rsquo;s I</div>
      <div className="mt-0.5 truncate text-xs font-medium" title={measureLabel}>{measureLabel}</div>

      <div className="mt-1.5 text-3xl font-semibold tabular-nums leading-none">
        {variable.moran_i.toFixed(3)}
      </div>
      <div className="mt-1 text-[11px] tabular-nums text-gray-500">
        z = {variable.z_sim.toFixed(1)} · p {fmtP(variable.p_sim)}
      </div>

      <p className="mt-2 text-xs leading-snug text-gray-700">{describeMoran(variable)}</p>

      <div className="mt-2 border-t border-gray-100 pt-1.5 text-[11px] tabular-nums text-gray-500">
        {nSignificant.toLocaleString()} significant counties
        {confidence === "fdr" ? " (FDR)" : ""} of {meta?.n_counties?.toLocaleString() ?? "—"}
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-gray-400">
        {variable.method === "eb_rate"
          ? "Empirical-Bayes adjusted share of local responses"
          : "log(1 + responses)"}
        {" · "}Queen ∪ KNN({w.knn_k ?? 4}) · {(meta?.permutations ?? 9999).toLocaleString()} permutations.
        Contiguity covers responding counties only.
      </p>
    </Card>
  );
}

function Card({ children }) {
  return (
    <div className="pointer-events-none absolute top-20 right-4 z-10 hidden md:block w-64">
      <div className="pointer-events-auto rounded-lg bg-white/95 px-3 py-2.5 shadow backdrop-blur">
        {children}
      </div>
    </div>
  );
}
