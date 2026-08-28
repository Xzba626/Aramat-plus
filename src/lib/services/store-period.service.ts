/**
 * Store-scoped period filters — aligned with analytics but extended with yesterday/all.
 */
import { analyticsPeriodFrom, type AnalyticsPeriod } from "@/lib/services/analytics.service";

export type StorePeriod =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "all";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function parseStorePeriod(raw: string | null | undefined): StorePeriod {
  const v = (raw ?? "today").toLowerCase();
  if (
    v === "today" ||
    v === "yesterday" ||
    v === "week" ||
    v === "month" ||
    v === "year" ||
    v === "all"
  ) {
    return v;
  }
  return "today";
}

/** Inclusive date range for Prisma createdAt filters. `all` → null. */
export function storePeriodRange(
  period: StorePeriod,
  now = new Date()
): { from: Date; to: Date } | null {
  if (period === "all") return null;
  if (period === "today") {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (period === "week") {
    return { from: analyticsPeriodFrom("week" as AnalyticsPeriod, now), to: now };
  }
  if (period === "month") {
    return { from: analyticsPeriodFrom("month" as AnalyticsPeriod, now), to: now };
  }
  if (period === "year") {
    return { from: analyticsPeriodFrom("year" as AnalyticsPeriod, now), to: now };
  }
  return { from: startOfDay(now), to: endOfDay(now) };
}

export function createdAtFilter(range: { from: Date; to: Date } | null) {
  if (!range) return {};
  return { createdAt: { gte: range.from, lte: range.to } };
}

export const STORE_PERIOD_OPTIONS: StorePeriod[] = [
  "today",
  "yesterday",
  "week",
  "month",
  "year",
  "all",
];
