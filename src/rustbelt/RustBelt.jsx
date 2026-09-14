import { useEffect, useMemo, useRef, useState } from "react";
import { createMap, setBasemap } from "../map.js";
import { DEFAULT_BASEMAP } from "../config.js";
import Counter from "../components/Counter.jsx";
import {
  addRustBeltLayers, applyMargin, applySelection, applyUnit,
  bindRustBeltInteractions, ensureHatchImage, setStateLabels, SOURCE_COUNTIES,
} from "./rustbeltMap.js";
import { computeBelt, exportRates, DIVERGING } from "./margin.js";
import { STATE_BY_FIPS } from "./constants.js";
import RustBeltControls from "./ui/RustBeltControls.jsx";
import BlocPanel from "./ui/BlocPanel.jsx";
import MarginLegend from "./ui/MarginLegend.jsx";

// CA's west coast to NC's, and the Keys up to northern UT.
const SUN_BELT_BOUNDS = [[-124.8, 24.3], [-75.0, 42.2]];
const fitSunBelt = (map, duration = 0) => {
  // Only pad for the control column on the left; the legend sits in the
  // bottom-right corner, so padding the full right edge just over-zooms out.
  const narrow = window.innerWidth < 768;
  map.fitBounds(SUN_BELT_BOUNDS, {
    padding: narrow
      ? { top: 20, bottom: 20, left: 20, right: 20 }
      : { top: 40, bottom: 100, left: 350, right: 60 },
    duration,
  });
};

export default function RustBelt() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const dataRef = useRef({ states: null, counties: null, categories: [], totals: null });
  const popupStateRef = useRef({});
  const unbindRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [countiesReady, setCountiesReady] = useState(false);
  const [error, setError] = useState(null);

  const [categories, setCategories] = useState([]);
  const [totals, setTotals] = useState({ meta: null, a: [] });
  const [statesFC, setStatesFC] = useState(null);

  const [unit, setUnit] = useState("states");
  const [measure, setMeasure] = useState(null); // null = all 9 combined
  const [selectedId, setSelectedId] = useState(null);
  const [showLowN, setShowLowN] = useState(false);
  const [basemap, setBasemapKey] = useState(DEFAULT_BASEMAP);

  // --- derived ---------------------------------------------------------------
  const belt = useMemo(
    () => (statesFC ? computeBelt(statesFC, measure, categories) : null),
    [statesFC, measure, categories],
  );
  const beltAll = useMemo(
    () => (statesFC ? computeBelt(statesFC, null, categories) : null),
    [statesFC, categories],
  );
  const rates = useMemo(
    () => (beltAll ? exportRates(beltAll.rollup.sunByTeam, totals.a) : null),
    [beltAll, totals],
  );
  // Dropdown ranks by Sun Belt presence rather than national count.
  const sunTotals = useMemo(
    () => (beltAll
      ? Object.entries(beltAll.rollup.sunByTeam).map(([short_name, count]) => ({ short_name, count }))
      : []),
    [beltAll],
  );
  const colorOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.short_name, c.primary_color]));
    return (n) => m.get(n) || null;
  }, [categories]);
  const measureMeta = measure ? categories.find((c) => c.short_name === measure) : null;
  const accentColor = measureMeta?.primary_color || DIVERGING[7];

  // --- mount -----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [states, cats, tot] = await Promise.all([
          fetch("/data/states_polygons.geojson").then((r) => r.json()),
          fetch("/data/category_a.json").then((r) => r.json()),
          fetch("/data/totals.json").then((r) => r.json()),
        ]);
        if (cancelled) return;
        dataRef.current = { states, counties: null, categories: cats, totals: tot };
        setStatesFC(states);
        setCategories(cats);
        setTotals(tot);

        const map = createMap(mapContainer.current);
        mapRef.current = map;
        if (import.meta.env.DEV) window.__rbmap = map;

        map.on("load", () => {
          if (cancelled) return;
          // Read counties off the ref: the 16 MB fetch below can resolve before
          // style.load, in which case it found no source to fill.
          addRustBeltLayers(map, dataRef.current);
          applyUnit(map, "states");
          fitSunBelt(map);
          unbindRef.current = bindRustBeltInteractions(map, () => popupStateRef.current);
          setReady(true);
        });

        fetch("/data/regions_polygons.geojson")
          .then((r) => r.json())
          .then((fc) => {
            if (cancelled) return;
            dataRef.current.counties = fc;
            const src = mapRef.current?.getSource(SOURCE_COUNTIES);
            if (src) src.setData(fc);
            setCountiesReady(true);
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

  // --- paint -----------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    applyMargin(mapRef.current, { measure, showLowN });
    setStateLabels(mapRef.current, belt);
  }, [ready, countiesReady, measure, showLowN, belt]);

  useEffect(() => {
    if (!ready) return;
    applyUnit(mapRef.current, unit);
  }, [ready, unit]);

  useEffect(() => {
    if (!ready) return;
    applySelection(mapRef.current, unit, selectedId);
  }, [ready, unit, selectedId]);

  // A county id means nothing to the state layer and vice versa.
  useEffect(() => { setSelectedId(null); }, [unit]);

  useEffect(() => {
    popupStateRef.current = { measure, unit, onSelect: setSelectedId };
  }, [measure, unit]);

  // --- basemap ---------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    setBasemap(mapRef.current, basemap, (m) => {
      // addImage bitmaps do NOT survive setStyle — the hatch must be re-created
      // before any fill-pattern layer is added back.
      ensureHatchImage(m);
      addRustBeltLayers(m, dataRef.current);
      applyMargin(m, { measure, showLowN });
      setStateLabels(m, belt);
      applyUnit(m, unit);
      applySelection(m, unit, selectedId);
      // Deliberately NOT re-binding interactions: layer-scoped map.on handlers
      // live on the Map, not the style, so they survive setStyle.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  const flyToState = (fips) => {
    setSelectedId(unit === "states" ? fips : selectedId);
    const s = belt?.byFips.get(fips);
    if (s?.cx != null && mapRef.current) {
      mapRef.current.easeTo({ center: [s.cx, s.cy], zoom: 5.4, duration: 900 });
    }
  };

  const selectedState = selectedId
    ? belt?.byFips.get(unit === "states" ? selectedId : String(selectedId).slice(0, 2))
    : null;

  return (
    <div className="relative h-screen w-screen">
      <div ref={mapContainer} className="absolute inset-0" />

      {ready && !error ? (
        <>
          <div className="pointer-events-none absolute top-4 left-4 z-10 flex max-h-[calc(100vh-2rem)] w-[min(21rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto">
            <RustBeltControls
              categories={categories}
              sunTotals={sunTotals}
              rates={rates}
              measure={measure}
              onMeasure={setMeasure}
              unit={unit}
              onUnit={setUnit}
              showLowN={showLowN}
              onShowLowN={setShowLowN}
              basemap={basemap}
              onBasemap={setBasemapKey}
              accentColor={accentColor}
              countiesReady={countiesReady}
            />
            <BlocPanel
              belt={belt}
              blocShare={beltAll?.rollup.share}
              rates={rates}
              measure={measure}
              onMeasure={setMeasure}
              colorOf={colorOf}
              selectedFips={selectedState?.fips}
              onSelectState={flyToState}
            />
          </div>

          <Counter meta={totals.meta} />
          <MarginLegend
            unit={unit}
            measureLabel={measure || "Rust Belt (9)"}
            showLowN={showLowN}
          />
        </>
      ) : null}

      {!ready && !error ? (
        <div className="absolute top-4 left-4 rounded-lg bg-white/95 px-3 py-2 text-sm shadow">
          Loading map data…
        </div>
      ) : null}
      {ready && !countiesReady && !error ? (
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
