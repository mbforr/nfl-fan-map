import { useEffect, useState } from "react";

function useInitialOpen() {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = (e) => setOpen(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return [open, setOpen];
}

export default function Legend({ totals, categories, selectedTeam }) {
  const [open, setOpen] = useInitialOpen();
  const colorByName = new Map(categories.map((c) => [c.short_name, c.primary_color]));
  const selectedMeta = selectedTeam ? categories.find((c) => c.short_name === selectedTeam) : null;
  const selectedCount = selectedTeam
    ? totals.find((t) => t.short_name === selectedTeam)?.count || 0
    : 0;
  const top = (totals || []).slice(0, 10);

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 w-[min(18rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-lg bg-white/95 shadow-lg backdrop-blur">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-4 py-2"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-sm font-semibold text-gray-900">
            {selectedTeam ? "Selected team" : "Top 10 nationally"}
          </span>
          <span className="text-gray-500">{open ? "▾" : "▴"}</span>
        </button>
        {open && (
          <div className="px-4 pb-3">
            {selectedTeam && selectedMeta ? (
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: selectedMeta.primary_color }}
                />
                <span className="font-medium">{selectedMeta.short_name}</span>
                <span className="ml-auto tabular-nums text-gray-600">
                  {selectedCount.toLocaleString()} responses
                </span>
              </div>
            ) : (
              <ul className="flex flex-col gap-1 text-xs">
                {top.map((t) => (
                  <li key={t.short_name} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ background: colorByName.get(t.short_name) || "#9ca3af" }}
                    />
                    <span className="truncate">{t.short_name}</span>
                    <span className="ml-auto tabular-nums text-gray-600">
                      {t.count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
