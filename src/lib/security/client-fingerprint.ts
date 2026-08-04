/** Lightweight UA parsing — no extra deps. */

export type ClientDeviceInfo = {
  browser: string;
  device: string;
  os: string;
  /** Stable key for "same browser+OS" comparison. */
  fingerprint: string;
};

export function parseUserAgent(ua: string | null | undefined): ClientDeviceInfo {
  const raw = ua?.trim() || "";
  if (!raw) {
    return {
      browser: "Unknown",
      device: "Unknown",
      os: "Unknown",
      fingerprint: "unknown",
    };
  }

  let browser = "Unknown";
  if (/Edg\//i.test(raw)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(raw)) browser = "Opera";
  else if (/Chrome\//i.test(raw) && !/Edg\//i.test(raw)) browser = "Chrome";
  else if (/Firefox\//i.test(raw)) browser = "Firefox";
  else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw)) browser = "Safari";

  let os = "Unknown";
  if (/Windows/i.test(raw)) os = "Windows";
  else if (/Android/i.test(raw)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(raw)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(raw)) os = "macOS";
  else if (/Linux/i.test(raw)) os = "Linux";

  let formFactor = "Desktop";
  if (/iPad|Tablet/i.test(raw)) formFactor = "Tablet";
  else if (/Mobile|Android|iPhone|iPod/i.test(raw)) formFactor = "Mobile";

  return {
    browser,
    os,
    device: `${formFactor} · ${os}`,
    fingerprint: `${browser}|${os}|${formFactor}`.toLowerCase(),
  };
}

export function clientIpFromHeaders(headers: Headers): string | null {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}
