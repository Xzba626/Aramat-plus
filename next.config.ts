import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portable Node server (Docker / VPS). Vercel also accepts standalone.
  output: "standalone",
  // Allow phone / LAN access in Next.js 16 dev (cross-origin)
  allowedDevOrigins: ["192.168.43.52", "127.0.0.1", "localhost"],
  // Keep sharp as native external (avoid dual-bundle with Next's sharp)
  serverExternalPackages: ["sharp"],
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      /**
       * Report-Only CSP: observe without breaking Next inline theme bootstrap / SW.
       * Tighten to enforcing after Contabo report review.
       */
      {
        key: "Content-Security-Policy-Report-Only",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "worker-src 'self' blob:",
          "frame-ancestors 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
        ].join("; "),
      },
    ];
    const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "";
    if (authUrl.startsWith("https://")) {
      security.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [
      {
        source: "/:path*",
        headers: security,
      },
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
