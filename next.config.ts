import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "deck.gl",
    "@deck.gl/core",
    "@deck.gl/layers",
    "@deck.gl/react",
    "@deck.gl/geo-layers",
    "@deck.gl/aggregation-layers",
    "@luma.gl/core",
    "@luma.gl/webgl",
    "@luma.gl/engine",
    "@luma.gl/shadertools",
    "@loaders.gl/core",
    "@loaders.gl/images",
    "react-map-gl",
    "maplibre-gl",
  ],
};

export default nextConfig;
