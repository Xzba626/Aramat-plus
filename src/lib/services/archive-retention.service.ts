import { prisma } from "@/lib/prisma";
import {
  ARCHIVE_RETENTION_SETTING_KEY,
  DEFAULT_ARCHIVE_RETENTION_DAYS,
} from "@/lib/seed-defaults";
import { LocationType, StoreKind } from "@prisma/client";
import { logActivity } from "@/lib/services/activity-log.service";

export async function getArchiveRetentionDays(companyId: string): Promise<number> {
  const row = await prisma.setting.findUnique({
    where: {
      companyId_key: { companyId, key: ARCHIVE_RETENTION_SETTING_KEY },
    },
  });
  const raw = row?.value;
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "object" && raw && "days" in raw
        ? Number((raw as { days: unknown }).days)
        : typeof raw === "string"
          ? Number(raw)
          : NaN;
  if (!Number.isFinite(n) || n < 1) return DEFAULT_ARCHIVE_RETENTION_DAYS;
  return Math.min(3650, Math.floor(n));
}

export async function setArchiveRetentionDays(
  companyId: string,
  days: number
): Promise<number> {
  const safe = Math.min(3650, Math.max(1, Math.floor(days)));
  await prisma.setting.upsert({
    where: {
      companyId_key: { companyId, key: ARCHIVE_RETENTION_SETTING_KEY },
    },
    create: {
      companyId,
      key: ARCHIVE_RETENTION_SETTING_KEY,
      value: { days: safe },
    },
    update: { value: { days: safe } },
  });
  return safe;
}

/**
 * Permanently delete entities past archive retention.
 * Safe order: products (stock/batches first), categories/brands without products, archived stores.
 */
export async function purgeExpiredArchives(params: {
  companyId: string;
  actorId?: string | null;
}) {
  const days = await getArchiveRetentionDays(params.companyId);
  const cutoff = new Date(Date.now() - days * 86400000);
  const report = {
    days,
    cutoff: cutoff.toISOString(),
    products: 0,
    productsSkippedHistory: 0,
    categories: 0,
    brands: 0,
    stores: 0,
  };

  const products = await prisma.product.findMany({
    where: {
      companyId: params.companyId,
      isActive: false,
      archivedAt: { lte: cutoff },
    },
    select: { id: true },
  });
  for (const p of products) {
    try {
      await hardDeleteProductCascade(p.id);
      report.products += 1;
    } catch (err) {
      if (err instanceof Error && err.message === "PRODUCT_HAS_HISTORY") {
        report.productsSkippedHistory += 1;
        continue;
      }
      throw err;
    }
  }

  const categories = await prisma.category.findMany({
    where: {
      companyId: params.companyId,
      isArchived: true,
      archivedAt: { lte: cutoff },
      products: { none: {} },
    },
    select: { id: true },
  });
  if (categories.length) {
    await prisma.category.deleteMany({
      where: { id: { in: categories.map((c) => c.id) } },
    });
    report.categories = categories.length;
  }

  const brands = await prisma.brand.findMany({
    where: {
      companyId: params.companyId,
      isArchived: true,
      archivedAt: { lte: cutoff },
      products: { none: {} },
    },
    select: { id: true },
  });
  if (brands.length) {
    await prisma.brand.deleteMany({
      where: { id: { in: brands.map((b) => b.id) } },
    });
    report.brands = brands.length;
  }

  const stores = await prisma.store.findMany({
    where: {
      companyId: params.companyId,
      kind: StoreKind.BRANCH,
      isArchived: true,
      archivedAt: { lte: cutoff },
    },
    select: { id: true, name: true },
  });
  for (const s of stores) {
    await forceDeleteStoreCascade({
      companyId: params.companyId,
      storeId: s.id,
      actorId: params.actorId ?? null,
      skipLog: true,
    });
    report.stores += 1;
  }

  if (
    params.actorId &&
    (report.products || report.categories || report.brands || report.stores)
  ) {
    await logActivity({
      userId: params.actorId,
      companyId: params.companyId,
      action: "PRODUCT_DEACTIVATE",
      entityType: "Company",
      entityId: params.companyId,
      comment: `archive-purge:${JSON.stringify(report)}`,
      metadata: report,
    });
  }

  return report;
}

export async function hardDeleteProductCascade(productId: string) {
  // Never destroy sale/transfer history for commercial audit & profit integrity
  const [saleItems, transferItems] = await Promise.all([
    prisma.saleItem.count({ where: { productId } }),
    prisma.transferItem.count({ where: { productId } }),
  ]);
  if (saleItems > 0 || transferItems > 0) {
    throw new Error("PRODUCT_HAS_HISTORY");
  }

  await prisma.$transaction(async (tx) => {
    await tx.reservationItem.deleteMany({ where: { productId } });
    await tx.inventoryItem.deleteMany({ where: { productId } });
    await tx.priceHistory.deleteMany({ where: { productId } });
    await tx.costHistory.deleteMany({ where: { productId } });
    await tx.stockBalance.deleteMany({ where: { productId } });
    await tx.batch.deleteMany({ where: { productId } });
    await tx.giftRule.deleteMany({
      where: { OR: [{ productId }, { giftProductId: productId }] },
    });
    await tx.saleItem.updateMany({
      where: { packagingProductId: productId },
      data: { packagingProductId: null },
    });
    await tx.product.delete({ where: { id: productId } });
  });
}

/** Permanent store delete — clears operational rows for this branch, then removes store. */
export async function forceDeleteStoreCascade(params: {
  companyId: string;
  storeId: string;
  actorId?: string | null;
  skipLog?: boolean;
}) {
  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      companyId: params.companyId,
      kind: StoreKind.BRANCH,
    },
  });
  if (!store) throw new Error("STORE_NOT_FOUND");

  await prisma.$transaction(
    async (tx) => {
      await tx.user.updateMany({
        where: { storeId: store.id },
        data: { storeId: null },
      });
      await tx.store.update({
        where: { id: store.id },
        data: { managerId: null },
      });

      await tx.reservation.updateMany({
        where: { storeId: store.id },
        data: { saleId: null },
      });
      await tx.discountRequest.updateMany({
        where: { storeId: store.id },
        data: { saleId: null },
      });
      await tx.sale.updateMany({
        where: { storeId: store.id },
        data: { discountRequestId: null, discountApprovedById: null },
      });

      await tx.saleReturn.deleteMany({
        where: { sale: { storeId: store.id } },
      });
      await tx.inventorySession.deleteMany({ where: { storeId: store.id } });
      await tx.reservation.deleteMany({ where: { storeId: store.id } });
      await tx.discountRequest.deleteMany({ where: { storeId: store.id } });
      await tx.sale.deleteMany({ where: { storeId: store.id } });
      await tx.transfer.deleteMany({
        where: {
          OR: [{ toStoreId: store.id }, { fromStoreId: store.id }],
        },
      });
      await tx.expense.deleteMany({ where: { storeId: store.id } });
      await tx.stockBalance.deleteMany({
        where: {
          locationType: LocationType.STORE,
          locationId: store.id,
        },
      });
      await tx.batch.deleteMany({
        where: {
          locationType: LocationType.STORE,
          locationId: store.id,
        },
      });
      await tx.store.delete({ where: { id: store.id } });

      if (params.actorId && !params.skipLog) {
        await logActivity({
          tx,
          userId: params.actorId,
          companyId: params.companyId,
          action: "STORE_UPDATE",
          entityType: "Store",
          entityId: store.id,
          comment: `purge:${store.name}`,
        });
      }
    },
    { maxWait: 15_000, timeout: 120_000 }
  );

  return { ok: true as const };
}
