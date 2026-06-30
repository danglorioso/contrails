"use client";

import { useState, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

interface Flight {
  id: string;
  name: string;
  callsign: string;
  uploadedAt: string;
  coordinates: [number, number, number][];
}

function buildFlightName(from: string, to: string, date: string): string {
  const parts = [
    from.trim().toUpperCase(),
    "→",
    to.trim().toUpperCase(),
  ];
  if (date) {
    const d = new Date(date + "T12:00:00"); // noon to avoid timezone shift
    parts.push(
      "·",
      d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    );
  }
  return parts.join(" ");
}

export default function AdminPage() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fromAirport, setFromAirport] = useState("");
  const [toAirport, setToAirport] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFlights = async () => {
    const res = await fetch("/api/flights");
    if (res.ok) setFlights(await res.json());
  };

  useEffect(() => {
    loadFlights();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !fromAirport.trim() || !toAirport.trim()) {
      setError("Departure airport, arrival airport, and CSV file are required");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    const name = buildFlightName(fromAirport, toAirport, flightDate);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);

    const res = await fetch("/api/flights/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      setSuccess(`Uploaded: ${name}`);
      setFile(null);
      setFromAirport("");
      setToAirport("");
      setFlightDate("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadFlights();
    } else {
      const data = await res.json();
      setError(data.error || "Upload failed");
    }

    setUploading(false);
  };

  const handleDelete = async (id: string, flightName: string) => {
    if (!confirm(`Delete "${flightName}"? This cannot be undone.`)) return;
    setDeletingId(id);
    const res = await fetch(`/api/flights/${id}`, { method: "DELETE" });
    if (res.ok) await loadFlights();
    setDeletingId(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const namePreview =
    fromAirport.trim() && toAirport.trim()
      ? buildFlightName(fromAirport, toAirport, flightDate)
      : null;

  return (
    <div className="min-h-screen bg-black text-white" style={{ overflow: "auto" }}>
      {/* Header */}
      <div className="border-b border-gray-900 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 bg-black z-10">
        <div className="flex items-center gap-5">
          <a
            href="/"
            className="text-gray-500 hover:text-white text-sm transition-colors"
          >
            ← Map
          </a>
          <span className="text-gray-800">|</span>
          <h1 className="text-sm font-bold tracking-[0.2em] text-gray-300">
            CONTRAILS / ADMIN
          </h1>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-gray-600 hover:text-gray-300 text-sm transition-colors"
        >
          Sign out
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Upload form */}
        <section className="mb-12">
          <h2 className="text-white font-semibold text-lg mb-1">Upload Flight</h2>
          <p className="text-gray-600 text-sm mb-5">
            Export the flight playback CSV from FlightRadar24 (tab-separated:
            Timestamp, UTC, Callsign, Position, Altitude, Speed, Direction).
          </p>

          <form
            onSubmit={handleUpload}
            className="bg-gray-950 rounded-2xl border border-gray-900 p-6 space-y-4"
          >
            {/* Airport row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 sm:contents">
                <div className="flex-1">
                  <label className="block text-gray-400 text-sm mb-1.5">From</label>
                  <input
                    type="text"
                    value={fromAirport}
                    onChange={(e) => setFromAirport(e.target.value)}
                    placeholder="BOS"
                    maxLength={4}
                    className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-700 uppercase focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm tracking-widest"
                  />
                </div>
                <span className="text-gray-600 mt-6 flex-shrink-0">→</span>
                <div className="flex-1">
                  <label className="block text-gray-400 text-sm mb-1.5">To</label>
                  <input
                    type="text"
                    value={toAirport}
                    onChange={(e) => setToAirport(e.target.value)}
                    placeholder="LAX"
                    maxLength={4}
                    className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-700 uppercase focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm tracking-widest"
                  />
                </div>
              </div>
              <div className="sm:flex-1">
                <label className="block text-gray-400 text-sm mb-1.5">Date</label>
                <input
                  type="date"
                  value={flightDate}
                  onChange={(e) => setFlightDate(e.target.value)}
                  className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
                  style={{ colorScheme: "dark" }}
                />
              </div>
            </div>

            {/* Name preview */}
            {namePreview && (
              <p className="text-gray-500 text-xs pl-1">
                Will save as:{" "}
                <span className="text-gray-300 font-medium">{namePreview}</span>
              </p>
            )}

            {/* File input */}
            <div>
              <label className="block text-gray-400 text-sm mb-1.5">CSV File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-gray-400 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-gray-800 file:text-gray-300 file:text-sm hover:file:bg-gray-700"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-emerald-400 text-sm">{success}</p>}

            <button
              type="submit"
              disabled={uploading || !file || !fromAirport.trim() || !toAirport.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-2.5 font-medium transition-colors text-sm"
            >
              {uploading ? "Uploading…" : "Upload Flight"}
            </button>
          </form>
        </section>

        {/* Flight list */}
        <section>
          <h2 className="text-white font-semibold text-lg mb-5">
            Flights{" "}
            <span className="text-gray-600 font-normal text-base">
              ({flights.length})
            </span>
          </h2>

          {flights.length === 0 ? (
            <p className="text-gray-600 text-sm">No flights uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {flights.map((flight) => (
                <div
                  key={flight.id}
                  className="bg-gray-950 rounded-2xl border border-gray-900 px-5 py-4 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{flight.name}</p>
                    <p className="text-gray-600 text-sm mt-0.5">
                      {flight.callsign} ·{" "}
                      {flight.coordinates.length.toLocaleString()} pts ·{" "}
                      {formatDate(flight.uploadedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(flight.id, flight.name)}
                    disabled={deletingId === flight.id}
                    className="text-gray-700 hover:text-red-400 disabled:opacity-40 transition-colors text-sm ml-4 flex-shrink-0"
                  >
                    {deletingId === flight.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
