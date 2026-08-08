/**
 * Plain-text sanitization for user-facing names/notes stored in DB.
 * React escapes text nodes, but we reject HTML/script payloads at the API
 * so they never land in storage (and never reach future HTML sinks).
 */

const UNSAFE_PATTERN =
  /[<>]|javascript\s*:|data\s*:\s*text\/html|\bon\w+\s*=|<\s*\/?\s*script|<\s*iframe|<\s*object|<\s*embed|<\s*svg|<\s*img/i;

export function containsUnsafeMarkup(value: string): boolean {
  return UNSAFE_PATTERN.test(value);
}

/** Strip tags and control chars; does not allow markup through. */
export function stripMarkup(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\u0000/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validate + normalize plain text for names.
 * Throws Error("UNSAFE_INPUT") when markup / event handlers are present.
 */
export function sanitizePlainText(raw: string, maxLen: number): string {
  const normalized = raw.normalize("NFKC").replace(/\u0000/g, "").trim();
  if (!normalized) {
    throw new Error("VALIDATION_ERROR");
  }
  if (containsUnsafeMarkup(normalized)) {
    throw new Error("UNSAFE_INPUT");
  }
  const cleaned = stripMarkup(normalized);
  if (!cleaned) {
    throw new Error("VALIDATION_ERROR");
  }
  if (cleaned.length > maxLen) {
    return cleaned.slice(0, maxLen).trim();
  }
  return cleaned;
}

/** Optional notes/descriptions — empty allowed; markup rejected. */
export function sanitizeOptionalText(
  raw: string | null | undefined,
  maxLen: number
): string | null {
  if (raw == null) return null;
  const trimmed = raw.normalize("NFKC").replace(/\u0000/g, "").trim();
  if (!trimmed) return null;
  if (containsUnsafeMarkup(trimmed)) {
    throw new Error("UNSAFE_INPUT");
  }
  const cleaned = stripMarkup(trimmed);
  if (!cleaned) return null;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen).trim() : cleaned;
}

/** Best-effort cleanup for existing DB rows (no throw). */
export function scrubStoredLabel(raw: string | null | undefined): string {
  if (raw == null) return "";
  const cleaned = stripMarkup(String(raw));
  return cleaned || "—";
}
