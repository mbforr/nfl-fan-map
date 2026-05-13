import { useEffect, useRef, useState } from "react";
import {
  addLayers,
  applyDominant,
  applyFaceoff,
  applyTeamFilter,
  applyViewMode,
  bindInteractions,
  buildPoisFC,
  setBasemap,
  setPois,
} from "./map.js";
import { createMap } from "./map.js";
import { DEFAULT_BASEMAP, GROUP } from "./config.js";
import Controls from "./components/Controls.jsx";
import Counter from "./components/Counter.jsx";
import ViewportTop from "./components/ViewportTop.jsx";
import Legend from "./components/Legend.jsx";

export default function App() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef({ polygons: null, centroids: null, categories: [], totals: null });
  const groupRef = useRef(GROUP);

  const [categories, setCategories] = useState([]);
  const [totals, setTotals] = useState({ meta: null, a: [] });
  const [viewMode, setViewMode] = useState("polygons");
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [basemap, setBasemapKey] = useState(DEFAULT_BASEMAP);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const [faceoffActive, setFaceoffActive] = useState(false);
  const [faceoffA, setFaceoffA] = useState(null);
  const [faceoffB, setFaceoffB] = useState(null);

  const selectedTeamMeta = selectedTeam
    ? categories.find((c) => c.short_name === selectedTeam) || null
    : null;
  const faceoffAMeta = faceoffA ? categories.find((c) => c.short_name === faceoffA) : null;
  const faceoffBMeta = faceoffB ? categories.find((c) => c.short_name === faceoffB) : null;
  const isFaceoff = faceoffActive && !!(faceoffA && faceoffB);

  // Mutually exclusive modes: picking a single team exits face-off; entering
  // face-off clears the single-team selection.
  function handleSelectTeam(name) {
    if (faceoffActive) setFaceoffActive(false);
    setSelectedTeam(name);
  }
  function handleFaceoffActivate() {
    setSelectedTeam(null);
    setFaceoffActive(true);
  }
  function handleFaceoffExit() {
    setFaceoffActive(false);
    setFaceoffA(null);
    setFaceoffB(null);
  }

  // Mount: fetch data, create map, add layers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [polygons, centroids, cats, tot] = await Promise.all([
          fetch("/data/regions_polygons.geojson").then((r) => r.json()),
          fetch("/data/regions_centroids.geojson").then((r) => r.json()),
          fetch("/data/category_a.json").then((r) => r.json()),
          fetch("/data/totals.json").then((r) => r.json()),
        ]);
        if (cancelled) return;

        dataRef.current = { polygons, centroids, categories: cats, totals: tot };
        setCategories(cats);
        setTotals(tot);

        const map = createMap(mapContainer.current);
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          addLayers(map, { polygons, centroids });
          setPois(map, buildPoisFC(cats, tot.a));
          applyDominant(map, cats, GROUP);
          applyViewMode(map, "polygons");
          bindInteractions(map, () => groupRef.current);
          setReady(true);
        });
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter mode effect: face-off > selected team > dominant
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const { centroids, categories: cats } = dataRef.current;
    if (isFaceoff && faceoffAMeta && faceoffBMeta) {
      applyFaceoff(
        map,
        GROUP,
        faceoffA,
        faceoffB,
        faceoffAMeta.primary_color,
        faceoffBMeta.primary_color,
      );
    } else if (selectedTeam && selectedTeamMeta) {
      applyTeamFilter(
        map,
        GROUP,
        selectedTeam,
        selectedTeamMeta.primary_color,
        centroids,
        selectedTeamMeta.poi,
      );
    } else {
      applyDominant(map, cats, GROUP);
    }
  }, [
    ready,
    isFaceoff,
    faceoffA,
    faceoffB,
    faceoffAMeta,
    faceoffBMeta,
    selectedTeam,
    selectedTeamMeta,
  ]);

  // View mode effect
  useEffect(() => {
    if (!ready) return;
    applyViewMode(mapRef.current, viewMode);
  }, [ready, viewMode]);

  // POI data effect (refresh if categories/totals change)
  useEffect(() => {
    if (!ready) return;
    setPois(mapRef.current, buildPoisFC(categories, totals.a || []));
  }, [ready, categories, totals]);

  // Basemap swap effect
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    setBasemap(map, basemap, (m) => {
      const { polygons, centroids, categories: cats, totals: tot } = dataRef.current;
      addLayers(m, { polygons, centroids });
      setPois(m, buildPoisFC(cats, tot.a));
      if (isFaceoff && faceoffAMeta && faceoffBMeta) {
        applyFaceoff(m, GROUP, faceoffA, faceoffB, faceoffAMeta.primary_color, faceoffBMeta.primary_color);
      } else if (selectedTeam && selectedTeamMeta) {
        applyTeamFilter(m, GROUP, selectedTeam, selectedTeamMeta.primary_color, centroids, selectedTeamMeta.poi);
      } else {
        applyDominant(m, cats, GROUP);
      }
      applyViewMode(m, viewMode);
      bindInteractions(m, () => groupRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  return (
    <div className="relative h-screen w-screen">
      <div ref={mapContainer} className="absolute inset-0" />
      {ready && !error && (
        <>
          <Controls
            categories={categories}
            totals={totals.a || []}
            centroids={dataRef.current.centroids}
            selectedTeam={selectedTeam}
            onSelectTeam={handleSelectTeam}
            viewMode={viewMode}
            onViewMode={setViewMode}
            basemap={basemap}
            onBasemap={setBasemapKey}
            accentColor={selectedTeamMeta?.primary_color}
            faceoffActive={faceoffActive}
            faceoffA={faceoffA}
            faceoffB={faceoffB}
            onFaceoffActivate={handleFaceoffActivate}
            onFaceoffExit={handleFaceoffExit}
            onFaceoffA={setFaceoffA}
            onFaceoffB={setFaceoffB}
          />
          <Counter meta={totals.meta} />
          <ViewportTop
            map={mapRef.current}
            centroids={dataRef.current.centroids}
            group={GROUP}
            categories={categories}
          />
          <Legend totals={totals.a || []} categories={categories} selectedTeam={selectedTeam} />
        </>
      )}
      {!ready && !error && (
        <div className="absolute top-4 left-4 rounded-lg bg-white/95 px-3 py-2 text-sm shadow">
          Loading map data…
        </div>
      )}
      {error && (
        <div className="absolute top-4 left-4 max-w-md rounded-lg bg-white/95 px-3 py-2 text-sm shadow text-red-800">
          Error loading map: {error}
        </div>
      )}
    </div>
  );
}
