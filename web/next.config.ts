import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Static export — FastAPI serves the resulting `out/` directory at /
  output: "export",
  // Trailing slash so directory-style URLs (e.g. /dashboard/) resolve to
  // index.html files under FastAPI's StaticFiles mount.
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;
