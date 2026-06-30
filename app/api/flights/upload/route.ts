import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { parseFlightRadar24CSV } from "@/lib/csvParser";
import { saveFlightData } from "@/lib/flightStorage";

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = await getToken({ req: req as any, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      timestamps: parsed.timestamps,
    });

    return NextResponse.json(flight);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
