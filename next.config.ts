import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phone / LAN access in Next.js 16 dev (cross-origin)
  allowedDevOrigins: ["192.168.43.52"],
  // Keep sharp as native external (avoid dual-bundle with Next's sharp)
  serverExternalPackages: ["sharp"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
