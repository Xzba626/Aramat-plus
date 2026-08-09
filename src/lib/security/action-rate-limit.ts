/**
 * Simple per-key sliding window for authenticated write floods (API4).
 * In-memory — suitable for single Node/PM2 instance.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

function prune(now: number, windowMs: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) {
    if (now - b.windowStart > windowMs * 2) buckets.delete(k);
  }
}

/**
 * @returns true if the action is allowed; false if over limit.
 */
export function allowActionRate(
  key: string,
  max: number,
  windowMs: number
): boolean {
  const now = Date.now();
  prune(now, windowMs);
  let b = buckets.get(key);
  if (!b || now - b.windowStart > windowMs) {
    b = { count: 0, windowStart: now };
    buckets.set(key, b);
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}
