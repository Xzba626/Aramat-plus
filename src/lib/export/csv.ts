import type { Locale } from "@/lib/i18n/types";
import { LOCALE_COOKIE_KEY } from "@/lib/i18n/types";
import { translate } from "@/lib/i18n/translate";
import { formatDateLocale } from "@/lib/i18n/format";
import {
  labelExpensePeriodicity,
  labelSaleStatus,
  type TranslateFn,
} from "@/lib/i18n/labels";
import ru from "@/messages/ru.json";
import tj from "@/messages/tj.json";

type Dict = Record<string, unknown>;

/** Excel in RU/TJ locales expects `;` — comma CSV opens as one column. */
export const CSV_SEP = ";";

export function resolveExportLocale(req: Request): Locale {
  const url = new URL(req.url);
  const q = url.searchParams.get("lang") ?? url.searchParams.get("locale");
  if (q === "tj" || q === "ru") return q;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE_KEY}=([^;]+)`));
  const fromCookie = m?.[1]?.trim();
  if (fromCookie === "tj" || fromCookie === "ru") return fromCookie;
  return "ru";
}

export function exportTranslate(locale: Locale): TranslateFn {
  const dict = (locale === "tj" ? tj : ru) as Dict;
  const fallback = ru as Dict;
  return (key, params) => translate(dict, fallback, key, params);
}

export function csvEscape(v: string | number | boolean | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cells: Array<string | number | boolean | null | undefined>): string {
  return cells.map(csvEscape).join(CSV_SEP);
}

/** Owner-facing datetime: "2 августа 2026, 13:26" */
export function formatExportDateTime(
  date: Date | string | null | undefined,
  locale: Locale
): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const day = formatDateLocale(d, locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const hm = d.toLocaleTimeString(locale === "tj" ? "tg" : "ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day}, ${hm}`;
}

export function formatExportYesNo(active: boolean, t: TranslateFn): string {
  return active ? t("exportCsv.yes") : t("exportCsv.no");
}

export function formatExportPeriodicity(
  periodicity: string | null | undefined,
  t: TranslateFn
): string {
  return labelExpensePeriodicity(periodicity, t);
}

export function formatExportSaleStatus(status: string, t: TranslateFn): string {
  return labelSaleStatus(status, t);
}

export function buildCsvBody(lines: string[]): string {
  // BOM + CRLF so Excel opens UTF-8 columns correctly on Windows
  return "\uFEFF" + lines.join("\r\n");
}
