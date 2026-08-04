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
  _locale?: Locale
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Canonical app datetime: DD.MM.YYYY HH:MM:SS in the runtime local timezone
 * (browser on client, host TZ on server). Never appends UTC/Z.
 * Locale arg kept for API stability; pattern is fixed for RU/TJ UX.
 */
export function formatDateTimeLocale(
  date: Date | string | number,
  _locale?: Locale
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
