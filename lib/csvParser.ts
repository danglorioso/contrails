import Papa from "papaparse";

interface RawRow {
  Timestamp: string;
  UTC: string;
  Callsign: string;
  Position: string;
  Altitude: string;
  Speed: string;
  Direction: string;
}

export interface ParsedFlight {
  callsign: string;
  coordinates: [number, number, number][]; // [lon, lat, altMeters]
}

const FEET_TO_METERS = 0.3048;

export function parseFlightRadar24CSV(csvText: string): ParsedFlight {
  // FlightRadar24 export is tab-separated
  const result = Papa.parse<RawRow>(csvText.trim(), {
    header: true,
    delimiter: "\t",
    skipEmptyLines: true,
  });

  // Fall back to comma-separated if no Position column found
  let rows = result.data;
  if (rows.length === 0 || !rows[0]?.Position) {
    const result2 = Papa.parse<RawRow>(csvText.trim(), {
      header: true,
      delimiter: ",",
      skipEmptyLines: true,
    });
    rows = result2.data;
  }

  if (rows.length === 0) {
    throw new Error("No data found in CSV");
  }

  const callsign = rows[0]?.Callsign?.trim() || "Unknown";
  const coordinates: [number, number, number][] = [];

  for (const row of rows) {
    const pos = row.Position?.trim();
    if (!pos) continue;

    const parts = pos.replace(/"/g, "").split(",");
    if (parts.length < 2) continue;

    const lat = parseFloat(parts[0].trim());
    const lon = parseFloat(parts[1].trim());
    if (isNaN(lat) || isNaN(lon)) continue;

    const altFt = parseFloat(row.Altitude) || 0;
    const altMeters = altFt * FEET_TO_METERS;

    coordinates.push([lon, lat, altMeters]);
  }

  if (coordinates.length === 0) {
    throw new Error("No valid GPS coordinates found in CSV");
  }

  return { callsign, coordinates };
}
