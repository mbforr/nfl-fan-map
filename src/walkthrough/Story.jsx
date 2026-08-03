import { useEffect, useMemo, useRef, useState } from "react";
import { createMap, bindInteractions } from "../map.js";
import {
  addStoryLayers, bindStoryPopups, flyTo, LISA_COLORS, resetFillOpacity,
  showCountry, showDominant, showLisa, showRust, showTeam, showVoronoi,
} from "./storyMap.js";
import { GROUP } from "../config.js";
import { CHAPTERS } from "./chapters.js";
import { BarList, SpikeChart } from "./charts.jsx";

const NFL_BLUE = "#013369";

export default function Story() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [categories, setCategories] = useState([]);
  const [story, setStory] = useState(null);
  const [lisaTeam, setLisaTeam] = useState("Buffalo Bills");
  const [diasporaMode, setDiasporaMode] = useState("spread"); // spread | dense
  const diasporaTeam = diasporaMode === "dense" ? "Houston Texans" : "Las Vegas Raiders";

  const colorOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.short_name, c.primary_color]));
    return (name) => m.get(name) || "#9ca3af";
  }, [categories]);

  const chapter = CHAPTERS[idx];
  const accent = chapter.layer.kind === "lisa" ? colorOf(lisaTeam)
    : chapter.id === "diaspora" ? colorOf(diasporaTeam)
    : chapter.layer.team ? colorOf(chapter.layer.team) : NFL_BLUE;

  // Mount: load data + build map.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [polygons, centroids, cats, totals, storyJson, voronoi, country, rust, lisa] =
          await Promise.all([
            fetch("/data/regions_polygons.geojson").then((r) => r.json()),
            fetch("/data/regions_centroids.geojson").then((r) => r.json()),
            fetch("/data/category_a.json").then((r) => r.json()),
            fetch("/data/totals.json").then((r) => r.json()),
            fetch("/data/story.json").then((r) => r.json()),
            fetch("/data/voronoi_stadiums.geojson").then((r) => r.json()),
            fetch("/data/country_dominant.geojson").then((r) => r.json()),
            fetch("/data/rust_belt_metros.geojson").then((r) => r.json()),
            fetch("/data/lisa_clusters.geojson").then((r) => r.json()),
          ]);
        if (cancelled) return;
        dataRef.current = { polygons, centroids, categories: cats, totals, voronoi, country, rust, lisa };
        setCategories(cats);
        setStory(storyJson);

        const map = createMap(mapContainer.current);
        mapRef.current = map;
        map.on("load", () => {
          if (cancelled) return;
          addStoryLayers(map, { polygons, centroids, voronoi, country, rust, lisa, categories: cats });
          bindInteractions(map, () => ({ group: GROUP, colorOf }));
          bindStoryPopups(map, colorOf);
          setReady(true);
        });
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the active chapter's layer + camera.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const { categories: cats, centroids } = dataRef.current;
    resetFillOpacity(map);
    const l = chapter.layer;
    if (l.kind === "dominant") showDominant(map, cats);
    else if (l.kind === "team") showTeam(map, cats, chapter.id === "diaspora" ? diasporaTeam : l.team, centroids);
    else if (l.kind === "voronoi") showVoronoi(map);
    else if (l.kind === "country") showCountry(map);
    else if (l.kind === "rust") showRust(map, cats);
    else if (l.kind === "lisa") showLisa(map, lisaTeam);
    flyTo(map, chapter.camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, idx]);

  // Re-filter the LISA layer when the team toggle changes (no camera move).
  useEffect(() => {
    if (!ready || chapter.layer.kind !== "lisa") return;
    showLisa(mapRef.current, lisaTeam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lisaTeam]);

  // Swap the featured diaspora team (spread ↔ concentrated) without re-flying.
  useEffect(() => {
    if (!ready || chapter.id !== "diaspora") return;
    const { categories: cats, centroids } = dataRef.current;
    showTeam(mapRef.current, cats, diasporaTeam, centroids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diasporaMode]);

  const next = () => setIdx((i) => Math.min(i + 1, CHAPTERS.length - 1));
  const prev = () => setIdx((i) => Math.max(i - 1, 0));
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Title */}
      <div className="pointer-events-none absolute top-4 left-4 z-10">
        <div className="pointer-events-auto rounded-lg bg-white/95 px-4 py-2 shadow-lg backdrop-blur">
          <div className="text-sm font-semibold text-gray-900">NFL Fan Map — The Story</div>
          <div className="text-[11px] text-gray-500">A guided tour of what {story?.headline?.total_rows?.toLocaleString() || "29,081"} responses reveal</div>
        </div>
      </div>

      {/* Narrative panel */}
      {ready && story && (
        <div className="pointer-events-none absolute top-20 left-4 z-10 w-[min(23rem,calc(100vw-2rem))]">
          <div
            className="pointer-events-auto max-h-[calc(100vh-11rem)] overflow-y-auto rounded-lg bg-white/95 shadow-lg backdrop-blur"
            style={{ borderTopColor: accent, borderTopWidth: 3 }}
          >
            <div className="flex flex-col gap-3 p-4">
              <div>
                <span
                  className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                  style={{ background: accent }}
                >
                  {chapter.tag}
                </span>
                <h2 className="mt-2 text-lg font-bold leading-snug text-gray-900">{chapter.title}</h2>
              </div>
              <p className="text-[13px] leading-relaxed text-gray-600">{chapter.blurb}</p>
              <div className="border-t border-gray-100 pt-3">
                <Panel kind={chapter.panel} story={story} colorOf={colorOf}
                  lisaTeam={lisaTeam} setLisaTeam={setLisaTeam} accent={accent}
                  diasporaMode={diasporaMode} setDiasporaMode={setDiasporaMode} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chapter nav */}
      {ready && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur">
            <button onClick={prev} disabled={idx === 0}
              className="rounded-full px-2 py-1 text-sm text-gray-600 disabled:opacity-30 hover:bg-gray-100">←</button>
            {CHAPTERS.map((ch, i) => (
              <button key={ch.id} onClick={() => setIdx(i)} title={ch.title}
                className="h-7 w-7 rounded-full text-xs font-semibold transition"
                style={i === idx
                  ? { background: accent, color: "#fff" }
                  : { background: "#f3f4f6", color: "#4b5563" }}>
                {i === 0 ? "★" : i}
              </button>
            ))}
            <button onClick={next} disabled={idx === CHAPTERS.length - 1}
              className="rounded-full px-2 py-1 text-sm text-gray-600 disabled:opacity-30 hover:bg-gray-100">→</button>
          </div>
        </div>
      )}

      {!ready && !error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-lg bg-white/95 px-3 py-2 text-sm shadow">Loading the story…</div>
      )}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-md rounded-lg bg-white/95 px-3 py-2 text-sm text-red-800 shadow">Error: {error}</div>
      )}
    </div>
  );
}

// ---- Per-chapter mini-panels ----
function Panel({ kind, story, colorOf, lisaTeam, setLisaTeam, accent, diasporaMode, setDiasporaMode }) {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  if (kind === "intro") {
    const h = story.headline;
    const stat = (v, l) => (
      <div className="rounded-md bg-gray-50 px-3 py-2">
        <div className="text-lg font-bold text-gray-900">{v}</div>
        <div className="text-[11px] text-gray-500">{l}</div>
      </div>
    );
    return (
      <div className="grid grid-cols-2 gap-2">
        {stat(h.total_rows.toLocaleString(), "responses")}
        {stat(h.on_map.toLocaleString(), "placed on map")}
        {stat(h.regions.toLocaleString(), "regions")}
        {stat(h.countries_50, "countries ≥50")}
      </div>
    );
  }
  if (kind === "spike") {
    return (
      <div className="flex flex-col gap-2">
        <SpikeChart series={story.spike.series} />
        <div className="text-xs text-gray-600">
          Daily Packers share. Flat at ~6.5% until <b>May 19–21</b> ({story.spike.spike_days.length} spike days total),
          when the Instagram comment pushed it near 40%.
        </div>
      </div>
    );
  }
  if (kind === "leaderboard") {
    const items = story.prespike_leaderboard.slice(0, 8).map((r) => ({
      label: r.team, frac: r.share, valueLabel: pct(r.share), color: colorOf(r.team),
    }));
    return (
      <>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Pre-spike leaderboard (May 11–18)</div>
        <BarList items={items} />
      </>
    );
  }
  if (kind === "diaspora") {
    const dense = diasporaMode === "dense";
    // story.diaspora is sorted ascending by home-state %: first = most spread,
    // last = most concentrated.
    const rows = dense
      ? story.diaspora.slice(-6).reverse()  // top 6 home density (Texans first)
      : story.diaspora.slice(0, 6);         // 6 most spread (Raiders first)
    const items = rows.map((r) => ({
      label: r.team, frac: r.pct, valueLabel: pct(r.pct), color: colorOf(r.team),
    }));
    const other = dense ? story.diaspora[0] : story.diaspora[story.diaspora.length - 1];
    const toggle = (mode, label) => (
      <button onClick={() => setDiasporaMode(mode)}
        className="rounded-full px-2.5 py-0.5 text-[11px] font-medium transition"
        style={diasporaMode === mode
          ? { background: accent, color: "#fff" }
          : { background: "#f3f4f6", color: "#4b5563" }}>
        {label}
      </button>
    );
    return (
      <>
        <div className="mb-2 flex gap-1">
          {toggle("spread", "Most spread")}
          {toggle("dense", "Most concentrated")}
        </div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {dense ? "Highest home-state density" : "Most diaspora (lowest home-state %)"}
        </div>
        <BarList items={items} />
        <div className="mt-2 text-xs text-gray-600">
          {dense
            ? <>Map shows the <b>Texans</b> — {pct(story.diaspora[story.diaspora.length - 1].pct)} of fans in Texas. Most spread: <b>{other.team}</b> ({pct(other.pct)}).</>
            : <>Map shows the <b>Raiders</b> — {pct(story.diaspora[0].pct)} in Nevada. Most concentrated: <b>{other.team}</b> ({pct(other.pct)}).</>}
        </div>
      </>
    );
  }
  if (kind === "international") {
    const items = story.international.slice(0, 8).map((r) => ({
      label: `${r.country} · ${r.top_team}`, frac: r.total,
      valueLabel: r.total.toLocaleString(), color: colorOf(r.top_team),
    }));
    return (
      <>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Top country by responses (color = top team)</div>
        <BarList items={items} />
      </>
    );
  }
  if (kind === "voronoi") {
    const worst = [...story.voronoi.cells].slice(-5).reverse().map((r) => ({
      label: r.label || r.cell_team, frac: r.accuracy, valueLabel: `${Math.round(r.accuracy * 100)}%`, color: colorOf(r.cell_team),
    }));
    return (
      <>
        <div className="mb-1 text-2xl font-bold text-gray-900">{Math.round(story.voronoi.overall * 100)}%</div>
        <div className="mb-2 text-xs text-gray-500">of fans root for their nearest-stadium team</div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Worst-predicted cells</div>
        <BarList items={worst} />
      </>
    );
  }
  if (kind === "rust") {
    const totals = story.rust.metro_totals || {};
    const items = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([metro, n]) => ({ label: metro, frac: n, valueLabel: String(n), color: "#FFB612" }));
    return (
      <>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Rust Belt fans per Sun Belt metro</div>
        <BarList items={items} />
        <div className="mt-2 text-xs text-gray-600">Phoenix leads — 38% of its responses are Rust Belt / Upper-Midwest teams.</div>
      </>
    );
  }
  if (kind === "moran") {
    const teams = story.lisa?.teams || [];
    const sig = story.lisa?.significant || {};
    const globalI = story.moran.find((r) => r.team === lisaTeam);
    const legend = [
      ["HH", "Hotspot — strong, near other strong regions"],
      ["HL", "High outlier — strong, near weak"],
      ["LH", "Low outlier — weak, near strong"],
    ];
    return (
      <>
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">Team</div>
        <div className="mb-3 flex flex-wrap gap-1">
          {teams.map((t) => (
            <button key={t} onClick={() => setLisaTeam(t)}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium transition"
              style={t === lisaTeam
                ? { background: accent, color: "#fff" }
                : { background: "#f3f4f6", color: "#4b5563" }}>
              {t.split(" ").slice(-1)[0]}
            </button>
          ))}
        </div>
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900">{globalI ? globalI.moran_i.toFixed(2) : "—"}</span>
          <span className="text-xs text-gray-500">
            global Moran's I · {sig[lisaTeam] ?? 0} significant regions
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {legend.map(([k, label]) => (
            <div key={k} className="flex items-center gap-2 text-[11px] text-gray-600">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: LISA_COLORS[k] }} />
              <span><b>{k}</b> — {label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-gray-400">Higher I = more spatially clustered. Bills/Steelers cluster tightly; Cowboys/Chiefs spread nationally.</div>
      </>
    );
  }
  return null;
}
