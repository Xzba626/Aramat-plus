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

/**
 * Human-readable expense description for Excel.
 * Strips legacy `sale:<cuid>` technical prefixes from bottle opex rows.
 */
export function formatExpenseDescriptionForExport(
  description: string | null | undefined,
  t: TranslateFn
): string {
  const raw = (description ?? "").trim();
  if (!raw) return "";

  // New marker: AUTO_BOTTLE or AUTO_BOTTLE|<productName>
  if (raw === "AUTO_BOTTLE") {
    return t("exportCsv.expenseBottleSale");
  }
  const autoNamed = raw.match(/^AUTO_BOTTLE\|(.+)$/);
  if (autoNamed) {
    return t("exportCsv.expenseBottleSaleNamed", { name: autoNamed[1].trim() });
  }

  // Legacy: "sale:cmse8h3g… · Perfume Name" or "sale:cmse8h3g…"
  const legacy = raw.match(/^sale:[a-z0-9]+(?:\s*[·•|]\s*(.+))?$/i);
  if (legacy) {
    const name = legacy[1]?.trim();
    return name
      ? t("exportCsv.expenseBottleSaleNamed", { name })
      : t("exportCsv.expenseBottleSale");
  }

  // Any leftover sale:<id> substring — strip the tech token
  if (/sale:[a-z0-9]{8,}/i.test(raw)) {
    const cleaned = raw
      .replace(/sale:[a-z0-9]+/gi, "")
      .replace(/^[·•|\-\s]+|[·•|\-\s]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned
      ? t("exportCsv.expenseBottleSaleNamed", { name: cleaned })
      : t("exportCsv.expenseBottleSale");
  }

  return raw;
}

export function buildCsvBody(lines: string[]): string {
  // BOM + CRLF so Excel opens UTF-8 columns correctly on Windows
  return "\uFEFF" + lines.join("\r\n");
}
