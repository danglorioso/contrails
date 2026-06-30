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
  timestamps?: number[];
}

function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function totalDistanceKm(coords: [number, number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return total;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDistance(km: number): string {
  if (km < 100) return `${Math.round(km)} km`;
  return `${Math.round(km).toLocaleString()} km`;
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);

  const viewStateRef = useRef(viewState);
  const rightDragRef = useRef<{ startY: number; startPitch: number } | null>(null);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    setIsTouch(window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  }, []);

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
      e.stopPropagation(); // prevent deck.gl canvas from seeing right-click drag
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!rightDragRef.current) return;
      const { startY, startPitch } = rightDragRef.current;
      const dy = startY - e.clientY; // drag up = more pitch
      const newPitch = Math.max(0, Math.min(85, startPitch + dy * 0.4));
      setViewState((vs) => ({ ...vs, pitch: newPitch, transitionDuration: 0 }));
      setIs3D(newPitch > 5);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) rightDragRef.current = null;
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    // Capture phase so we intercept before deck.gl's canvas sees the event
    window.addEventListener("mousedown", onMouseDown, { capture: true });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onContextMenu);

    return () => {
      window.removeEventListener("mousedown", onMouseDown, { capture: true });
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
    <div className="relative w-full bg-black select-none overflow-hidden" style={{ height: "100dvh" }}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => {
          const next = vs as MapViewState;
          const pitch = Math.max(0, Math.min(85, next.pitch ?? 0));
          setViewState({ ...next, pitch });
          setIs3D(pitch > 5);
        }}
        controller={true}
        layers={layers}
        pickingRadius={8}
        onHover={(info) => {
          if (info.layer) {
            const flightId = (info.layer.id as string).replace("flight-", "");
            setHoveredId(flightId);
            setHoverPos({ x: info.x, y: info.y });
          } else {
            setHoveredId(null);
            setHoverPos(null);
          }
        }}
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

      {/* Hover tooltip — follows cursor, desktop only */}
      {!isTouch && hoveredId && hoverPos && hoveredId !== selectedId && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{ left: hoverPos.x + 12, top: hoverPos.y - 36 }}
        >
          <div className="bg-black/80 backdrop-blur-sm text-gray-200 text-xs font-mono px-2.5 py-1.5 rounded-lg border border-white/10 shadow-lg whitespace-nowrap">
            {flights.find((f) => f.id === hoveredId)?.callsign}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        {/* Title row */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className="text-white font-bold tracking-[0.35em] text-lg"
              style={{ textShadow: "0 0 20px rgba(64,196,255,0.5)" }}
            >
              CONTRAILS
            </span>
            {/* Desktop sidebar toggle */}
            {flights.length > 0 && !loading && (
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                className="pointer-events-auto hidden sm:inline-flex text-xs transition-colors px-2 py-1 rounded-lg"
                style={{ color: sidebarOpen ? "#9ca3af" : "#6b7280" }}
              >
                {flights.length} flight{flights.length !== 1 ? "s" : ""}
              </button>
            )}
          </div>
          {/* Mobile: compass + 2D/3D in top bar */}
          <div className="flex sm:hidden items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setViewState((vs) => ({ ...vs, bearing: 0 }))}
              title="Reset to north"
              className="w-9 h-9 flex items-center justify-center bg-black/70 backdrop-blur-md rounded-full border border-gray-800/80"
            >
              <svg viewBox="0 0 32 32" width="18" height="18" overflow="visible">
                <g
                  style={{
                    transform: `rotate(${-(viewState.bearing ?? 0)}deg)`,
                    transformOrigin: "16px 16px",
                  }}
                >
                  <polygon points="16,3 19.5,16 16,13.5 12.5,16" fill="#ef4444" />
                  <polygon points="16,29 19.5,16 16,18.5 12.5,16" fill="#374151" />
                </g>
              </svg>
            </button>
            <button
              onClick={toggle3D}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold tracking-wide transition-all backdrop-blur-sm ${
                is3D
                  ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
                  : "bg-black/70 border-gray-700 text-gray-400"
              }`}
            >
              {is3D ? "3D" : "2D"}
            </button>
          </div>
        </div>

        {/* Mobile horizontal flight chip strip */}
        {flights.length > 0 && !loading && (
          <div className="sm:hidden pb-3 px-1 pointer-events-auto">
            <div
              className="flex gap-2 px-3 overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {flights.map((flight, index) => {
                const color = FLIGHT_COLORS[index % FLIGHT_COLORS.length];
                const isSelected = selectedId === flight.id;
                return (
                  <button
                    key={flight.id}
                    onClick={() => {
                      setSelectedId(isSelected ? null : flight.id);
                      setTooltip(null);
                    }}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap transition-all backdrop-blur-md ${
                      isSelected
                        ? "bg-white/15 border-white/20 text-white"
                        : "bg-black/70 border-gray-800/80 text-gray-400"
                    }`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: `rgb(${color.join(",")})`,
                        boxShadow: isSelected
                          ? `0 0 4px rgb(${color.join(",")})`
                          : "none",
                      }}
                    />
                    {flight.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Flight list sidebar */}
      {flights.length > 0 && (
        <div
          className={`absolute left-4 top-16 z-20 bg-black/75 backdrop-blur-md rounded-2xl border border-gray-800/80 p-3 max-h-[55vh] overflow-y-auto transition-all duration-200 origin-top-left w-52 sm:w-56 ${
            sidebarOpen
              ? "opacity-100 scale-100 pointer-events-auto"
              : "opacity-0 scale-95 pointer-events-none"
          }`}
        >
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
      {selected && (() => {
        const distKm = totalDistanceKm(selected.coordinates);
        const ts = selected.timestamps;
        const durationSec =
          ts && ts.length >= 2 ? ts[ts.length - 1] - ts[0] : null;
        const maxAltFt = Math.round(
          Math.max(...selected.coordinates.map(([, , a]) => a)) * 3.28084
        );
        return (
          <div
            className="absolute z-10 bg-black/80 backdrop-blur-md border border-gray-800/80 p-4 left-0 right-0 bottom-0 rounded-t-2xl sm:left-4 sm:right-auto sm:bottom-24 sm:w-56 sm:rounded-2xl"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)" }}
          >
            <div className="flex items-start justify-between mb-3 sm:block">
              <p className="text-white text-sm font-semibold truncate">
                {selected.name}
              </p>
              <button
                className="sm:hidden ml-3 flex-shrink-0 text-gray-500 active:text-white text-base leading-none"
                onClick={() => { setSelectedId(null); setTooltip(null); }}
              >
                ✕
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-gray-600 text-[10px] uppercase tracking-wider">Distance</span>
                <span className="text-gray-300 text-xs font-mono">{formatDistance(distKm)}</span>
              </div>
              {durationSec !== null && (
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-600 text-[10px] uppercase tracking-wider">Duration</span>
                  <span className="text-gray-300 text-xs font-mono">{formatDuration(durationSec)}</span>
                </div>
              )}
              {is3D && maxAltFt > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-600 text-[10px] uppercase tracking-wider">Max Alt</span>
                  <span className="text-gray-300 text-xs font-mono">{maxAltFt.toLocaleString()} ft</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-1 border-t border-gray-800">
                <span className="text-gray-600 text-[10px] uppercase tracking-wider">Callsign</span>
                <span className="text-gray-300 text-xs font-mono">{selected.callsign}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Controls — bottom right (desktop only) */}
      <div className="hidden sm:flex absolute right-4 z-10 flex-col items-end gap-2" style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {/* Compass — rotates with bearing, click resets to north */}
            <button
              onClick={() => setViewState((vs) => ({ ...vs, bearing: 0 }))}
              title="Reset to north"
              className="w-10 h-10 flex items-center justify-center bg-black/75 backdrop-blur-md rounded-full border border-gray-800/80 hover:border-gray-600 transition-colors"
            >
              <svg viewBox="0 0 32 32" width="22" height="22" overflow="visible">
                <g
                  style={{
                    transform: `rotate(${-(viewState.bearing ?? 0)}deg)`,
                    transformOrigin: "16px 16px",
                  }}
                >
                  <polygon points="16,3 19.5,16 16,13.5 12.5,16" fill="#ef4444" />
                  <polygon points="16,29 19.5,16 16,18.5 12.5,16" fill="#374151" />
                </g>
              </svg>
            </button>

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
          </div>

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
                min={1}
                max={120}
                value={verticalScale}
                onChange={(e) => setVerticalScale(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-blue-400"
              />
              <div className="flex justify-between mt-1">
                <span className="text-gray-700 text-[10px]">1×</span>
                <span className="text-gray-700 text-[10px]">120×</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 bg-black flex items-center justify-center z-20">
          <p
            className="text-white text-2xl font-bold tracking-[0.35em] animate-pulse"
            style={{ textShadow: "0 0 30px rgba(64,196,255,0.6)" }}
          >
            CONTRAILS
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && flights.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="text-gray-600 text-sm">No flights yet</p>
        </div>
      )}
    </div>
  );
}
