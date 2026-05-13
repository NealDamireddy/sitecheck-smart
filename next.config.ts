import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next.js doesn't walk up to /Users/<you>/
  // and pick the stray package-lock.json sitting there. Without this,
  // Turbopack mis-infers the project root and every route 404s.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
