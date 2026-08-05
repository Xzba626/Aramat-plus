/**
 * Local Cursor / CI proof scripts write into the same DB as the owner UI
 * (no separate test database). Names follow stable prefixes so we can
 * exclude them from production-facing surfaces.
 */

const PROOF_NAME =
  /^(ZT\b|ZT Rev\b|WaveG\b|\[ARCHIVED TEST\])/i;

export function isProofArtifactName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  if (!n) return false;
  return PROOF_NAME.test(n);
}

/** Message body from maybeNotifyLowMerchandiseStock / bottle alerts. */
export function isProofArtifactNotificationMessage(
  message: string | null | undefined
): boolean {
  const m = message ?? "";
  return (
    /«ZT Rev\b/i.test(m) ||
    /«ZT\b/i.test(m) ||
    /«WaveG\b/i.test(m) ||
    /\[ARCHIVED TEST\]/i.test(m)
  );
}
