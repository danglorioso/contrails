"use client";

import dynamic from "next/dynamic";

const FlightMap = dynamic(() => import("@/components/FlightMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen bg-black flex items-center justify-center">
      <p
        className="text-white text-2xl font-bold tracking-[0.35em] animate-pulse"
        style={{ textShadow: "0 0 30px rgba(64,196,255,0.6)" }}
      >
        CONTRAIL
      </p>
    </div>
  ),
});

export default function Home() {
  return <FlightMap />;
}
