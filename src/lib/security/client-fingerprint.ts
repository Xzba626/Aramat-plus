/** Lightweight UA / IP helpers — no extra deps. Never persist "Unknown" stubs. */

export type ClientDeviceInfo = {
  /** e.g. "Chrome 139" or "Chrome Mobile 139" */
  browser: string;
  browserName: string;
  browserVersion: string | null;
  /** e.g. "Windows 10/11", "Android 15" */
  os: string;
  osName: string;
  osVersion: string | null;
  /**
   * Form factor for humans: Desktop / Tablet / Mobile
   * (Laptop cannot be reliably told apart from Desktop via UA — stay Desktop.)
   */
  deviceType: string;
  /** Friendly model when detectable (Samsung Galaxy…, Pixel…, iPhone) */
  deviceModel: string | null;
  /**
   * One-line summary for UI:
   * - with model: "Samsung Galaxy S24"
   * - phone without model: "Android • Chrome"
   * - else: deviceType
   */
  device: string;
  /** Stable key for "same browser+OS" comparison. */
  fingerprint: string;
};

const EMPTY = "";

function matchVersion(ua: string, re: RegExp): string | null {
  const m = ua.match(re);
  if (!m?.[1]) return null;
  const major = m[1].split(".")[0];
  return major || null;
}

/** Map common Android marketing / model tokens → human names (no guessing). */
const ANDROID_MODEL_MAP: Record<string, string> = {
  // Samsung Galaxy S series (examples)
  "SM-S928B": "Samsung Galaxy S24 Ultra",
  "SM-S928U": "Samsung Galaxy S24 Ultra",
  "SM-S926B": "Samsung Galaxy S24+",
  "SM-S921B": "Samsung Galaxy S24",
  "SM-S918B": "Samsung Galaxy S23 Ultra",
  "SM-S911B": "Samsung Galaxy S23",
  "SM-S908B": "Samsung Galaxy S22 Ultra",
  "SM-S901B": "Samsung Galaxy S22",
  "SM-G991B": "Samsung Galaxy S21",
  "SM-A546B": "Samsung Galaxy A54",
  "SM-A536B": "Samsung Galaxy A53",
  "SM-A525F": "Samsung Galaxy A52",
  // Google
  "Pixel 9 Pro": "Google Pixel 9 Pro",
  "Pixel 9": "Google Pixel 9",
  "Pixel 8 Pro": "Google Pixel 8 Pro",
  "Pixel 8": "Google Pixel 8",
  "Pixel 7": "Google Pixel 7",
  // Xiaomi / Redmi (when UA includes full name)
  "23078PND5G": "Xiaomi 13T",
  "2312DRA50G": "Redmi Note 13 Pro",
  "22101316G": "Redmi Note 12",
};

function friendlyAndroidModel(raw: string): string {
  const key = raw.trim();
  const mapped = ANDROID_MODEL_MAP[key] ?? ANDROID_MODEL_MAP[key.toUpperCase()];
  if (mapped) return mapped;

  // Already a marketing name in UA
  if (/^(samsung|xiaomi|redmi|poco|huawei|honor|oppo|vivo|realme|oneplus|google|pixel)\b/i.test(key)) {
    return key.replace(/_/g, " ");
  }
  // Samsung SM-* without map → keep code prefixed (honest, not a guess)
  if (/^SM-[A-Z0-9]+$/i.test(key)) {
    return `Samsung ${key.toUpperCase()}`;
  }
  return key.replace(/_/g, " ");
}

function detectBrowser(ua: string): {
  label: string;
  name: string;
  version: string | null;
} {
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);

  if (/Edg\//i.test(ua)) {
    const v = matchVersion(ua, /Edg\/([\d.]+)/i);
    return { label: v ? `Edge ${v}` : "Edge", name: "Edge", version: v };
  }
  if (/OPR\/|Opera/i.test(ua)) {
    const v = matchVersion(ua, /(?:OPR|Opera)\/([\d.]+)/i);
    return { label: v ? `Opera ${v}` : "Opera", name: "Opera", version: v };
  }
  if (/Firefox\//i.test(ua)) {
    const v = matchVersion(ua, /Firefox\/([\d.]+)/i);
    const name = isMobile ? "Firefox Mobile" : "Firefox";
    return { label: v ? `${name} ${v}` : name, name, version: v };
  }
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    const v = matchVersion(ua, /Chrome\/([\d.]+)/i);
    const name = isMobile ? "Chrome Mobile" : "Chrome";
    return { label: v ? `${name} ${v}` : name, name, version: v };
  }
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    const v = matchVersion(ua, /Version\/([\d.]+)/i);
    const name = /iPhone|iPad/i.test(ua) ? "Safari" : "Safari";
    return { label: v ? `${name} ${v}` : name, name, version: v };
  }
  return { label: EMPTY, name: EMPTY, version: null };
}

function detectOs(ua: string): {
  label: string;
  name: string;
  version: string | null;
} {
  if (/Windows NT 10\.0/i.test(ua)) {
    return { label: "Windows 10/11", name: "Windows", version: "10/11" };
  }
  if (/Windows NT 6\.3/i.test(ua)) {
    return { label: "Windows 8.1", name: "Windows", version: "8.1" };
  }
  if (/Windows NT 6\.1/i.test(ua)) {
    return { label: "Windows 7", name: "Windows", version: "7" };
  }
  if (/Windows/i.test(ua)) {
    return { label: "Windows", name: "Windows", version: null };
  }

  const android = ua.match(/Android\s+([\d.]+)/i);
  if (android) {
    return {
      label: `Android ${android[1]}`,
      name: "Android",
      version: android[1],
    };
  }

  if (/iPhone|iPad|iPod/i.test(ua)) {
    const ios = ua.match(/OS\s+(\d+)[_.](\d+)/i);
    if (ios) {
      const ver = `${ios[1]}.${ios[2]}`;
      return { label: `iOS ${ver}`, name: "iOS", version: ver };
    }
    return { label: "iOS", name: "iOS", version: null };
  }

  const mac = ua.match(/Mac OS X\s+(\d+)[_.](\d+)/i);
  if (mac) {
    const ver = `${mac[1]}.${mac[2]}`;
    return { label: `macOS ${ver}`, name: "macOS", version: ver };
  }
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return { label: "macOS", name: "macOS", version: null };
  }

  if (/CrOS/i.test(ua)) {
    return { label: "Chrome OS", name: "Chrome OS", version: null };
  }
  if (/Linux/i.test(ua)) {
    return { label: "Linux", name: "Linux", version: null };
  }
  return { label: EMPTY, name: EMPTY, version: null };
}

function detectDeviceModel(ua: string): string | null {
  const androidDevice = ua.match(
    /Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/i
  );
  if (androidDevice) {
    const raw = androidDevice[1].trim();
    if (
      raw &&
      !/^wv$/i.test(raw) &&
      !/^[a-z]{2}[-_][a-z]{2}$/i.test(raw) &&
      !/^Linux$/i.test(raw) &&
      !/^U$/i.test(raw) &&
      !/^Android$/i.test(raw) &&
      raw.length < 48
    ) {
      return friendlyAndroidModel(raw);
    }
  }
  // iOS: UA does not expose iPhone 15 vs 14 — keep honest "iPhone" / "iPad"
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  return null;
}

/** Desktop | Tablet | Mobile — never invent Laptop from UA. */
function detectDeviceType(ua: string): string {
  if (/iPad/i.test(ua) || /Tablet|Kindle|Silk/i.test(ua)) return "Tablet";
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "Tablet";
  if (/iPhone|iPod|Mobile|Mobi|Android/i.test(ua)) return "Mobile";
  if (/Windows|Macintosh|Mac OS X|Linux|CrOS/i.test(ua)) return "Desktop";
  return EMPTY;
}

function buildDeviceSummary(
  deviceType: string,
  deviceModel: string | null,
  osName: string,
  browserName: string
): string {
  if (deviceModel && deviceModel !== "iPhone" && deviceModel !== "iPad") {
    return deviceModel;
  }
  if (deviceModel === "iPhone" || deviceModel === "iPad") {
    // iPhone • Safari
    const parts = [deviceModel];
    if (browserName) parts.push(browserName.replace(/\s+Mobile$/i, "").trim());
    return parts.filter(Boolean).join(" • ");
  }
  if (deviceType === "Mobile" || deviceType === "Tablet") {
    const platform = osName || deviceType;
    const browser = browserName || EMPTY;
    if (platform && browser) return `${platform} • ${browser}`;
    return platform || browser || deviceType;
  }
  return deviceType;
}

export function parseUserAgent(ua: string | null | undefined): ClientDeviceInfo {
  const raw = ua?.trim() || "";
  if (!raw) {
    return {
      browser: EMPTY,
      browserName: EMPTY,
      browserVersion: null,
      os: EMPTY,
      osName: EMPTY,
      osVersion: null,
      deviceType: EMPTY,
      deviceModel: null,
      device: EMPTY,
      fingerprint: "unknown",
    };
  }

  const browserInfo = detectBrowser(raw);
  const osInfo = detectOs(raw);
  const deviceType = detectDeviceType(raw);
  const deviceModel = detectDeviceModel(raw);
  const device = buildDeviceSummary(
    deviceType,
    deviceModel,
    osInfo.name,
    browserInfo.name
  );

  return {
    browser: browserInfo.label,
    browserName: browserInfo.name,
    browserVersion: browserInfo.version,
    os: osInfo.label,
    osName: osInfo.name,
    osVersion: osInfo.version,
    deviceType,
    deviceModel,
    device,
    fingerprint: `${browserInfo.label || "x"}|${osInfo.label || "x"}|${deviceType || "x"}`.toLowerCase(),
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
  if (info.browserName) out.browserName = info.browserName;
  if (info.browserVersion) out.browserVersion = info.browserVersion;
  if (info.os) out.os = info.os;
  if (info.osName) out.osName = info.osName;
  if (info.osVersion) out.osVersion = info.osVersion;
  if (info.deviceType) out.deviceType = info.deviceType;
  if (info.deviceModel) out.deviceModel = info.deviceModel;
  if (info.device) out.device = info.device;
  if (info.fingerprint && info.fingerprint !== "unknown") {
    out.fingerprint = info.fingerprint;
  }
  return out;
}

/**
 * Human IP for UI.
 * Loopback is "local" only in development; in production treat as unavailable
 * so owners never see 127.0.0.1 / localhost.
 */
export function ipForDisplay(ip: string | null | undefined): {
  kind: "ok" | "local" | "unavailable";
  value: string | null;
} {
  if (!ip || !ip.trim()) return { kind: "unavailable", value: null };
  if (isLoopbackOrLocalIp(ip)) {
    if (process.env.NODE_ENV === "development") {
      return { kind: "local", value: null };
    }
    return { kind: "unavailable", value: null };
  }
  return { kind: "ok", value: ip.trim() };
}

/** Drop legacy "Unknown" stubs and technical junk from stored metadata / parsers. */
export function cleanUaLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^unknown$/i.test(v)) return null;
  if (/^n\/?a$/i.test(v)) return null;
  if (/^null$/i.test(v)) return null;
  if (/^undefined$/i.test(v)) return null;
  if (/desktop\s*[·•]\s*unknown/i.test(v)) return null;
  if (/^mobile\s*[·•]\s*unknown$/i.test(v)) return null;
  if (/^localhost$/i.test(v)) return null;
  if (/^127\.0\.0\.1$/i.test(v)) return null;
  if (/^::1$/i.test(v)) return null;
  if (/mozilla\/\d/i.test(v)) return null; // raw UA leak
  return v;
}
