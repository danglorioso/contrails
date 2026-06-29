import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const DATA_DIR = path.join(process.cwd(), "data", "flights");

export interface FlightData {
  id: string;
  name: string;
  callsign: string;
  uploadedAt: string;
  coordinates: [number, number, number][]; // [lon, lat, altMeters]
  timestamps: number[]; // unix seconds, parallel to coordinates
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function saveFlightData(
  data: Omit<FlightData, "id">
): Promise<FlightData> {
  await ensureDataDir();
  const id = uuidv4();
  const flight: FlightData = { id, ...data };
  await fs.writeFile(
    path.join(DATA_DIR, `${id}.json`),
    JSON.stringify(flight)
  );
  return flight;
}

export async function getAllFlights(): Promise<FlightData[]> {
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const flights = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const content = await fs.readFile(path.join(DATA_DIR, f), "utf-8");
        return JSON.parse(content) as FlightData;
      })
  );
  return flights.sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
}

export async function deleteFlight(id: string): Promise<void> {
  // Validate id is a UUID to prevent path traversal
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    throw new Error("Invalid flight ID");
  }
  await fs.unlink(path.join(DATA_DIR, `${id}.json`));
}
