export type Locale = "ru" | "tj";

export const LOCALES: Locale[] = ["ru", "tj"];
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_STORAGE_KEY = "ap_locale";
export const LOCALE_COOKIE_KEY = "ap_locale";

/** BCP-47 tags for Intl / date formatting */
export function localeToBcp47(locale: Locale): string {
  return locale === "tj" ? "tg" : "ru-RU";
}

export function htmlLang(locale: Locale): string {
  return locale === "tj" ? "tg" : "ru";
}

export function isLocale(value: unknown): value is Locale {
  return value === "ru" || value === "tj";
}
