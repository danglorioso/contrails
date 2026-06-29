import { NextResponse } from "next/server";
import { getAllFlights } from "@/lib/flightStorage";

export async function GET() {
  try {
    const flights = await getAllFlights();
    return NextResponse.json(flights);
  } catch {
    return NextResponse.json({ error: "Failed to load flights" }, { status: 500 });
  }
}
