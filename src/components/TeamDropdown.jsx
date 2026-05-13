import { useEffect, useMemo, useRef, useState } from "react";

export default function TeamDropdown({
  teams,
  totals,
  selected,
  onSelect,
  label = "Team",
  placeholder = "Pick a team…",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const sorted = useMemo(() => {
    const countByName = new Map((totals || []).map((t) => [t.short_name, t.count]));
    return [...teams]
      .map((t) => ({ ...t, count: countByName.get(t.short_name) || 0 }))
      .sort((a, b) => b.count - a.count || a.short_name.localeCompare(b.short_name));
  }, [teams, totals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((t) => t.short_name.toLowerCase().includes(q));
  }, [sorted, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const selectedMeta = sorted.find((t) => t.short_name === selected) || null;

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = filtered[highlight];
      if (t) {
        onSelect(t.short_name);
        setOpen(false);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-1" ref={rootRef}>
      {label ? (
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      ) : null}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full inline-flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-gray-300"
        >
          {selectedMeta ? (
            <span className="flex items-center gap-2 truncate">
              <span
                className="inline-block h-3 w-3 rounded-sm shrink-0"
                style={{ background: selectedMeta.primary_color }}
              />
              <span className="truncate">{selectedMeta.short_name}</span>
            </span>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
          {selectedMeta ? (
            <span
              role="button"
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
              className="text-gray-400 hover:text-gray-700 pl-1"
            >
              ×
            </span>
          ) : (
            <span className="text-gray-400">▾</span>
          )}
        </button>
        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search…"
              className="w-full border-b border-gray-100 px-3 py-2 text-sm outline-none"
            />
            <ul className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500">No teams</li>
              ) : (
                filtered.map((t, i) => (
                  <li
                    key={t.short_name}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => {
                      onSelect(t.short_name);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={
                      "flex items-center justify-between gap-2 px-3 py-1.5 text-sm cursor-pointer " +
                      (i === highlight ? "bg-gray-100" : "")
                    }
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="inline-block h-3 w-3 rounded-sm shrink-0"
                        style={{ background: t.primary_color }}
                      />
                      <span className="truncate">{t.short_name}</span>
                    </span>
                    <span className="tabular-nums text-xs text-gray-500">
                      {t.count.toLocaleString()}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
