import { useEffect, useMemo, useRef, useState } from "react";
import * as h3 from "h3-js";
import { createMap, setBasemap } from "../map.js";
import { DEFAULT_BASEMAP } from "../config.js";
import Counter from "../components/Counter.jsx";
import {
  addContestedLayers, applyContest, bindContestedInteractions, setCells,
} from "./contestedMap.js";
import { analyze, toFeatureCollection } from "./contest.js";
import ContestControls from "./ui/ContestControls.jsx";
import ExtremesPanel from "./ui/ExtremesPanel.jsx";
import ContestLegend from "./ui/ContestLegend.jsx";

const DEFAULT_RES = 4;
const DEFAULT_MIN_N = 50;

export default function Contested() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const popupStateRef = useRef({});
  const unbindRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [totals, setTotals] = useState({ meta: null });

  const [resolution, setResolution] = useState(DEFAULT_RES);
  const [minN, setMinN] = useState(DEFAULT_MIN_N);
  const [basemap, setBasemapKey] = useState(DEFAULT_BASEMAP);

  const colorOf = useMemo(() => {
    const byName = new Map(categories.map((c) => [c.short_name, c.primary_color]));
    return (team) => byName.get(team) || "#9ca3af";
  }, [categories]);

  const view = useMemo(
    () => (data ? analyze(data.resolutions[resolution], minN) : null),
    [data, resolution, minN],
  );

  // Rebuilt on resolution change (new tessellation) and on threshold change
  // (`scored` rides on each feature, so the paint filters can stay declarative).
  const fc = useMemo(
    () => (view ? toFeatureCollection(view.cells, minN) : null),
    [view, minN],
  );

  // --- mount -----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [contest, cats, tot] = await Promise.all([
          fetch("/data/h3_contest.json").then((r) => r.json()),
          fetch("/data/category_a.json").then((r) => r.json()),
          fetch("/data/totals.json").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setData(contest);
        setCategories(cats);
        setTotals(tot);

        const map = createMap(mapContainer.current);
        mapRef.current = map;
        if (import.meta.env.DEV) window.__hexmap = map;

        map.on("load", () => {
          if (cancelled) return;
          addContestedLayers(map, null); // real cells arrive via the paint effect
          unbindRef.current = bindContestedInteractions(map, () => popupStateRef.current);
          setReady(true);
        });
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
    if (!ready || !fc || !view) return;
    setCells(mapRef.current, fc);
    applyContest(mapRef.current, {
      domain: view.domain,
      extremes: [view.mostContested?.h, view.mostUniform?.h],
    });
  }, [ready, fc, view]);

  useEffect(() => {
    popupStateRef.current = { colorOf, minN };
  }, [colorOf, minN]);

  // --- basemap ---------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    setBasemap(mapRef.current, basemap, (m) => {
      addContestedLayers(m, fc);
      applyContest(m, {
        domain: view.domain,
        extremes: [view.mostContested?.h, view.mostUniform?.h],
      });
      // Deliberately NOT re-binding interactions: layer-scoped map.on handlers
      // live on the Map, not the style, so they survive setStyle.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  const flyTo = (cell) => {
    const [lat, lng] = h3.cellToLatLng(cell.h);
    mapRef.current?.easeTo({ center: [lng, lat], zoom: resolution >= 5 ? 9 : 7.2, duration: 900 });
  };

  return (
    <div className="relative h-screen w-screen">
      <div ref={mapContainer} className="absolute inset-0" />

      {ready && view && !error ? (
        <>
          <ContestControls
            resolution={resolution}
            onResolution={setResolution}
            minN={minN}
            onMinN={setMinN}
            basemap={basemap}
            onBasemap={setBasemapKey}
            meta={data.meta}
            scored={view.scored.length}
            kept={view.cells.length}
          />
          <Counter meta={totals.meta} />
          <ExtremesPanel
            mostContested={view.mostContested}
            mostUniform={view.mostUniform}
            domain={view.domain}
            scored={view.scored}
            colorOf={colorOf}
            onGo={flyTo}
          />
          <ContestLegend
            domain={view.domain}
            teams={data.meta.teams}
            minN={minN}
            lowN={view.cells.length - view.scored.length}
          />
        </>
      ) : null}

      {!ready && !error ? (
        <div className="absolute top-4 left-4 rounded-lg bg-white/95 px-3 py-2 text-sm shadow">
          Loading hexagons…
        </div>
      ) : null}
      {error ? (
        <div className="absolute top-4 left-4 max-w-md rounded-lg bg-white/95 px-3 py-2 text-sm text-red-800 shadow">
          Error loading map: {error}
        </div>
      ) : null}
    </div>
  );
}
