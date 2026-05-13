const FLAGS = { US: "🇺🇸", CA: "🇨🇦", MX: "🇲🇽", GB: "🇬🇧", AU: "🇦🇺", DE: "🇩🇪", BR: "🇧🇷" };

export default function Counter({ meta }) {
  if (!meta) return null;
  const byCountry = meta.by_country || {};
  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="pointer-events-none absolute top-4 right-16 z-10 hidden md:block">
      <div className="pointer-events-auto rounded-lg bg-white/95 px-3 py-2 text-xs shadow backdrop-blur">
        <div>
          <span className="font-medium tabular-nums">{(meta.valid_rows || 0).toLocaleString()}</span>
          <span className="text-gray-500"> responses · </span>
          <span className="font-medium tabular-nums">{(meta.unique_regions || 0).toLocaleString()}</span>
          <span className="text-gray-500"> regions</span>
        </div>
        {topCountries.length ? (
          <div className="mt-1 flex gap-2 text-gray-600">
            {topCountries.map(([iso, n]) => (
              <span key={iso} className="flex items-center gap-1">
                <span>{FLAGS[iso] || iso}</span>
                <span className="tabular-nums">{n.toLocaleString()}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
