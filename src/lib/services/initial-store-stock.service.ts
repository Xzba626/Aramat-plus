import {
  AccountingType,
  BatchOrigin,
  LocationType,
  Prisma,
  ProductKind,
  StoreKind,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBatch, getQtyAtLocation } from "@/lib/services/stock.service";
import {
  executeWarehouseToStoreTransferInTx,
} from "@/lib/services/transfer.service";
import { BATCH_NOTE_MARKERS } from "@/lib/i18n/labels";
import {
  resolveAccountingTypeForProductTypeId,
  resolveUnitId,
} from "@/lib/services/product-nomenclature.service";
import { logActivity } from "@/lib/services/activity-log.service";

export type NewProductForInitialStock = {
  name: string;
  brandId?: string | null;
  categoryId?: string | null;
  productTypeId?: string | null;
  accountingType: AccountingType;
  salePrice: number;
  /** Cost for the warehouse INITIAL batch (then FIFO-transferred to store). */
  costPerUnit: number;
};

export type SimilarProductHit = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  accountingType: string;
  salePrice: number;
};

/** Soft duplicate hint — name (+ optional brand / category / type). */
export async function findSimilarProducts(params: {
  companyId: string;
  name: string;
  brandId?: string | null;
  categoryId?: string | null;
  accountingType?: AccountingType;
  excludeId?: string;
}): Promise<SimilarProductHit[]> {
  const name = params.name.trim();
  if (!name) return [];

  const rows = await prisma.product.findMany({
    where: {
      companyId: params.companyId,
      isActive: true,
      kind: ProductKind.STANDARD,
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      AND: [
        {
          OR: [
            { name: { equals: name, mode: "insensitive" } },
            { name: { contains: name, mode: "insensitive" } },
          ],
        },
        ...(params.brandId
          ? [{ OR: [{ brandId: params.brandId }, { brandId: null }] }]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      accountingType: true,
      salePrice: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
      categoryId: true,
      brandId: true,
    },
    take: 8,
    orderBy: { name: "asc" },
  });

  return rows
    .filter((r) => {
      if (
        params.accountingType &&
        r.accountingType !== params.accountingType
      ) {
        // still show, but prefer same type first — keep all for owner choice
      }
      if (params.categoryId && r.categoryId && r.categoryId !== params.categoryId) {
        return r.name.toLowerCase() === name.toLowerCase();
      }
      return true;
    })
    .map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand?.name ?? null,
      category: r.category?.name ?? null,
      accountingType: r.accountingType,
      salePrice: Number(r.salePrice),
    }));
}

/**
 * Restore historical store stock via WH→Store FIFO transfer.
 * Existing product: requires warehouse qty ≥ quantity (no phantom purchase).
 * New product: atomic Product + WH INITIAL batch + Transfer + Store batch.
 */
export async function createInitialStoreStock(params: {
  companyId: string;
  storeId: string;
  actorId: string;
  quantity: number;
  productId?: string;
  newProduct?: NewProductForInitialStock;
  /** When creating new product — skip similar warning. */
  forceCreate?: boolean;
}) {
  if (!(params.quantity > 0)) throw new Error("QTY_MUST_BE_POSITIVE");
  if (!params.productId && !params.newProduct) {
    throw new Error("PRODUCT_REQUIRED");
  }
  if (params.productId && params.newProduct) {
    throw new Error("VALIDATION_ERROR");
  }

  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      companyId: params.companyId,
      isActive: true,
      kind: StoreKind.BRANCH,
      isArchived: false,
    },
  });
  if (!store) throw new Error("TRANSFER_BRANCH_ONLY");

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: params.companyId, isActive: true },
  });
  if (!warehouse) throw new Error("WAREHOUSE_MISSING");

  // ── Existing product path ───────────────────────────────────────────────
  if (params.productId) {
    const product = await prisma.product.findFirst({
      where: {
        id: params.productId,
        companyId: params.companyId,
        isActive: true,
        kind: ProductKind.STANDARD,
      },
    });
    if (!product) throw new Error("PRODUCT_NOT_FOUND");

    const available = await getQtyAtLocation({
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
    });
    if (available < params.quantity) {
      throw new Error("INSUFFICIENT_STOCK");
    }

    const transfer = await prisma.$transaction(
      async (tx) =>
        executeWarehouseToStoreTransferInTx(tx, {
          companyId: params.companyId,
          warehouse: { id: warehouse.id, name: warehouse.name },
          store: { id: store.id, name: store.name },
          createdById: params.actorId,
          items: [{ productId: product.id, quantity: params.quantity }],
          purpose: "INITIAL_STORE_STOCK",
        }),
      { maxWait: 15_000, timeout: 60_000 }
    );

    await notifyLowStockSafe({
      companyId: params.companyId,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      storeId: store.id,
      storeName: store.name,
      productId: product.id,
      productName: product.name,
      accountingType: product.accountingType,
    });

    return {
      mode: "existing" as const,
      productId: product.id,
      transferId: transfer.result.id,
      quantity: params.quantity,
      salePriceUnchanged: true,
    };
  }

  // ── New product path (atomic) ───────────────────────────────────────────
  const np = params.newProduct!;
  const name = np.name.trim();
  if (!name) throw new Error("VALIDATION_ERROR");
  if (!(np.costPerUnit > 0)) throw new Error("COST_REQUIRED_FOR_STOCK");
  if (!(np.salePrice > 0)) throw new Error("VALIDATION_ERROR");

  if (!params.forceCreate) {
    const similar = await findSimilarProducts({
      companyId: params.companyId,
      name,
      brandId: np.brandId,
      categoryId: np.categoryId,
      accountingType: np.accountingType,
    });
    if (similar.length) {
      const err = new Error("PRODUCT_SIMILAR") as Error & {
        similar: SimilarProductHit[];
      };
      err.similar = similar;
      throw err;
    }
  }

  let accountingType = np.accountingType;
  if (np.productTypeId) {
    const resolved = await resolveAccountingTypeForProductTypeId(
      prisma,
      params.companyId,
      np.productTypeId
    );
    if (resolved != null) accountingType = resolved;
  }

  const unitId = await resolveUnitId(
    prisma,
    params.companyId,
    accountingType,
    null
  );

  const outcome = await prisma.$transaction(
    async (tx) => {
      const product = await tx.product.create({
        data: {
          name,
          companyId: params.companyId,
          brandId: np.brandId ?? null,
          categoryId: np.categoryId ?? null,
          productTypeId: np.productTypeId ?? null,
          unitId,
          accountingType,
          kind: ProductKind.STANDARD,
          salePrice: new Prisma.Decimal(np.salePrice),
          defaultCostPerUnit: new Prisma.Decimal(np.costPerUnit),
        },
      });

      await addBatch(tx, {
        productId: product.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: params.quantity,
        costPerUnit: np.costPerUnit,
        notes: BATCH_NOTE_MARKERS.INITIAL_STOCK,
        origin: BatchOrigin.INITIAL,
        createdById: params.actorId,
      });

      await logActivity({
        tx,
        userId: params.actorId,
        companyId: params.companyId,
        action: "PRODUCT_CREATE",
        entityType: "Product",
        entityId: product.id,
        comment: product.name,
        metadata: { via: "INITIAL_STORE_STOCK" },
      });

      const moved = await executeWarehouseToStoreTransferInTx(tx, {
        companyId: params.companyId,
        warehouse: { id: warehouse.id, name: warehouse.name },
        store: { id: store.id, name: store.name },
        createdById: params.actorId,
        items: [{ productId: product.id, quantity: params.quantity }],
        purpose: "INITIAL_STORE_STOCK",
      });

      return { product, transfer: moved.result };
    },
    { maxWait: 15_000, timeout: 90_000 }
  );

  await notifyLowStockSafe({
    companyId: params.companyId,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    storeId: store.id,
    storeName: store.name,
    productId: outcome.product.id,
    productName: outcome.product.name,
    accountingType: outcome.product.accountingType,
  });

  return {
    mode: "created" as const,
    productId: outcome.product.id,
    transferId: outcome.transfer.id,
    quantity: params.quantity,
    salePriceUnchanged: false,
  };
}

async function notifyLowStockSafe(params: {
  companyId: string;
  warehouseId: string;
  warehouseName: string;
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  accountingType: AccountingType;
}) {
  try {
    const {
      getLowStockThresholds,
      maybeNotifyLowMerchandiseStock,
    } = await import("@/lib/services/low-stock-thresholds.service");
    const thresholds = await getLowStockThresholds(params.companyId);
    const whQty = await getQtyAtLocation({
      productId: params.productId,
      locationType: LocationType.WAREHOUSE,
      locationId: params.warehouseId,
    });
    await maybeNotifyLowMerchandiseStock({
      companyId: params.companyId,
      locationType: LocationType.WAREHOUSE,
      locationName: params.warehouseName,
      productId: params.productId,
      productName: params.productName,
      accountingType: params.accountingType,
      qtyAfter: whQty,
      thresholds,
    });
    const stQty = await getQtyAtLocation({
      productId: params.productId,
      locationType: LocationType.STORE,
      locationId: params.storeId,
    });
    await maybeNotifyLowMerchandiseStock({
      companyId: params.companyId,
      locationType: LocationType.STORE,
      locationName: params.storeName,
      productId: params.productId,
      productName: params.productName,
      accountingType: params.accountingType,
      qtyAfter: stQty,
      thresholds,
      storeId: params.storeId,
    });
  } catch (err) {
    console.error("[createInitialStoreStock] low-stock notify failed", err);
  }
}
