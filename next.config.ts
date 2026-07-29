import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phone / LAN access in Next.js 16 dev (cross-origin)
  allowedDevOrigins: ["192.168.43.52"],
};

export default nextConfig;
