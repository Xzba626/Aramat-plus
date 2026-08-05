/** Lightweight UA / IP helpers — no extra deps. */

export type ClientDeviceInfo = {
  /** e.g. "Chrome 139" — empty when unknown */
  browser: string;
  /** e.g. "Windows 10", "Android 15" — empty when unknown */
  os: string;
  /**
   * Form factor for humans: Desktop / Android / iPhone / iPad / Tablet / Mobile
   * Prefer platform name on phones (Android / iPhone) over generic "Mobile".
   */
  deviceType: string;
  /** Optional model from UA (Samsung, Pixel, …) when detectable */
  deviceModel: string | null;
  /**
   * @deprecated Prefer deviceType + deviceModel.
   * Kept as deviceType (or "deviceType · model") for older callers.
   */
  device: string;
  /** Stable key for "same browser+OS" comparison. */
  fingerprint: string;
};

const UNKNOWN_LABEL = ""; // never persist "Unknown" stubs

function matchVersion(ua: string, re: RegExp): string | null {
  const m = ua.match(re);
  if (!m?.[1]) return null;
  const major = m[1].split(".")[0];
  return major || null;
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) {
    const v = matchVersion(ua, /Edg\/([\d.]+)/i);
    return v ? `Edge ${v}` : "Edge";
  }
  if (/OPR\/|Opera/i.test(ua)) {
    const v = matchVersion(ua, /(?:OPR|Opera)\/([\d.]+)/i);
    return v ? `Opera ${v}` : "Opera";
  }
  if (/Firefox\//i.test(ua)) {
    const v = matchVersion(ua, /Firefox\/([\d.]+)/i);
    return v ? `Firefox ${v}` : "Firefox";
  }
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    const v = matchVersion(ua, /Chrome\/([\d.]+)/i);
    return v ? `Chrome ${v}` : "Chrome";
  }
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    const v = matchVersion(ua, /Version\/([\d.]+)/i);
    return v ? `Safari ${v}` : "Safari";
  }
  return UNKNOWN_LABEL;
}

function detectOs(ua: string): string {
  if (/Windows NT 10\.0/i.test(ua)) return "Windows 10/11";
  if (/Windows NT 6\.3/i.test(ua)) return "Windows 8.1";
  if (/Windows NT 6\.1/i.test(ua)) return "Windows 7";
  if (/Windows/i.test(ua)) return "Windows";

  const android = ua.match(/Android\s+([\d.]+)/i);
  if (android) return `Android ${android[1]}`;

  if (/iPhone|iPad|iPod/i.test(ua)) {
    const ios = ua.match(/OS\s+(\d+)[_.](\d+)/i);
    if (ios) return `iOS ${ios[1]}.${ios[2]}`;
    return "iOS";
  }

  const mac = ua.match(/Mac OS X\s+(\d+)[_.](\d+)/i);
  if (mac) return `macOS ${mac[1]}.${mac[2]}`;
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";

  if (/CrOS/i.test(ua)) return "Chrome OS";
  if (/Linux/i.test(ua)) return "Linux";
  return UNKNOWN_LABEL;
}

function detectDeviceModel(ua: string): string | null {
  // Android: "... Linux; Android 15; Pixel 8 Build/..." or "SM-S918B"
  const androidDevice = ua.match(
    /Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/i
  );
  if (androidDevice) {
    const raw = androidDevice[1].trim();
    if (
      raw &&
      !/^wv$/i.test(raw) &&
      !/^[a-z]{2}[-_][a-z]{2}$/i.test(raw) && // locale en-US
      !/^Linux$/i.test(raw) &&
      !/^U$/i.test(raw) &&
      raw.length < 48
    ) {
      return raw.replace(/_/g, " ");
    }
  }
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  return null;
}

function detectDeviceType(ua: string): string {
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) {
    if (/Mobile/i.test(ua)) return "Android";
    return "Tablet";
  }
  if (/Tablet|Kindle|Silk/i.test(ua)) return "Tablet";
  if (/Mobile|Mobi/i.test(ua)) return "Mobile";
  if (/Windows|Macintosh|Mac OS X|Linux|CrOS/i.test(ua)) return "Desktop";
  return UNKNOWN_LABEL;
}

export function parseUserAgent(ua: string | null | undefined): ClientDeviceInfo {
  const raw = ua?.trim() || "";
  if (!raw) {
    return {
      browser: UNKNOWN_LABEL,
      os: UNKNOWN_LABEL,
      deviceType: UNKNOWN_LABEL,
      deviceModel: null,
      device: UNKNOWN_LABEL,
      fingerprint: "unknown",
    };
  }

  const browser = detectBrowser(raw);
  const os = detectOs(raw);
  const deviceType = detectDeviceType(raw);
  const deviceModel = detectDeviceModel(raw);
  const device = deviceModel
    ? `${deviceType || "Device"} · ${deviceModel}`
    : deviceType;

  return {
    browser,
    os,
    deviceType,
    deviceModel,
    device,
    fingerprint: `${browser || "x"}|${os || "x"}|${deviceType || "x"}`.toLowerCase(),
  };
}

/** True for loopback / local-only addresses that must not be shown as "client IP". */
export function isLoopbackOrLocalIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const v = ip.trim().toLowerCase().replace(/^::ffff:/, "");
  return (
    v === "127.0.0.1" ||
    v === "::1" ||
    v === "localhost" ||
    v === "0:0:0:0:0:0:0:1" ||
    v === "0.0.0.0" ||
    v.startsWith("127.")
  );
}

/**
 * Best-effort client IP behind reverse proxies.
 * Prefer public edge headers; skip obvious loopback hops in X-Forwarded-For.
 *
 * Prefer `resolveClientLocation()` from `@/lib/security/client-location` when
 * you also need country/city — that service reuses this IP logic.
 */
export function clientIpFromHeaders(
  headers: Headers | { get(name: string): string | null }
): string | null {
  const candidates: string[] = [];

  const pushList = (raw: string | null) => {
    if (!raw) return;
    for (const part of raw.split(",")) {
      const ip = part.trim().replace(/^\[|\]$/g, "");
      if (ip) candidates.push(ip);
    }
  };

  pushList(headers.get("cf-connecting-ip"));
  pushList(headers.get("true-client-ip"));
  pushList(headers.get("x-vercel-forwarded-for"));
  pushList(headers.get("x-real-ip"));
  pushList(headers.get("x-forwarded-for"));
  pushList(headers.get("x-client-ip"));
  pushList(headers.get("fly-client-ip"));

  const publicIp = candidates.find((ip) => !isLoopbackOrLocalIp(ip));
  if (publicIp) return publicIp;

  // Dev / direct: keep loopback in DB for audit, UI will mask it
  return candidates[0] ?? null;
}

/** Metadata payload for ActivityLog — omits empty/unknown stubs. */
export function deviceMetaForLog(info: ClientDeviceInfo): Record<string, string> {
  const out: Record<string, string> = {};
  if (info.browser) out.browser = info.browser;
  if (info.os) out.os = info.os;
  if (info.deviceType) out.deviceType = info.deviceType;
  if (info.deviceModel) out.deviceModel = info.deviceModel;
  if (info.device) out.device = info.device;
  if (info.fingerprint && info.fingerprint !== "unknown") {
    out.fingerprint = info.fingerprint;
  }
  return out;
}

/** Human IP for UI: null → unavailable; loopback → local marker. */
export function ipForDisplay(ip: string | null | undefined): {
  kind: "ok" | "local" | "unavailable";
  value: string | null;
} {
  if (!ip || !ip.trim()) return { kind: "unavailable", value: null };
  if (isLoopbackOrLocalIp(ip)) return { kind: "local", value: null };
  return { kind: "ok", value: ip.trim() };
}

/** Drop legacy "Unknown" stubs from stored metadata / parsers. */
export function cleanUaLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^unknown$/i.test(v)) return null;
  if (/desktop\s*·\s*unknown/i.test(v)) return null;
  if (/^mobile\s*·\s*unknown$/i.test(v)) return null;
  return v;
}
