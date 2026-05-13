import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to the directory of this config file
  // so it doesn't walk up the filesystem looking for the nearest lockfile.
  // Use process.cwd() instead of __dirname — __dirname is unreliable in
  // ESM-style next.config.ts under recent Next.js versions and can resolve
  // to the project's parent directory, which then mis-anchors PostCSS /
  // Tailwind's module resolution.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
