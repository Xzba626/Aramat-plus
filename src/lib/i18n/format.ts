import type { Locale } from "@/lib/i18n/types";
import { localeToBcp47 } from "@/lib/i18n/types";

/** Unified money: "20 100 сомони" / "20 100 сомонӣ" (or short "с.") */
export function formatMoneyLocale(
  value: number | string,
  locale: Locale,
  opts?: { short?: boolean }
): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  const formatted = Number(n || 0)
    .toLocaleString("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })
    .replace(/,/g, " ");
  if (opts?.short) return `${formatted} с.`;
  const unit = locale === "tj" ? "сомонӣ" : "сомони";
  return `${formatted} ${unit}`;
}

export function formatDateLocale(
  date: Date | string | number,
  locale: Locale,
  opts?: Intl.DateTimeFormatOptions
): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(localeToBcp47(locale), opts ?? {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTimeLocale(
  date: Date | string | number,
  locale: Locale
): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString(localeToBcp47(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeLocale(
  date: Date | string | number,
  locale: Locale
): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(localeToBcp47(locale), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
