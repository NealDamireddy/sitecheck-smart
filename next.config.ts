import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Emit a self-contained server bundle in .next/standalone (CLD-01).
   * Required to run the app in a container without shipping node_modules;
   * Vercel ignores it, so this costs nothing on the current host.
   */
  output: "standalone",

  /**
   * Supabase Storage serves photos from the project's own domain, which
   * varies per environment — read it from the configured URL rather than
   * hardcoding a hostname (CLD-03).
   */
  images: {
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [
          {
            protocol: "https",
            hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
            pathname: "/storage/v1/object/**",
          },
        ]
      : [],
  },

  /** Surfaced by /api/health so a running container is traceable to a build. */
  env: {
    APP_COMMIT_SHA: process.env.APP_COMMIT_SHA ?? "unknown",
    APP_BUILD_TIME: process.env.APP_BUILD_TIME ?? "unknown",
  },
};

export default nextConfig;
