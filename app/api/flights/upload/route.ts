import { NextRequest, NextResponse } from "next/server";
import { parseFlightRadar24CSV } from "@/lib/csvParser";
import { saveFlightData } from "@/lib/flightStorage";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string | null;

    if (!file || !name?.trim()) {
      return NextResponse.json(
        { error: "Flight name and CSV file are required" },
        { status: 400 }
      );
    }

    const csvText = await file.text();
    const parsed = parseFlightRadar24CSV(csvText);

    const flight = await saveFlightData({
      name: name.trim(),
      callsign: parsed.callsign,
      uploadedAt: new Date().toISOString(),
      coordinates: parsed.coordinates,
    });

    return NextResponse.json(flight);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
