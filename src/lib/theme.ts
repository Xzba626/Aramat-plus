export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "ap_theme";
export const THEME_COOKIE_KEY = "ap_theme";
export const DEFAULT_THEME: ThemeMode = "light";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function applyThemeClass(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
}

export function persistTheme(theme: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.cookie = `${THEME_COOKIE_KEY}=${theme};path=/;max-age=31536000;SameSite=Lax`;
    applyThemeClass(theme);
  } catch {
    /* ignore */
  }
}

export function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const fromLs = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(fromLs)) return fromLs;
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${THEME_COOKIE_KEY}=`));
    const fromCookie = match?.split("=")[1];
    if (isThemeMode(fromCookie)) return fromCookie;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}
