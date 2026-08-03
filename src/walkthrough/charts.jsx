// Small self-contained SVG/flex charts for the narrative panels. No chart lib —
// keeps the walkthrough as light as the main app.

export function BarList({ items }) {
  const max = Math.max(...items.map((i) => i.frac), 0.0001);
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-gray-700" title={it.label}>{it.label}</span>
          <div className="relative h-3.5 flex-1 rounded bg-gray-100">
            <div
              className="absolute inset-y-0 left-0 rounded"
              style={{ width: `${(it.frac / max) * 100}%`, background: it.color || "#6b7280" }}
            />
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums text-gray-600">{it.valueLabel}</span>
        </div>
      ))}
    </div>
  );
}

// Packers daily-share line with the spike window shaded.
export function SpikeChart({ series }) {
  const W = 300, H = 96, pad = 4;
  if (!series?.length) return null;
  const xs = series.map((_, i) => i);
  const maxShare = Math.max(...series.map((d) => d.share), 0.1);
  const x = (i) => pad + (i / (series.length - 1)) * (W - 2 * pad);
  const y = (s) => H - pad - (s / maxShare) * (H - 2 * pad);
  const path = series.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.share).toFixed(1)}`).join(" ");
  // spike window = contiguous run of highest points (May 19–21)
  const peakIdx = series.reduce((m, d, i) => (d.share > series[m].share ? i : m), 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 110 }}>
      {/* 15% threshold line */}
      <line x1={pad} x2={W - pad} y1={y(0.15)} y2={y(0.15)} stroke="#d1d5db" strokeDasharray="3 3" strokeWidth="1" />
      <text x={pad} y={y(0.15) - 3} fontSize="8" fill="#9ca3af">15%</text>
      {/* spike marker */}
      <circle cx={x(peakIdx)} cy={y(series[peakIdx].share)} r="3" fill="#203731" />
      <text x={x(peakIdx)} y={y(series[peakIdx].share) - 6} fontSize="8" fill="#203731" textAnchor="middle">
        {series[peakIdx].date} · {Math.round(series[peakIdx].share * 100)}%
      </text>
      <path d={path} fill="none" stroke="#203731" strokeWidth="1.6" />
      <text x={pad} y={H - 1} fontSize="8" fill="#9ca3af">{series[0].date}</text>
      <text x={W - pad} y={H - 1} fontSize="8" fill="#9ca3af" textAnchor="end">{series[series.length - 1].date}</text>
    </svg>
  );
}
