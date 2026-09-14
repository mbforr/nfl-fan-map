import { useEffect, useMemo, useRef, useState } from "react";
import { createMap, setBasemap } from "../map.js";
import { DEFAULT_BASEMAP, INITIAL_VIEW } from "../config.js";
import Counter from "../components/Counter.jsx";
import {
  addDensityLayers,
  applyDensity,
  applyDensityViewMode,
  applyLisa,
  bindDensityInteractions,
  SOURCE_POLYGONS,
} from "./densityMap.js";
import { buildRamp, computeScale, MEASURE_TOTAL } from "./scale.js";
import { groupClusters, normalizeLisa } from "./lisa.js";
import DensityControls from "./ui/DensityControls.jsx";
import ScaleLegend from "./ui/ScaleLegend.jsx";
import MoranPanel from "./ui/MoranPanel.jsx";

const WORLD_VIEW = { center: [10, 25], zoom: 1.5 };

export default function Density() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef({ polygons: null, centroids: null, categories: [], totals: null });
  const popupStateRef = useRef({});
  const unbindRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [polygonsReady, setPolygonsReady] = useState(false);
  const [error, setError] = useState(null);

  const [categories, setCategories] = useState([]);
  const [totals, setTotals] = useState({ meta: null, a: [] });
  const [lisa, setLisa] = useState({ meta: {}, counties: {}, byKey: new Map() });

  const [view, setView] = useState("choropleth");
  const [measure, setMeasure] = useState(null); // null = all responses
  const [scope, setScope] = useState("us");
  const [perArea, setPerArea] = useState(false);
  const [confidence, setConfidence] = useState("standard");
  const [showNS, setShowNS] = useState(false);
  const [basemap, setBasemapKey] = useState(DEFAULT_BASEMAP);

  const measureKey = measure || MEASURE_TOTAL;
  const measureLabel = measure || "All responses";
  const measureMeta = measure ? categories.find((c) => c.short_name === measure) : null;

  // --- derived ---------------------------------------------------------------
  const scale = useMemo(
    () => computeScale(dataRef.current.centroids, measureKey, scope, perArea),
    // dataRef is filled before `ready` flips, so `ready` is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, measureKey, scope, perArea],
  );
  const ramp = useMemo(() => buildRamp(measureMeta), [measureMeta]);
  const lisaVar = useMemo(
    () => lisa.byKey.get(measure || "total") || null,
    [lisa, measure],
  );
  const lisaGroups = useMemo(
    () => groupClusters(lisaVar, confidence),
    [lisaVar, confidence],
  );
  // Per-team clustering stats for the measure picker.
  const statFor = useMemo(
    () => (name) => lisa.byKey.get(name) || null,
    [lisa],
  );

  // --- mount -----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Light payload first (~1.2 MB) so the UI is interactive immediately;
        // the 16 MB polygon file streams in behind it.
        const [centroids, cats, tot, lisaJson] = await Promise.all([
          fetch("/data/regions_centroids.geojson").then((r) => r.json()),
          fetch("/data/category_a.json").then((r) => r.json()),
          fetch("/data/totals.json").then((r) => r.json()),
          fetch("/data/county_lisa.json").then((r) => r.json()),
        ]);
        if (cancelled) return;

        dataRef.current = { polygons: null, centroids, categories: cats, totals: tot };
        setCategories(cats);
        setTotals(tot);
        setLisa(normalizeLisa(lisaJson));

        const map = createMap(mapContainer.current);
        mapRef.current = map;
        if (import.meta.env.DEV) window.__denmap = map;

        map.on("load", () => {
          if (cancelled) return;
          // Read polygons off the ref, not the closure: the 16 MB fetch below can
          // resolve before style.load fires, in which case it found no source to
          // populate and left the data here for us.
          addDensityLayers(map, { polygons: dataRef.current.polygons, centroids });
          applyDensityViewMode(map, "choropleth");
          unbindRef.current = bindDensityInteractions(map, () => popupStateRef.current);
          setReady(true);
        });

        fetch("/data/regions_polygons.geojson")
          .then((r) => r.json())
          .then((polygons) => {
            if (cancelled) return;
            dataRef.current.polygons = polygons;
            // If the style hasn't loaded yet the source doesn't exist; the load
            // handler above will pick these up from the ref.
            const src = mapRef.current?.getSource(SOURCE_POLYGONS);
            if (src) src.setData(polygons);
            setPolygonsReady(true);
          })
          .catch((e) => !cancelled && setError(e.message || String(e)));
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (unbindRef.current) { unbindRef.current(); unbindRef.current = null; }
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // --- paint: density --------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    applyDensity(mapRef.current, { measure: measureKey, scope, perArea, scale, ramp });
  }, [ready, polygonsReady, measureKey, scope, perArea, scale, ramp]);

  // --- paint: LISA -----------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    applyLisa(mapRef.current, lisaGroups, showNS);
  }, [ready, polygonsReady, lisaGroups, showNS]);

  // --- visibility ------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    applyDensityViewMode(mapRef.current, view);
  }, [ready, view]);

  // --- camera on scope change ------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    const target = scope === "world" ? WORLD_VIEW : INITIAL_VIEW;
    mapRef.current.easeTo({ center: target.center, zoom: target.zoom, duration: 800 });
  }, [ready, scope]);

  // Moran's I is US-only; leaving US scope forces a legal view. Area fills of
  // wildly different size are also misleading worldwide, so prefer circles.
  useEffect(() => {
    if (scope === "world" && view === "moran") setView("circles");
  }, [scope, view]);

  // --- popup state -----------------------------------------------------------
  useEffect(() => {
    popupStateRef.current = {
      view, measure: measureKey, measureLabel, perArea, scale, lisaVar,
    };
  }, [view, measureKey, measureLabel, perArea, scale, lisaVar]);

  // --- basemap ---------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    setBasemap(mapRef.current, basemap, (m) => {
      const { polygons, centroids } = dataRef.current;
      addDensityLayers(m, { polygons, centroids });
      applyDensity(m, { measure: measureKey, scope, perArea, scale, ramp });
      applyLisa(m, lisaGroups, showNS);
      applyDensityViewMode(m, view);
      // Deliberately NOT re-binding interactions: layer-scoped map.on handlers
      // live on the Map, not the style, so they survive setStyle. Re-binding
      // here is what makes popups fire twice in the main app.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  return (
    <div className="relative h-screen w-screen">
      <div ref={mapContainer} className="absolute inset-0" />

      {ready && !error ? (
        <>
          <DensityControls
            categories={categories}
            totals={totals.a || []}
            measure={measure}
            onMeasure={setMeasure}
            view={view}
            onView={setView}
            scope={scope}
            onScope={setScope}
            perArea={perArea}
            onPerArea={setPerArea}
            confidence={confidence}
            onConfidence={setConfidence}
            showNS={showNS}
            onShowNS={setShowNS}
            basemap={basemap}
            onBasemap={setBasemapKey}
            accentColor={measureMeta?.primary_color}
            polygonsReady={polygonsReady}
            statFor={statFor}
          />
          <Counter meta={totals.meta} />
          {view === "moran" ? (
            <MoranPanel
              variable={lisaVar}
              measureLabel={measureLabel}
              meta={lisa.meta}
              confidence={confidence}
              nSignificant={lisaGroups.all.length}
            />
          ) : null}
          <ScaleLegend
            view={view}
            measure={measureKey}
            measureLabel={measureLabel}
            scale={scale}
            ramp={ramp}
            perArea={perArea}
            scope={scope}
            lisaGroups={lisaGroups}
            showNS={showNS}
          />
        </>
      ) : null}

      {!ready && !error ? (
        <div className="absolute top-4 left-4 rounded-lg bg-white/95 px-3 py-2 text-sm shadow">
          Loading map data…
        </div>
      ) : null}
      {ready && !polygonsReady && !error ? (
        <div className="absolute bottom-4 left-4 rounded-lg bg-white/95 px-3 py-2 text-xs shadow">
          Loading county boundaries…
        </div>
      ) : null}
      {error ? (
        <div className="absolute top-4 left-4 max-w-md rounded-lg bg-white/95 px-3 py-2 text-sm shadow text-red-800">
          Error loading map: {error}
        </div>
      ) : null}
    </div>
  );
}
