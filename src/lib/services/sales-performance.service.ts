import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SALES_PERFORMANCE_THRESHOLDS,
  SALES_PERFORMANCE_REFERENCE_DAYS,
  SALES_PERFORMANCE_THRESHOLDS_SETTING_KEY,
} from "@/lib/seed-defaults";

export type SalesPerformanceThresholds = {
  /** Monthly baseline — piece merchandise (pcs per reference month). */
  monthlyPieces: number;
  /** Monthly baseline — weight merchandise (ml per reference month). */
  monthlyMl: number;
};

export type ProductPerformanceCategory = "LEADER" | "LOW" | "NO_SALES";

export type ScaledSalesPerformanceThresholds = {
  pieces: number;
  ml: number;
  dayCount: number;
  referenceDays: number;
};

function clampPositive(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function parseThresholds(raw: unknown): SalesPerformanceThresholds {
  const d = DEFAULT_SALES_PERFORMANCE_THRESHOLDS;
  if (!raw || typeof raw !== "object") return { ...d };
  const o = raw as Record<string, unknown>;
  return {
    monthlyPieces: clampPositive(Number(o.monthlyPieces), d.monthlyPieces),
    monthlyMl: clampPositive(Number(o.monthlyMl), d.monthlyMl),
  };
}

export async function getSalesPerformanceThresholds(
  companyId: string
): Promise<SalesPerformanceThresholds> {
  const row = await prisma.setting.findUnique({
    where: {
      companyId_key: {
        companyId,
        key: SALES_PERFORMANCE_THRESHOLDS_SETTING_KEY,
      },
    },
  });
  return parseThresholds(row?.value);
}

export async function setSalesPerformanceThresholds(
  companyId: string,
  input: Partial<SalesPerformanceThresholds>
): Promise<SalesPerformanceThresholds> {
  const current = await getSalesPerformanceThresholds(companyId);
  const next: SalesPerformanceThresholds = {
    monthlyPieces: clampPositive(
      Number(input.monthlyPieces ?? current.monthlyPieces),
      DEFAULT_SALES_PERFORMANCE_THRESHOLDS.monthlyPieces
    ),
    monthlyMl: clampPositive(
      Number(input.monthlyMl ?? current.monthlyMl),
      DEFAULT_SALES_PERFORMANCE_THRESHOLDS.monthlyMl
    ),
  };
  await prisma.setting.upsert({
    where: {
      companyId_key: {
        companyId,
        key: SALES_PERFORMANCE_THRESHOLDS_SETTING_KEY,
      },
    },
    create: {
      companyId,
      key: SALES_PERFORMANCE_THRESHOLDS_SETTING_KEY,
      value: next,
    },
    update: { value: next },
  });
  return next;
}

/** Inclusive calendar-day count between period start and end (min 1). */
export function analyticsPeriodDayCount(from: Date, to: Date): number {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  return Math.max(1, days);
}

/**
 * Scale monthly baselines to the actual selected range.
 * Works for any date span — not only today/week/month/year presets.
 */
export function scaleSalesPerformanceThresholds(params: {
  monthly: SalesPerformanceThresholds;
  from: Date;
  to: Date;
  referenceDays?: number;
}): ScaledSalesPerformanceThresholds {
  const referenceDays =
    params.referenceDays ?? SALES_PERFORMANCE_REFERENCE_DAYS;
  const dayCount = analyticsPeriodDayCount(params.from, params.to);
  const factor = dayCount / referenceDays;
  return {
    pieces: params.monthly.monthlyPieces * factor,
    ml: params.monthly.monthlyMl * factor,
    dayCount,
    referenceDays,
  };
}

/**
 * Single source of truth for product performance lists.
 * Returns exactly one category — lists must not overlap.
 *
 * Boundary rule: sold >= scaled threshold → LEADER.
 */
export function getProductPerformanceCategory(params: {
  sold: number;
  accountingType: "PIECE" | "WEIGHT" | string | null | undefined;
  thresholds: Pick<ScaledSalesPerformanceThresholds, "pieces" | "ml">;
}): ProductPerformanceCategory {
  const sold = Number(params.sold);
  if (!(sold > 0)) return "NO_SALES";

  const isWeight = params.accountingType === "WEIGHT";
  const threshold = isWeight ? params.thresholds.ml : params.thresholds.pieces;

  if (sold >= threshold) return "LEADER";
  return "LOW";
}
