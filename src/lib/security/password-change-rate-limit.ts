/**
 * Throttle wrong currentPassword attempts on change-password.
 * Complements login account lockout (auth.ts).
 */

type Bucket = { fails: number; windowStart: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;
const BLOCK_MS = 15 * 60_000;

function prune(now: number) {
  if (buckets.size < 2000) return;
  for (const [k, b] of buckets) {
    if (b.blockedUntil < now && now - b.windowStart > WINDOW_MS) {
      buckets.delete(k);
    }
  }
}

export function isPasswordChangeBlocked(userId: string): boolean {
  const now = Date.now();
  const b = buckets.get(userId);
  if (!b) return false;
  return b.blockedUntil > now;
}

export function recordPasswordChangeFailure(userId: string): void {
  const now = Date.now();
  prune(now);
  let b = buckets.get(userId);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { fails: 0, windowStart: now, blockedUntil: 0 };
    buckets.set(userId, b);
  }
  b.fails += 1;
  if (b.fails >= MAX_FAILS) {
    b.blockedUntil = now + BLOCK_MS;
  }
}

export function clearPasswordChangeFailures(userId: string): void {
  buckets.delete(userId);
}
