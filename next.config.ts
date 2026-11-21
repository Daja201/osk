import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ikonu vývojového režimu („N“ vlevo dole) vypínáme: na mobilu ležela přes pole pro otázku.
  // Chyby při kompilaci a běhu Next.js ukáže i tak.
  devIndicators: false,
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
