import { useEffect, useState } from "react";

export default function ViewportTop({ map, centroids, group, categories }) {
  const [top5, setTop5] = useState([]);
  const [inView, setInView] = useState(0);

  useEffect(() => {
    if (!map || !centroids) return;
    const countsKey = `${group}_counts`;

    function recompute() {
      const b = map.getBounds();
      const w = b.getWest();
      const e = b.getEast();
      const s = b.getSouth();
      const n = b.getNorth();
      const tally = new Map();
      let regions = 0;
      for (const f of centroids.features) {
        const [lng, lat] = f.geometry.coordinates;
        if (lng < w || lng > e || lat < s || lat > n) continue;
        const counts = f.properties[countsKey];
        if (!counts) continue;
        regions += 1;
        for (const team in counts) {
          tally.set(team, (tally.get(team) || 0) + counts[team]);
        }
      }
      const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      setTop5(sorted.map(([name, count]) => ({ name, count })));
      setInView(regions);
    }
    recompute();
    map.on("moveend", recompute);
    return () => map.off("moveend", recompute);
  }, [map, centroids, group]);

  const max = top5[0]?.count || 1;
  const colorByName = new Map(categories.map((c) => [c.short_name, c.primary_color]));

  return (
    <div className="pointer-events-none absolute top-20 right-4 z-10 hidden md:block w-56">
      <div className="pointer-events-auto rounded-lg bg-white/95 p-3 text-xs shadow backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-gray-900">Top in view</span>
          <span className="text-gray-500 tabular-nums">{inView} regions</span>
        </div>
        {top5.length === 0 ? (
          <div className="text-gray-500">No data in viewport</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {top5.map(({ name, count }) => {
              const w = max ? Math.max(4, (count / max) * 100) : 0;
              const color = colorByName.get(name) || "#9ca3af";
              return (
                <li key={name} className="flex flex-col gap-0.5">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{name}</span>
                    <span className="tabular-nums text-gray-600">{count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-gray-100">
                    <div className="h-full" style={{ width: `${w}%`, background: color }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
