/**
 * In-memory IP login throttle (single Node/PM2 instance).
 * Complements per-account lockout in auth.ts.
 */

type IpBucket = { fails: number; windowStart: number; blockedUntil: number };

const ipBuckets = new Map<string, IpBucket>();

const WINDOW_MS = 15 * 60_000;
/** Max failed attempts per IP per window before block. */
const MAX_FAILS = 25;
const BLOCK_MS = 15 * 60_000;

function prune(now: number) {
  if (ipBuckets.size < 5000) return;
  for (const [ip, b] of ipBuckets) {
    if (b.blockedUntil < now && now - b.windowStart > WINDOW_MS) {
      ipBuckets.delete(ip);
    }
  }
}

export function isIpLoginBlocked(ip: string | null | undefined): boolean {
  if (!ip || ip === "unknown") return false;
  const now = Date.now();
  const b = ipBuckets.get(ip);
  if (!b) return false;
  return b.blockedUntil > now;
}

export function recordIpLoginFailure(ip: string | null | undefined): void {
  if (!ip || ip === "unknown") return;
  const now = Date.now();
  prune(now);
  let b = ipBuckets.get(ip);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { fails: 0, windowStart: now, blockedUntil: 0 };
    ipBuckets.set(ip, b);
  }
  b.fails += 1;
  if (b.fails >= MAX_FAILS) {
    b.blockedUntil = now + BLOCK_MS;
  }
}

export function clearIpLoginFailures(ip: string | null | undefined): void {
  if (!ip) return;
  ipBuckets.delete(ip);
}

/**
 * Progressive account lock after consecutive failures:
 * 5 → 30s, 6 → 60s, 7 → 120s, then exponential (cap 15m).
 */
export function accountLockDurationMs(failCount: number): number | null {
  if (failCount < 5) return null;
  if (failCount === 5) return 30_000;
  if (failCount === 6) return 60_000;
  if (failCount === 7) return 120_000;
  const exp = 120_000 * 2 ** (failCount - 7);
  return Math.min(15 * 60_000, exp);
}
