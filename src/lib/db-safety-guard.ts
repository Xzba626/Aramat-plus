/**
 * Guards against accidental destructive ops on non-local / production databases.
 * Used by seed scripts, recreate-local, stress tests, forensic suites.
 */

const PROD_HOST_HINTS = [
  "contabo",
  "production",
  "prod.",
  "neon.tech",
  "supabase.co",
  "railway.app",
  "render.com",
  "amazonaws.com",
  "rds.amazonaws",
  "digitalocean",
  "vultr",
  "hetzner",
  "vercel-storage",
];

export type DbSafetyContext =
  | "destructive"
  | "stress-seed"
  | "forensic"
  | "read-only-audit";

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
}

export function isLocalDatabaseUrl(url = getDatabaseUrl()): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("localhost") ||
    lower.includes("127.0.0.1") ||
    lower.includes("::1")
  );
}

export function looksLikeProductionUrl(url = getDatabaseUrl()): boolean {
  const lower = url.toLowerCase();
  if (!lower) return false;
  if (isLocalDatabaseUrl(url)) return false;
  for (const hint of PROD_HOST_HINTS) {
    if (lower.includes(hint)) return true;
  }
  // Non-local without explicit allow = treat as remote/production-like
  return true;
}

export function maskDatabaseUrl(url = getDatabaseUrl()): string {
  return url.replace(/:([^:@/]+)@/, ":***@");
}

/**
 * Blocks destructive local-only commands (drop DB, recreate, stress wipe).
 */
export function assertDestructiveLocalOnly(
  operation: string,
  opts?: { allowRemote?: boolean }
): void {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(
      `[db-safety] ${operation}: DATABASE_URL missing. Use local .env only.`
    );
  }

  if (looksLikeProductionUrl(url)) {
    throw new Error(
      `[db-safety] REFUSED ${operation}: DATABASE_URL looks non-local (${maskDatabaseUrl(url)}). ` +
        `Production must never be dropped/reset. Use localhost only.`
    );
  }

  if (!isLocalDatabaseUrl(url) && !opts?.allowRemote) {
    if (process.env.ALLOW_REMOTE_DESTRUCTIVE !== "1") {
      throw new Error(
        `[db-safety] REFUSED ${operation}: not localhost. ` +
          `Set ALLOW_REMOTE_DESTRUCTIVE=1 only if you are certain this is a disposable remote dev DB.`
      );
    }
  }

  if (process.env.BLOCK_PRODUCTION_DESTRUCTIVE === "1" && looksLikeProductionUrl(url)) {
    throw new Error(`[db-safety] BLOCK_PRODUCTION_DESTRUCTIVE=1 active.`);
  }
}

export function assertForensicOrStressSafe(context: DbSafetyContext): void {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(`[db-safety] ${context}: DATABASE_URL missing.`);
  }

  if (looksLikeProductionUrl(url) && process.env.FORENSIC_ALLOW_REMOTE !== "1") {
    throw new Error(
      `[db-safety] REFUSED ${context} on production-like host (${maskDatabaseUrl(url)}). ` +
        `Read-only: set FORENSIC_ALLOW_REMOTE=1. Destructive: never on production.`
    );
  }

  if (!isLocalDatabaseUrl(url) && process.env.FORENSIC_ALLOW_REMOTE !== "1") {
    throw new Error(
      `[db-safety] REFUSED ${context}: DATABASE_URL is not localhost (${maskDatabaseUrl(url)}).`
    );
  }
}
