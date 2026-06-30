import { neon } from "@neondatabase/serverless";

export interface FlightData {
  id: string;
  name: string;
  callsign: string;
  uploadedAt: string;
  coordinates: [number, number, number][]; // [lon, lat, altMeters]
  timestamps: number[]; // unix seconds, parallel to coordinates
}

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return neon(process.env.DATABASE_URL);
}

export async function getAllFlights(): Promise<FlightData[]> {
  const rows = await db()`
    SELECT id, name, callsign, uploaded_at, coordinates, timestamps
    FROM flights
    ORDER BY (timestamps->0)::bigint ASC
  `;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    callsign: r.callsign as string,
    uploadedAt: r.uploaded_at as string,
    coordinates: r.coordinates as [number, number, number][],
    timestamps: r.timestamps as number[],
  }));
}

export async function saveFlightData(
  data: Omit<FlightData, "id">
): Promise<FlightData> {
  const [row] = await db()`
    INSERT INTO flights (name, callsign, uploaded_at, coordinates, timestamps)
    VALUES (
      ${data.name},
      ${data.callsign},
      ${data.uploadedAt},
      ${JSON.stringify(data.coordinates)},
      ${JSON.stringify(data.timestamps)}
    )
    RETURNING id, name, callsign, uploaded_at, coordinates, timestamps
  `;
  return {
    id: row.id as string,
    name: row.name as string,
    callsign: row.callsign as string,
    uploadedAt: row.uploaded_at as string,
    coordinates: row.coordinates as [number, number, number][],
    timestamps: row.timestamps as number[],
  };
}

export async function deleteFlight(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid flight ID");
  await db()`DELETE FROM flights WHERE id = ${id}`;
}
