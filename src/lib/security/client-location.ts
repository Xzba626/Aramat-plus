/**
 * Portable client IP + geolocation resolution.
 *
 * Login / activity journal must NOT know which host (Vercel, Cloudflare,
 * Nginx, Hetzner, …) provided the data. Swap or reorder providers here only.
 *
 * Default path: header-only (sync, no outbound HTTP).
 * Optional external Geo-IP is opt-in via env and never required for auth.
 */

import { clientIpFromHeaders } from "@/lib/security/client-fingerprint";

export type HeadersLike = Headers | { get(name: string): string | null };

export type ClientLocation = {
  ip: string | null;
  /** ISO country code or name when available */
  country: string | null;
  city: string | null;
  region: string | null;
  /** Provider id that filled geo fields (debug / audit only) */
  geoSource: string | null;
};

export type GeoHeaderProvider = {
  id: string;
  /** Sync header scrape only — never perform network I/O. */
  fromHeaders: (headers: HeadersLike) => {
    country?: string | null;
    city?: string | null;
    region?: string | null;
  };
};

function cleanGeo(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = decodeURIComponent(value.trim());
  if (!v) return null;
  // Placeholder / unknown markers from various edges
  if (/^(xx|unknown|null|undefined|n\/?a|-)$/i.test(v)) return null;
  return v;
}

/** Cloudflare CDN / proxy */
const cloudflareProvider: GeoHeaderProvider = {
  id: "cloudflare",
  fromHeaders: (h) => ({
    country: cleanGeo(h.get("cf-ipcountry")),
    city: cleanGeo(h.get("cf-ipcity")),
    region: cleanGeo(h.get("cf-region") ?? h.get("cf-region-code")),
  }),
};

/** Vercel edge (optional — one provider among many) */
const vercelProvider: GeoHeaderProvider = {
  id: "vercel",
  fromHeaders: (h) => ({
    country: cleanGeo(h.get("x-vercel-ip-country")),
    city: cleanGeo(h.get("x-vercel-ip-city")),
    region: cleanGeo(
      h.get("x-vercel-ip-country-region") ?? h.get("x-vercel-ip-region")
    ),
  }),
};

/**
 * Generic reverse-proxy / Nginx geo module headers.
 * Configure on VPS, e.g.:
 *   proxy_set_header X-Geo-Country $geoip2_data_country_code;
 *   proxy_set_header X-Geo-City    $geoip2_data_city_name;
 */
const nginxGeoProvider: GeoHeaderProvider = {
  id: "nginx",
  fromHeaders: (h) => ({
    country: cleanGeo(
      h.get("x-geo-country") ??
        h.get("x-country-code") ??
        h.get("x-appengine-country")
    ),
    city: cleanGeo(h.get("x-geo-city") ?? h.get("x-city")),
    region: cleanGeo(h.get("x-geo-region") ?? h.get("x-region")),
  }),
};

/** Fastly / other CDNs that expose country on a common header */
const fastlyProvider: GeoHeaderProvider = {
  id: "fastly",
  fromHeaders: (h) => ({
    country: cleanGeo(h.get("x-country-code") ?? h.get("fastly-client-country")),
    city: cleanGeo(h.get("client-geo-city")),
  }),
};

/**
 * Ordered header providers. First non-empty wins per field.
 * Reorder or add providers when moving hosts — journal code stays unchanged.
 */
export const GEO_HEADER_PROVIDERS: readonly GeoHeaderProvider[] = [
  cloudflareProvider,
  vercelProvider,
  nginxGeoProvider,
  fastlyProvider,
];

/**
 * Resolve IP + geo from the incoming request.
 * Sync, header-only — safe to call on every login.
 */
export function resolveClientLocation(headers: HeadersLike): ClientLocation {
  const ip = clientIpFromHeaders(headers);

  let country: string | null = null;
  let city: string | null = null;
  let region: string | null = null;
  let geoSource: string | null = null;

  for (const provider of GEO_HEADER_PROVIDERS) {
    const hit = provider.fromHeaders(headers);
    const c = cleanGeo(hit.country);
    const ci = cleanGeo(hit.city);
    const r = cleanGeo(hit.region);

    if (!country && c) {
      country = c;
      geoSource = provider.id;
    }
    if (!city && ci) {
      city = ci;
      if (!geoSource) geoSource = provider.id;
    }
    if (!region && r) {
      region = r;
      if (!geoSource) geoSource = provider.id;
    }

    if (country && city) break;
  }

  return { ip, country, city, region, geoSource };
}

/** Persist only known geo fields into ActivityLog.metadata */
export function locationMetaForLog(
  loc: Pick<ClientLocation, "country" | "city" | "region" | "geoSource">
): Record<string, string> {
  const out: Record<string, string> = {};
  if (loc.country) out.country = loc.country;
  if (loc.city) out.city = loc.city;
  if (loc.region) out.region = loc.region;
  if (loc.geoSource) out.geoSource = loc.geoSource;
  return out;
}

/**
 * Optional external Geo-IP enrichment.
 * Disabled by default — enable only when you accept latency + third-party dependency:
 *   GEO_IP_EXTERNAL=1
 *   GEO_IP_EXTERNAL_URL=https://…  (must return JSON with country/city)
 *
 * Never call this from the hot login path unless explicitly opted in.
 */
export async function enrichLocationExternal(
  loc: ClientLocation
): Promise<ClientLocation> {
  if (process.env.GEO_IP_EXTERNAL !== "1") return loc;
  if (loc.country && loc.city) return loc;
  if (!loc.ip) return loc;

  const base = process.env.GEO_IP_EXTERNAL_URL?.trim();
  if (!base) return loc;

  try {
    const url = base.includes("{ip}")
      ? base.replace(/\{ip\}/g, encodeURIComponent(loc.ip))
      : `${base.replace(/\/$/, "")}/${encodeURIComponent(loc.ip)}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return loc;
    const data = (await res.json()) as Record<string, unknown>;
    const country =
      loc.country ??
      cleanGeo(
        typeof data.country === "string"
          ? data.country
          : typeof data.country_code === "string"
            ? data.country_code
            : typeof data.countryCode === "string"
              ? data.countryCode
              : null
      );
    const city =
      loc.city ??
      cleanGeo(typeof data.city === "string" ? data.city : null);
    const region =
      loc.region ??
      cleanGeo(
        typeof data.region === "string"
          ? data.region
          : typeof data.regionName === "string"
            ? data.regionName
            : null
      );

    return {
      ...loc,
      country,
      city,
      region,
      geoSource: loc.geoSource ?? "external",
    };
  } catch {
    // External failure must never break login / journal enrichment
    return loc;
  }
}
