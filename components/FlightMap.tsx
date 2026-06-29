"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import DeckGL from "@deck.gl/react";
import { PathLayer } from "@deck.gl/layers";
import type { MapViewState } from "@deck.gl/core";
import { WebMercatorViewport } from "@deck.gl/core";
import Map from "react-map-gl/maplibre";

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const FLIGHT_COLORS: [number, number, number][] = [
  [64, 196, 255],
  [255, 100, 100],
  [80, 255, 160],
  [255, 210, 60],
  [200, 100, 255],
  [255, 140, 50],
  [100, 240, 255],
  [255, 100, 190],
  [160, 255, 100],
  [120, 140, 255],
];

interface FlightData {
  id: string;
  name: string;
  callsign: string;
  uploadedAt: string;
  coordinates: [number, number, number][];
}

const INITIAL_VIEW: MapViewState = {
  longitude: -30,
  latitude: 35,
  zoom: 2.5,
  pitch: 50,
  bearing: 0,
};

function fitBoundsToFlights(flights: FlightData[]): MapViewState {
  const allCoords = flights.flatMap((f) => f.coordinates);
  if (allCoords.length === 0) return INITIAL_VIEW;

  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of allCoords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const vp = new WebMercatorViewport({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  try {
    const { longitude, latitude, zoom } = vp.fitBounds(
      [[minLon, minLat], [maxLon, maxLat]],
      { padding: 80 }
    );
    return { ...INITIAL_VIEW, longitude, latitude, zoom: Math.min(zoom, 9) };
  } catch {
    return INITIAL_VIEW;
  }
}

export default function FlightMap() {
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [is3D, setIs3D] = useState(true);
  const [verticalScale, setVerticalScale] = useState(40);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; callsign: string } | null>(null);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);

  const viewStateRef = useRef(viewState);
  const rightDragRef = useRef<{ startY: number; startPitch: number } | null>(null);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    fetch("/api/flights")
      .then((r) => r.json())
      .then((data: FlightData[]) => {
        setFlights(data);
        setLoading(false);
        if (data.length > 0) {
          setViewState(fitBoundsToFlights(data));
        }
      })
      .catch(() => setLoading(false));
  }, []);

  // Right-click drag → pitch control (Apple Maps style)
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return;
      rightDragRef.current = {
        startY: e.clientY,
        startPitch: viewStateRef.current.pitch ?? 50,
      };
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!rightDragRef.current) return;
      const { startY, startPitch } = rightDragRef.current;
      const dy = startY - e.clientY; // drag up = more pitch
      const newPitch = Math.max(0, Math.min(60, startPitch + dy * 0.4));
      setViewState((vs) => ({ ...vs, pitch: newPitch }));
      setIs3D(newPitch > 5);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) rightDragRef.current = null;
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onContextMenu);

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  const toggle3D = useCallback(() => {
    setIs3D((prev) => {
      const next = !prev;
      setViewState((vs) => ({ ...vs, pitch: next ? 50 : 0 }));
      return next;
    });
  }, []);

  const layers = flights.map((flight, index) => {
    const color = FLIGHT_COLORS[index % FLIGHT_COLORS.length];
    const isSelected = selectedId === flight.id;
    const alpha = selectedId ? (isSelected ? 255 : 50) : 210;

    const path = flight.coordinates.map(
      ([lon, lat, alt]) =>
        [lon, lat, is3D ? alt * verticalScale : 0] as [number, number, number]
    );

    return new PathLayer({
      id: `flight-${flight.id}`,
      data: [{ path }],
      getPath: (d) => d.path,
      getColor: () => [...color, alpha] as [number, number, number, number],
      getWidth: isSelected ? 5 : 2.5,
      widthMinPixels: isSelected ? 3 : 1.5,
      pickable: true,
      onClick: (info) => {
        const nowSelected = !isSelected;
        setSelectedId(nowSelected ? flight.id : null);
        if (nowSelected) {
          setTooltip({ x: info.x, y: info.y, callsign: flight.callsign });
        } else {
          setTooltip(null);
        }
      },
    });
  });

  const selected = flights.find((f) => f.id === selectedId);

  return (
    <div className="relative w-full h-screen bg-black select-none">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => {
          setViewState(vs as MapViewState);
          // Keep is3D in sync when pitch changes via built-in controls
          const pitch = (vs as MapViewState).pitch ?? 0;
          setIs3D(pitch > 5);
        }}
        controller={true}
        layers={layers}
        // Clear tooltip and selection when clicking empty space
        onClick={(info) => {
          if (!info.object) {
            setSelectedId(null);
            setTooltip(null);
          }
        }}
        getCursor={({ isDragging, isHovering }) =>
          isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
        }
      >
        <Map mapStyle={MAP_STYLE} reuseMaps />
      </DeckGL>

      {/* Callsign tooltip — follows click position */}
      {tooltip && selectedId && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 36 }}
        >
          <div className="bg-black/90 backdrop-blur-sm text-white text-xs font-mono font-semibold px-2.5 py-1.5 rounded-lg border border-white/10 shadow-lg whitespace-nowrap">
            {tooltip.callsign}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4 z-10 pointer-events-none">
        <div className="flex items-center gap-3">
          <span
            className="text-white font-bold tracking-[0.35em] text-lg"
            style={{ textShadow: "0 0 20px rgba(64,196,255,0.5)" }}
          >
            CONTRAIL
          </span>
          {flights.length > 0 && !loading && (
            <span className="text-gray-500 text-xs">
              {flights.length} flight{flights.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <a
          href="/admin"
          className="pointer-events-auto text-gray-500 hover:text-gray-200 text-sm transition-colors px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-600 bg-black/60 backdrop-blur-sm"
        >
          Admin
        </a>
      </div>

      {/* Flight list sidebar */}
      {flights.length > 0 && (
        <div className="absolute left-4 top-16 z-10 bg-black/75 backdrop-blur-md rounded-2xl border border-gray-800/80 p-3 w-56 max-h-[55vh] overflow-y-auto">
          <p className="text-gray-600 text-[10px] uppercase tracking-[0.15em] font-medium mb-2.5 px-1">
            Flights
          </p>
          {flights.map((flight, index) => {
            const color = FLIGHT_COLORS[index % FLIGHT_COLORS.length];
            const isSelected = selectedId === flight.id;
            return (
              <button
                key={flight.id}
                onClick={() => {
                  if (isSelected) {
                    setSelectedId(null);
                    setTooltip(null);
                  } else {
                    setSelectedId(flight.id);
                    setTooltip(null); // no position from sidebar click
                  }
                }}
                className={`w-full text-left flex items-center gap-2.5 py-2 px-2 rounded-xl transition-all mb-0.5 ${
                  isSelected ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: `rgb(${color.join(",")})`,
                    boxShadow: isSelected
                      ? `0 0 6px rgb(${color.join(",")})`
                      : "none",
                  }}
                />
                <div className="min-w-0">
                  <p className="text-white text-xs font-medium truncate leading-tight">
                    {flight.name}
                  </p>
                  <p className="text-gray-600 text-[10px] mt-0.5">
                    {flight.callsign}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected flight info */}
      {selected && (
        <div className="absolute left-4 bottom-24 z-10 bg-black/75 backdrop-blur-md rounded-2xl border border-gray-800/80 p-4 w-56">
          <p className="text-white text-sm font-semibold mb-1 truncate">
            {selected.name}
          </p>
          <p className="text-gray-500 text-xs">
            {selected.callsign} ·{" "}
            {selected.coordinates.length.toLocaleString()} pts
          </p>
          {is3D && (
            <p className="text-gray-500 text-xs mt-1">
              Max alt:{" "}
              {Math.round(
                Math.max(...selected.coordinates.map(([, , a]) => a)) * 3.28084
              ).toLocaleString()}{" "}
              ft
            </p>
          )}
        </div>
      )}

      {/* Controls — bottom right */}
      <div className="absolute right-4 bottom-6 z-10 flex flex-col items-end gap-2">
        {is3D && (
          <div className="bg-black/75 backdrop-blur-md rounded-2xl border border-gray-800/80 p-3.5 w-52">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-gray-400 text-xs">Altitude scale</span>
              <span className="text-blue-300 text-xs font-mono tabular-nums">
                {verticalScale}×
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={120}
              value={verticalScale}
              onChange={(e) => setVerticalScale(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-blue-400"
            />
            <div className="flex justify-between mt-1">
              <span className="text-gray-700 text-[10px]">5×</span>
              <span className="text-gray-700 text-[10px]">120×</span>
            </div>
          </div>
        )}

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={toggle3D}
            className={`px-5 py-2.5 rounded-xl border text-sm font-semibold tracking-wide transition-all backdrop-blur-sm ${
              is3D
                ? "bg-blue-500/15 border-blue-500/40 text-blue-300 hover:bg-blue-500/25"
                : "bg-black/75 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
            }`}
          >
            {is3D ? "3D" : "2D"}
          </button>
          <span className="text-gray-700 text-[10px] pr-0.5">
            right-drag to tilt
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-20">
          <div className="text-center">
            <p
              className="text-white text-2xl font-bold tracking-[0.35em] mb-3 animate-pulse"
              style={{ textShadow: "0 0 30px rgba(64,196,255,0.6)" }}
            >
              CONTRAIL
            </p>
            <p className="text-gray-600 text-sm">Loading your flights…</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && flights.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center">
            <p className="text-gray-500 text-base mb-3">No flights yet</p>
            <a
              href="/admin"
              className="pointer-events-auto text-blue-400 hover:text-blue-300 text-sm transition-colors underline underline-offset-4"
            >
              Upload your first flight →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
