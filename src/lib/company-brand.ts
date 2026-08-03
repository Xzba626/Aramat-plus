/** Default / fallback brand when DB has no company yet. Canonical spelling: Aramat (A). */
export const DEFAULT_COMPANY_NAME = "Aramat Plus";

export function resolveCompanyName(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed || DEFAULT_COMPANY_NAME;
}

/**
 * Split "… Plus" so the last word can be accent-colored in the chrome.
 * Does not invent "AROMAT" — uses the company name as stored.
 */
export function splitBrandForMark(name: string): {
  head: string;
  accent: string | null;
} {
  const parts = resolveCompanyName(name).split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 1].toLowerCase() === "plus") {
    return {
      head: parts.slice(0, -1).join(" "),
      accent: parts[parts.length - 1],
    };
  }
  return { head: parts.join(" ") || DEFAULT_COMPANY_NAME, accent: null };
}
